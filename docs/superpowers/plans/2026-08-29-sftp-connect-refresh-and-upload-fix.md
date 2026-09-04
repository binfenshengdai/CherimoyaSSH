# SFTP 连接后自动刷新 & 上传修复 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复两个 SFTP bug：(1) 连接成功后不自动列出文件，必须手动点刷新；(2) 上传进度卡在 0% 且永不完成。

**Architecture:** Bug 1 是前端 `SftpPane` 只在 `onMounted` 加载一次（此时 `sessionId` 还是 `"pending"`），之后 `sessionId` 变为真实 uuid 没有 watch 触发重加载。修复：加 `watch(() => props.sessionId)`，在 id 变为非 `"pending"` 时调用 `loadFiles()`。Bug 2 是前后端契约不匹配——前端 `useSftp.uploadFile` 发送 `append` 字段逐块追加，但 Rust `sftp_write` 命令不接受 `append` 参数，且 `russh-sftp` 的 `write()` 只用 `OpenFlags::WRITE` 打开文件（新文件不存在 → 首块即失败 → 进度停在 0%）。修复：后端增加 `SftpHandle::append()` 用 `OpenFlags::CREATE | WRITE | APPEND` 打开，`sftp_write` 命令增加 `append: Option<bool>` 参数分流。前端 `useSftp.ts` 无需改动（已正确发送 `append`）。

**Tech Stack:** Vue 3 `<script setup>`、TypeScript、Tauri 2、Rust、russh-sftp 2.4.0

## Global Constraints

- 前端 ID 生成：`Date.now().toString(36) + Math.random().toString(36).slice(2, 8)`；Rust 用 uuid v4
- 注释与 UI 字符串使用中文
- 代码的 commit 和 push 需要和用户确认，不能擅自提交
- 不需要读 target 下的代码
- 本项目没有 linter，`vue-tsc --noEmit` 是构建流程唯一静态检查
- 测试用 vitest；Rust 侧用 `cargo check` 类型检查

---

## 文件结构

| 文件 | 职责 | 动作 |
|------|------|------|
| `src/components/SftpPane.vue` | SFTP 文件浏览器 UI | **修改** — 加 `watch(sessionId)` 实现自动刷新 |
| `src/composables/useSftp.ts` | SFTP 状态/上传逻辑 | 不改（已正确发 `append`） |
| `src-tauri/src/sftp/session.rs` | `SftpHandle` 封装 russh-sftp | **修改** — 加 `append()` 方法 |
| `src-tauri/src/sftp/commands.rs` | Tauri 命令桥接 | **修改** — `sftp_write` 加 `append` 参数 |
| `src/composables/__tests__/useSftp.test.ts` | 现有 composable 测试 | 不改 |

---

## Task 1: 连接成功后自动刷新文件列表

**Files:**
- Modify: `src/components/SftpPane.vue:3,38`
- Test: `src/composables/__tests__/useSftp.test.ts`（本任务不改测试文件，走人工验证）

**Interfaces:**
- Consumes: `props.sessionId`（由 `App.vue` 传入，从 `"pending"` 变为真实 uuid）
- Produces: 行为变更——`sessionId` 变化时自动调用 `loadFiles()`

- [ ] **Step 1: 在 `SftpPane.vue` 增加 `watch`**

把 `script setup` 顶部的 `onMounted(loadFiles)` 替换为带 guard 的 watch。修改两处：

① 第 3 行，导入加上 `watch`：
```ts
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
```

② 第 38 行，把：
```ts
onMounted(loadFiles);
```
替换为：
```ts
// 连接成功后 sessionId 从 "pending" 变为真实 uuid，此时自动加载目录
watch(
  () => props.sessionId,
  (id) => {
    if (id && id !== "pending") {
      loadFiles();
    }
  },
);
```

- [ ] **Step 2: 类型检查**

Run: `npm run build`（执行 `vue-tsc --noEmit && vite build`，确保无 TS 错误）
Expected: 编译通过。若只需类型检查可跑 `npx vue-tsc --noEmit`

- [ ] **Step 3: 人工验证**

Run: `npm run tauri dev`
Expected:
1. 侧边栏点击主机 → SFTP 连接 → 进入后**立即显示**根目录文件列表，无需点刷新
2. 切换目录、刷新按钮仍正常
3. 关闭 SFTP 标签再重新连接，仍自动加载

- [ ] **Step 4: 提交**

```bash
git add src/components/SftpPane.vue
git commit -m "fix: SFTP 连接成功后自动刷新文件列表"
```
（提交前与用户确认）

---

## Task 2: 后端增加 `SftpHandle::append()` 方法

**Files:**
- Modify: `src-tauri/src/sftp/session.rs:54-57`

**Interfaces:**
- Consumes: `russh_sftp::protocol::OpenFlags`、`tokio::io::AsyncWriteExt`
- Produces: `SftpHandle::append(path, data)` — 供 `commands.rs` 的 `sftp_write` 在 `append=Some(true)` 时调用

- [ ] **Step 1: 在 `session.rs` 的 `write` 方法后增加 `append` 方法**

把：
```rust
    pub async fn write(&self, path: &str, data: &[u8]) -> Result<(), String> {
        let session = self.session.lock().await;
        session.write(path, data).await.map_err(|e| e.to_string())
    }
```
替换为：
```rust
    pub async fn write(&self, path: &str, data: &[u8]) -> Result<(), String> {
        let session = self.session.lock().await;
        session.write(path, data).await.map_err(|e| e.to_string())
    }

    /// 追加写入：用 CREATE | WRITE | APPEND 打开，支持分块上传
    pub async fn append(&self, path: &str, data: &[u8]) -> Result<(), String> {
        use russh_sftp::protocol::OpenFlags;
        use tokio::io::AsyncWriteExt;
        let session = self.session.lock().await;
        let mut file = session
            .open_with_flags(path, OpenFlags::CREATE | OpenFlags::WRITE | OpenFlags::APPEND)
            .await
            .map_err(|e| e.to_string())?;
        file.write_all(data)
            .await
            .map_err(|e| e.to_string())?;
        file.shutdown().await.map_err(|e| e.to_string())?;
        Ok(())
    }
```

- [ ] **Step 2: 类型检查**

Run: `cd src-tauri && cargo check`
Expected: 编译通过，无错误

- [ ] **Step 3: 提交**

```bash
git add src-tauri/src/sftp/session.rs
git commit -m "feat: SftpHandle 增加 append 方法支持分块上传"
```
（提交前与用户确认）

---

## Task 3: `sftp_write` 命令接受 `append` 参数

**Files:**
- Modify: `src-tauri/src/sftp/commands.rs:46-55`

**Interfaces:**
- Consumes: `SftpHandle::write`（原有）、`SftpHandle::append`（Task 2 产出）
- Produces: `sftp_write` 命令新签名——增加 `append: Option<bool>` 参数

- [ ] **Step 1: 修改 `sftp_write` 命令**

把：
```rust
#[tauri::command]
pub async fn sftp_write(
    manager: State<'_, SftpManager>,
    session_id: String,
    path: String,
    data: Vec<u8>,
) -> Result<(), String> {
    let handle = manager.get(&session_id)?;
    handle.write(&path, &data).await
}
```
替换为：
```rust
#[tauri::command]
pub async fn sftp_write(
    manager: State<'_, SftpManager>,
    session_id: String,
    path: String,
    data: Vec<u8>,
    append: Option<bool>,
) -> Result<(), String> {
    let handle = manager.get(&session_id)?;
    if append == Some(true) {
        handle.append(&path, &data).await
    } else {
        handle.write(&path, &data).await
    }
}
```

- [ ] **Step 2: 类型检查**

Run: `cd src-tauri && cargo check`
Expected: 编译通过，无错误

- [ ] **Step 3: 人工验证**

Run: `npm run tauri dev`
Expected:
1. 进入 SFTP，上传一个文件 → 进度从 0% 平滑增长到 100%，状态变为「完成」
2. 上传完成后文件列表自动刷新（Task 1 的 `loadFiles`），能看到新文件
3. 上传多个文件均成功
4. 大文件（如 >1MB）分块上传成功，文件内容完整

- [ ] **Step 4: 提交**

```bash
git add src-tauri/src/sftp/commands.rs
git commit -m "fix: sftp_write 支持 append 参数修复分块上传"
```
（提交前与用户确认）

---

## Task 4: 整体验证

- [ ] **Step 1: 前端类型检查**

Run: `npm run build`
Expected: 通过

- [ ] **Step 2: 运行前端测试**

Run: `npm test`
Expected: 全部通过（现有 useSftp 测试不受影响）

- [ ] **Step 3: Rust 类型检查**

Run: `cd src-tauri && cargo check`
Expected: 通过

- [ ] **Step 4: 端到端人工验证**

Run: `npm run tauri dev`
Expected 完整流程：
1. 侧边栏 → SFTP 连接 → **立即显示**文件列表
2. 上传文件 → 进度正常增长到 100% → 文件出现
3. 刷新按钮、导航、删除、重命名等其他功能不受影响
