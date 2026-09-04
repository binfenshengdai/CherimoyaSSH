# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 提供本仓库的代码工作指引。

## 项目概述

**Cherimoya SSH** — 基于 Tauri v2 + Vue 3 + TypeScript 构建的桌面 SSH 客户端。Rust 后端（`russh`）处理 SSH 连接，通过 Tauri 事件向前端流式传输输出，`xterm.js` 渲染终端。单窗口应用，深色主题，无系统窗口装饰（自定义标题栏）。

## 常用命令

```bash
npm run dev            # Vite 开发服务器，http://localhost:1420（端口 1420，strict）
npm run tauri dev      # 运行完整 Tauri 应用（beforeDevCommand = npm run dev）
npm run build          # vue-tsc --noEmit && vite build
npm test               # vitest run（全部测试）
npx vitest run src/composables/__tests__/useHosts.test.ts   # 运行单个测试文件
cd src-tauri && cargo check     # 仅类型检查 Rust，不构建应用
cd src-tauri && cargo tauri dev # 从 Rust 侧运行 Tauri 应用
```

本项目**没有 linter** —— `vue-tsc --noEmit` 是构建流程中唯一的静态检查。

## 架构

### 状态管理：模块级单例 Composable

三个 composable（`useHosts`、`useTabs`、`useConnections`）的状态保存在**模块作用域**，而非组件实例内。多次调用 `useHosts()` 返回的是同一份共享的 `hosts`/`categories` ref。这是核心状态模式 —— 没有使用 Pinia/Vuex。

**测试注意事项**：测试必须在 `beforeEach` 中调用导出的 `_resetForTests()`，否则状态会在用例间泄漏。

### SSH 连接流程（必读 —— 横跨 6 个文件）

1. 用户在 `Sidebar` 中点击主机 → 触发 `connect` 事件 → `App.handleConnect`
2. `App` 先调用 `openTab(...)` 并传入 `connectionId: "pending"`，**然后** await `useConnections.connect()` —— 标签页会立刻显示"正在连接"
3. `connect()` 调用 Tauri 命令 `ssh_connect`，传入主机凭据
4. Rust 侧 `ssh_connect`（commands.rs）→ `ConnectionManager.connect()`（manager.rs）→ 启动 `russh` 会话（session.rs）。每个会话分配一个 UUID，返回 UUID + `mpsc` 输出接收器
5. 一个 Rust 任务将输出接收器转发为名为 `ssh_output_{uuid}` 的 Tauri 事件；通道关闭时发出 `ssh_closed_{uuid}`
6. `useConnections.connect()` 监听这些事件，分发到订阅者集合（`outputListeners` / `closeListeners`）。`TerminalPane` 通过 `onOutput`/`onClose` 订阅

`TerminalPane` 监听 `props.connectionId`；当它从 `"pending"` 变为真实 UUID 时调用 `setupListeners()`。调整大小使用 `ResizeObserver` + window resize，调用 `ssh_resize`。

### 各 Composable 职责

- **`useHosts`** —— 主机/分类的增删改；通过深度 `watch` 持久化到 `BaseDirectory.AppData` 目录下的 `hosts.json`。默认分类 `id: "default"` 受保护（不可删除）。
- **`useTabs`** —— 打开/关闭/激活标签页。`openTab` 按 `connectionId` 去重（不会重复打开已有会话的标签页）。
- **`useConnections`** —— 封装 Tauri 命令（`ssh_connect`/`ssh_send`/`ssh_resize`/`ssh_disconnect`）和事件监听总线。用 `reactive` 映射追踪 `connectionStates`。

### Rust SSH 模块（`src-tauri/src/ssh/`）

- `session.rs` —— `connect_ssh()` 建立 russh 会话，请求 PTY（`xterm`，80×24）和 shell，生成一个 tokio 任务通过三个 mpsc 通道多路复用输入/调整大小/输出。**服务端主机密钥无条件接受**（`check_server_key` 返回 true）—— known_hosts 验证是 TODO。
- `manager.rs` —— `ConnectionManager` 持有 `Arc<Mutex<HashMap<String, SessionHandle>>>`，以 UUID 为键。
- `commands.rs` —— 四个 `#[tauri::command]` 函数，桥接前端 ↔ 管理器。

### 窗口与 UI

- `tauri.conf.json` 设置 `decorations: false` → `TitleBar.vue` 渲染自定义最小化/最大化/关闭按钮和 `data-tauri-drag-region` 拖拽区域
- 全局主题变量（`--bg-primary`、`--accent` 等）定义在 `style.css` 中，所有组件通过 `scoped` 样式引用
- 布局：`TitleBar` → body(`Sidebar` | main(`TabBar` | `TerminalPane`))。只有当前激活的 `TerminalPane` 显示（其余为 `display: none`）

### 类型

所有共享类型定义在 `src/types/ssh.ts`：`Host`、`Category`、`Tab`、`ConnectionState`、`HostInput`。

## 约定

- Vue SFC 使用 `<script setup lang="ts">`；所有组件为函数式作用域，样式均为 `scoped`
- 前端 ID 生成方式：`Date.now().toString(36) + Math.random().toString(36).slice(2, 8)`（非 UUID）；Rust 侧使用 `uuid` v4
- 注释与 UI 字符串使用中文
- 代码的commit和push需要和我确认，不能擅自提交
- 不需要读target下的代码
