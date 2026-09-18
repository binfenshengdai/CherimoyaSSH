# 应用升级（自动更新）设计

## 概述

为 Cherimoya SSH 增加「检查更新 → 下载 → 安装」能力，目标是让客户端自动获取 GitHub Release 上发布的最新版本，与本机版本比较，有新版本时提示并可下载安装。

**核心原则**：只依赖 GitHub，不搭建任何独立的更新服务器。GitHub Release 同时充当「更新清单存储」和「安装包下载源」。

---

## 现状分析

当前发布流程（`.github/workflows/build.yml`）：

1. 推送 `v*.*.*` tag 触发 CI
2. Windows / macOS 两个 job 分别构建，用 `tauri-apps/tauri-action` 产出安装包
3. 用 `softprops/action-gh-release` 把 `.msi` / `.exe` / `.dmg` / `.tar.gz` 直接上传到 Release

缺失的部分：

- **没有更新清单（manifest）**：客户端无从得知「最新版本号是多少、下载地址在哪」
- **没有数字签名**：即使提供下载地址，客户端也无法验证安装包是否被篡改

版本号来源：`src-tauri/tauri.conf.json` 的 `version` 字段（当前为 `1.0.3`），`@tauri-apps/api/app` 的 `getVersion()` 读的就是它。发布时 tag、`tauri.conf.json`、Release 三者版本必须一致。

---

## 其他应用是怎么实现更新的

桌面应用的自动更新几乎都遵循同一套「拉清单 → 比版本 → 下载 → 验签 → 安装/替换」流程，只是实现载体不同：

| 框架 | 更新组件 | 更新源格式 | 签名机制 |
|------|---------|-----------|---------|
| macOS 原生 | Sparkle | `appcast.xml`（RSS） | EdDSA |
| Electron | `electron-updater` | `latest.yml`（NPM 风格） | 无强制/私有 keypair |
| **Tauri v2** | `tauri-plugin-updater` | `latest.json`（自定义 JSON） | **Ed25519 强制验签** |
| Windows 派发 | Squirrel / MSIX | `RELEASES` / AppInstaller | 依赖平台签名 |

共同点：

1. 云端有一份**更新清单**，内容至少包含 `最新版本号` + `各平台下载 URL` + `包哈希/签名`
2. 客户端启动或手动点击时拉取清单，用 semver 比较 `清单版本` 与 `当前版本`
3. 有新版本 → 下载对应平台安装包 → **校验签名/哈希** → 执行安装并重启

> 关键点：**签名校验是防篡改的核心**。如果只比版本号 + 直接下载安装，攻击者只要能在传输层或 GitHub 侧伪造一个「版本号更高」的包，就能让用户装上恶意程序。对于一个处理 SSH 密码的客户端，这一点尤其重要。

---

## 方案对比

### 方案 A：Tauri 官方 Updater 插件（推荐）

用 `tauri-plugin-updater`，把 GitHub Release 当作唯一的更新后端。

- **更新源就是 GitHub**，无需自建网站
- 插件内置：版本比较、平台/架构匹配、下载、Ed25519 签名校验、安装并重启
- 前端只需 `check()` + `downloadAndInstall()` 两行

**如何做到「只用 GitHub、无独立网站」**：GitHub 提供一个稳定重定向地址

```
https://github.com/{owner}/{repo}/releases/latest/download/{asset-name}
```

该 URL 会 302 到**最新 Release 里名为 `{asset-name}` 的资产**。于是可以把「更新清单 `latest.json`」也作为 Release 的资产上传，用这个固定 URL 访问 —— 相当于 GitHub Release 免费充当了静态更新服务器。

> **`{asset-name}` 会不会随版本变化？** 关键在命名策略：
>
> - **更新清单 `latest.json`（本方案固定为 `latest-{{target}}.json`）：文件名必须固定不变**，客户端才能用一个写死的地址拿到它。它是「入口」。
> - **安装包（`.msi` / `.exe` / `.dmg` / `.app.tar.gz`）：文件名带版本号**（如 `cherimoya-ssh_1.0.4_x64-setup.exe`），每个版本一份。它只出现在清单的 `url` 字段里，由 CI 每次构建时动态写入，前端/客户端代码里**不硬编码**。
>
> 所以代码里真正写死的地址只有一个入口（`endpoints`），安装包名字变化不影响客户端。

### 方案 B：GitHub Releases REST API + 手动下载（轻量备选）

前端直接调

```
GET https://api.github.com/repos/{owner}/{repo}/releases/latest
```

解析 `tag_name`，与 `getVersion()` 做 semver 比较，有更新则下载对应资产并手动触发安装。

| 维度 | 方案 A | 方案 B |
|------|--------|--------|
| 签名校验 | ✅ 内置 Ed25519 | ❌ 需自己实现（或不做） |
| 跨平台安装/重启 | ✅ 插件处理 | ❌ 自己处理各平台安装器 |
| 版本比较 | ✅ 内置 | 需自引 semver 库 |
| 限流风险 | 低（走 `latest/download` 重定向） | 未认证 60 次/小时 |
| 实现成本 | 中（要签密钥 + CI 改造） | 低（纯前端） |
| 适用场景 | 正式「下载并安装」更新 | MVP 或「检查更新 + 跳浏览器」 |

**结论**：正式做「下载并安装」选方案 A；如果只想先做「检查更新 + 打开 Release 页面让用户手动下」，方案 B 足够。下文详述方案 A。

---

## 方案 A 详细设计

### 架构

```
┌─────────────────────────────────────────────┐
│               前端 (Vue)                      │
│  TitleBar → 升级按钮 → useUpdater()          │
│    @tauri-apps/plugin-updater                │
│      check() → downloadAndInstall() → relaunch│
└──────────────────┬──────────────────────────┘
                   │ IPC
┌──────────────────▼──────────────────────────┐
│            Rust: tauri-plugin-updater        │
│  1. GET https://github.com/.../latest.json   │
│  2. 比对 version vs 当前版本                  │
│  3. 下载目标平台安装包                        │
│  4. 校验 Ed25519 签名（pubkey）               │
│  5. 调用平台安装器并退出，重启                │
└──────────────────┬──────────────────────────┘
                   │ HTTPS
┌──────────────────▼──────────────────────────┐
│         GitHub Release（唯一后端）            │
│  - latest.json          （更新清单，资产）     │
│  - xxx.msi / xxx.exe    （Windows 安装包）    │
│  - xxx.dmg / xxx.tar.gz （macOS 安装包）      │
│  - *.sig                （签名文件）           │
└──────────────────────────────────────────────┘
```

### 更新清单 `latest.json`（Tauri v2 格式）

作为 Release 资产上传，大致结构：

```json
{
  "version": "1.0.4",
  "notes": "新版本说明……",
  "pub_date": "2026-09-18T00:00:00+00:00",
  "platforms": {
    "windows-x86_64": {
      "signature": "<.sig 文件内容，base64>",
      "url": "https://github.com/binfenshengdai/CherimoyaSSH/releases/download/v1.0.4/cherimoya-ssh_1.0.4_x64-setup.exe"
    },
    "darwin-x86_64": {
      "signature": "<.sig 文件内容，base64>",
      "url": "https://github.com/binfenshengdai/CherimoyaSSH/releases/download/v1.0.4/cherimoya-ssh.app.tar.gz"
    },
    "darwin-aarch64": {
      "signature": "<与 darwin-x86_64 相同>",
      "url": "https://github.com/binfenshengdai/CherimoyaSSH/releases/download/v1.0.4/cherimoya-ssh.app.tar.gz"
    }
  }
}
```

- `version` 与 tag、`tauri.conf.json` 的 `version` 保持一致
- `platforms` 的 key 形如 `{os}-{arch}`：Windows 为 `windows-x86_64`
- **macOS 为 universal 构建**，运行时在 Apple Silicon 上报 `darwin-aarch64`、在 Intel 上报 `darwin-x86_64`。因此**两个 key 都要写**、指向同一份 `.app.tar.gz`（不能用 `darwin-universal`，插件的 target 解析不会产生这个值）
- `signature` 字段的值**就是构建产出的 `.sig` 文件内容**（build 已对其做了 base64，无需二次处理）
- `url` 指向该平台的**更新安装器**（Windows 用 NSIS exe，macOS 用 `.app.tar.gz`，不用 dmg）

> 具体字段以 `tauri-plugin-updater` 官方文档为准，此处为设计级描述。

### 插件接入

1. **Rust 侧**（`src-tauri`）
   - `Cargo.toml` 增加 `tauri-plugin-updater`
   - `lib.rs` 注册 `.plugin(tauri_plugin_updater::Builder::new().build())`
   - `tauri.conf.json` 增加 `plugins.updater` 配置（`pubkey` + `endpoints` + 平台安装模式）

2. **前端侧**
   - `package.json` 增加 `@tauri-apps/plugin-updater`
   - `capabilities/default.json` 增加 `updater:default`、`process:allow-restart` 等权限

3. **前端交互**（`TitleBar` 的「升级」按钮）

   ```ts
   import { check } from "@tauri-apps/plugin-updater";
   import { relaunch } from "@tauri-apps/plugin-process";

   async function onUpgrade() {
     const update = await check();      // 返回 null 表示已是最新
     if (!update) { info("已是最新版本"); return; }

     const confirmed = await showConfirm({
       title: "发现新版本",
       message: `v${update.version} 已发布，是否下载并安装？`,
     });
     if (!confirmed) return;

     await update.downloadAndInstall();  // 下载 + 验签 + 安装
     await relaunch();                    // 重启应用
   }
   ```

   版本比较由插件内置完成（清单 `version` vs `tauri.conf.json` 的 `version`），无需前端手动处理 semver。

### 签名密钥管理

自动更新必须有签名校验，需要一对 **Ed25519 密钥**：

- **私钥**：生成后**只**存 GitHub CI Secrets（绝不能进仓库、不能泄露）。泄露 = 任何人都能伪造你的更新包。
- **公钥（pubkey）**：写入 `tauri.conf.json` 的 `plugins.updater.pubkey`，随应用分发，用于校验下载包。

CLI 大致流程（以官方 CLI 文档为准）：

- 生成密钥对：`tauri signer generate -w <私钥路径>`（产物含 `.key` 私钥与 `.key.pub` 公钥）
- 构建后签名：`tauri build` 时读到 `TAURI_SIGNING_PRIVATE_KEY` 环境变量，对更新安装器签名，产出 `.sig` 文件
- 生成清单：**`createUpdaterArtifacts` 只负责产出 `.sig`，并不会生成 `latest.json`**。清单由本项目脚本 `scripts/generate-updater-manifest.mjs` 在 CI 中生成（读取 `.sig` 内容 + 拼 URL）

### CI 改造（`.github/workflows/build.yml`）

现有构建基础上，每个平台的 job 做了如下改动：

1. `tauri-action` 构建步骤注入 `secrets.TAURI_SIGNING_PRIVATE_KEY` 环境变量 → 构建时自动对更新安装器签名、产出 `.sig`
2. 新增「生成更新清单」步骤，调用 `scripts/generate-updater-manifest.mjs`，读取 `.sig` 内容并拼出该平台的 `signature` + `url`，产出 `latest-{target}.json`
3. Release 上传步骤额外上传 `latest-{target}.json` 与 `.sig` 文件

跨平台顺序问题：本项目采用「**单平台清单 + endpoints 模板**」方案解决：

- 每个平台 job 各自产出单平台清单，命名为 `latest-windows.json` / `latest-darwin.json`
- `endpoints` 配置为 `.../releases/latest/download/latest-{{target}}.json`，`{{target}}` 运行时被替换为 `windows` / `darwin`，插件据此拉取对应平台的清单
- 无需拆额外的汇总 job，两个 job 互不依赖、可并行

---

## 方案 B 设计（备选 / MVP）

若暂不引入签名与插件，最快做法：复用已有的「关于」逻辑，把「升级」按钮做成「检查更新」：

1. `GET https://api.github.com/repos/binfenshengdai/CherimoyaSSH/releases/latest`
2. 取 `tag_name`（如 `v1.0.4`），与 `getVersion()` 比（去掉 `v` 前缀做 semver 比较）
3. 有更新 → 弹确认框 → 用 `openUrl()` 或 opener 打开 `https://github.com/binfenshengdai/CherimoyaSSH/releases/latest` 让用户手动下载

优缺点前面已列：实现快、无签名（安全风险）、不自动安装、有 API 限流。仅适合过渡。

---

## 安全考量

- **必须验签**：方案 A 强制校验；方案 B 天然无验签，正式发布不建议用于自动安装
- **私钥隔离**：只存在于 CI Secrets，本地开发可用独立测试密钥
- **版本一致性**：tag / `tauri.conf.json` / `latest.json` 三者 version 必须同步，否则会出现「永远提示更新」或「更新不到」的 bug
- **降级下载**：可用 GitHub `releases/latest/download` 稳定重定向，避免 API 限流

---

## 实施步骤建议

1. **阶段一（无签名 MVP）**：落地方案 B，「升级」按钮实现「检查更新 + 跳转 Release 页」，快速上线
2. **阶段二（正式自动更新）**：引入 `tauri-plugin-updater` + 签名密钥 + CI 生成 `latest.json` / `.sig`，替换「升级」按钮为「下载并安装」
3. **阶段三（体验优化）**：启动时后台静默检查 + 更新进度提示（配合现有通知系统）

---

## 已知限制与风险

- GitHUb 未认证 API 限流（仅影响方案 B）
- 签名私钥一旦泄露需立即吊销并轮换 pubkey
- macOS 更新 `.dmg` 的用户体验不如 `.app.tar.gz` 顺畅，需按渠道选择安装器格式
- 当前无 GUI 进度条，`downloadAndInstall` 期间需用通知/弹框反馈，避免界面「卡住」的观感

---

## 参考

- Tauri v2 Updater 插件：`tauri-plugin-updater` / `@tauri-apps/plugin-updater`
- GitHub Releases 稳定下载：`https://github.com/{owner}/{repo}/releases/latest/download/{asset}`
- GitHub REST：`GET /repos/{owner}/{repo}/releases/latest`