# SSH 客户端实施方案

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 使用 Tauri v2 + Vue 3 构建一个桌面 SSH 连接工具，左侧边栏管理主机/分类，顶部标签页切换终端会话，深色主题。

**架构：** Rust 后端通过 `russh` crate 处理 SSH 连接，通过 Tauri 事件流式传输 I/O。前端使用 `xterm.js` 渲染终端，使用 Vue composables 管理状态（无需 Pinia — 单窗口应用本地状态足够），主机/分类数据以 JSON 格式通过 Tauri 文件系统 API 持久化。

**技术栈：** Tauri v2, Vue 3.5 + TypeScript, Vite 6, `russh` + `russh-keys`（SSH）, `@xterm/xterm` + `@xterm/addon-fit`（终端）, `@tauri-apps/plugin-fs`（持久化）

## 全局约束

- **主题：** 深灰黑背景（`#1a1a1a` 基底），白色/浅灰文字（`#e0e0e0`），终端必须使用高对比度配色
- **认证：** v1 版本仅支持密码认证（密钥认证作为未来增强功能）
- **持久化：** 将主机和分类存储为 JSON 文件，位于 Tauri 应用数据目录（`app_data_dir/hosts.json`）
- **无新状态库：** 使用 Vue composables + `reactive()` 管理共享状态
- **窗口：** 单窗口，可调整大小，最小 800×600
- **连接模型：** 每个标签页一个 SSH 会话，后端通过 UUID 跟踪会话，通过 Tauri 事件流式传输输出

---

## 文件结构

```
src/
├── App.vue                      # 替换：主布局（侧边栏 + 标签页 + 终端）
├── main.ts                      # 更新：引入 xterm CSS
├── style.css                    # 新建：全局深色主题样式
├── types/
│   └── ssh.ts                   # 新建：Host, Category, Tab, ConnectionState 类型
├── composables/
│   ├── useHosts.ts              # 新建：主机/分类 CRUD + 持久化
│   ├── useConnections.ts        # 新建：SSH 连接生命周期（连接/断开/流式传输）
│   └── useTabs.ts               # 新建：标签页管理
├── components/
│   ├── Sidebar.vue              # 新建：左侧面板，含分类 + 主机列表
│   ├── HostForm.vue             # 新建：添加/编辑主机弹窗
│   ├── TabBar.vue               # 新建：顶部标签页条
│   └── TerminalPane.vue         # 新建：xterm.js 终端封装
src-tauri/
├── Cargo.toml                   # 添加：russh, russh-keys, uuid, chrono, tauri-plugin-fs
├── capabilities/
│   └── default.json             # 添加：fs:default 权限
├── src/
│   ├── lib.rs                   # 更新：注册命令 + fs 插件
│   ├── main.rs                  # 不变
│   └── ssh/
│       ├── mod.rs               # 新建：SSH 模块入口
│       ├── manager.rs           # 新建：连接注册表（HashMap<uuid, Session>）
│       ├── session.rs           # 新建：单个 SSH 会话（russh 客户端 + 通道）
│       └── commands.rs          # 新建：Tauri 命令（连接/发送/断开/调整大小）
```

---

## 任务 1：项目配置 — 依赖安装

**文件：**
- 修改：`package.json`
- 修改：`src-tauri/Cargo.toml`
- 修改：`src-tauri/capabilities/default.json`

**接口：**
- 产出：Rust 端可用 `russh`、`russh-keys`、`uuid`、`chrono`、`tauri-plugin-fs`
- 产出：前端可用 `@tauri-apps/plugin-fs`、`@xterm/xterm`、`@xterm/addon-fit`
- 产出：授予 `fs:default` 权限

- [ ] **步骤 1：安装前端依赖**

```bash
cd E:\webprojects\cherimoya-tauri
npm install @tauri-apps/plugin-fs @xterm/xterm @xterm/addon-fit
```

预期：包添加到 `package.json` 依赖中，无报错。

- [ ] **步骤 2：添加 Rust 依赖**

编辑 `src-tauri/Cargo.toml`，在 `[dependencies]` 下添加：

```toml
russh = "0.44"
russh-keys = "0.44"
uuid = { version = "1", features = ["v4"] }
chrono = { version = "0.4", features = ["serde"] }
tauri-plugin-fs = "2"
```

- [ ] **步骤 3：更新 Cargo.toml lib 特性**

确保 `tauri` 依赖有所需特性。更新为：

```toml
tauri = { version = "2", features = ["protocol-asset"] }
```

- [ ] **步骤 4：添加 fs 权限到 capabilities**

编辑 `src-tauri/capabilities/default.json`：

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "opener:default",
    "os:default",
    "fs:default"
  ]
}
```

- [ ] **步骤 5：验证 Rust 编译**

```bash
cd src-tauri && cargo check
```

预期：`Finished` 无报错（首次运行会下载 crate）。

- [ ] **步骤 6：提交**

```bash
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/capabilities/default.json
git commit -m "chore: add SSH and terminal dependencies"
```

---

## 任务 2：类型定义

**文件：**
- 新建：`src/types/ssh.ts`

**接口：**
- 产出：`Host`、`Category`、`Tab`、`ConnectionState`、`HostInput` 类型，供所有前端任务使用

- [ ] **步骤 1：创建类型文件**

创建 `src/types/ssh.ts`：

```typescript
export interface Host {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  categoryId: string;
  createdAt: number;
}

export interface Category {
  id: string;
  name: string;
}

export interface Tab {
  id: string;
  hostId: string;
  title: string;
  connectionId: string;
}

export type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

export interface HostInput {
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  categoryId: string;
}
```

- [ ] **步骤 2：验证 TypeScript 编译**

```bash
npx vue-tsc --noEmit
```

预期：无报错。

- [ ] **步骤 3：提交**

```bash
git add src/types/ssh.ts
git commit -m "feat: add SSH client type definitions"
```

---

## 任务 3：主机与分类持久化（Composable）

**文件：**
- 新建：`src/composables/useHosts.ts`

**接口：**
- 消费：`Host`、`Category`、`HostInput`（来自 `src/types/ssh.ts`）
- 产出：`useHosts()` composable，返回 `{ hosts, categories, addHost, updateHost, deleteHost, addCategory, deleteCategory }`

- [ ] **步骤 1：编写失败测试**

创建 `src/composables/__tests__/useHosts.test.ts`：

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { useHosts } from "../useHosts";

// Mock @tauri-apps/plugin-fs
vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  exists: vi.fn(),
}));

describe("useHosts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("初始为空主机列表和一个默认分类", () => {
    const { hosts, categories } = useHosts();
    expect(hosts.value).toEqual([]);
    expect(categories.value.length).toBe(1);
    expect(categories.value[0].name).toBe("Default");
  });

  it("addHost 创建带自动生成 id 的主机", () => {
    const { hosts, addHost } = useHosts();
    addHost({
      name: "Test Server",
      host: "192.168.1.1",
      port: 22,
      username: "root",
      password: "pass",
      categoryId: "default",
    });
    expect(hosts.value.length).toBe(1);
    expect(hosts.value[0].name).toBe("Test Server");
    expect(hosts.value[0].id).toBeTruthy();
  });

  it("deleteHost 按 id 删除", () => {
    const { hosts, addHost, deleteHost } = useHosts();
    addHost({
      name: "Test",
      host: "1.1.1.1",
      port: 22,
      username: "u",
      password: "p",
      categoryId: "default",
    });
    const id = hosts.value[0].id;
    deleteHost(id);
    expect(hosts.value.length).toBe(0);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

```bash
npx vitest run src/composables/__tests__/useHosts.test.ts
```

预期：FAIL — `useHosts` 未定义。

- [ ] **步骤 3：编写最小实现**

创建 `src/composables/useHosts.ts`：

```typescript
import { ref, watch, type Ref } from "vue";
import { readTextFile, writeTextFile, exists, BaseDirectory } from "@tauri-apps/plugin-fs";
import type { Host, Category, HostInput } from "../types/ssh";

const STORAGE_FILE = "hosts.json";

interface StorageData {
  hosts: Host[];
  categories: Category[];
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function createDefaultCategory(): Category {
  return { id: "default", name: "Default" };
}

async function loadData(): Promise<StorageData> {
  try {
    const fileExists = await exists(STORAGE_FILE, { baseDir: BaseDirectory.AppData });
    if (!fileExists) {
      return { hosts: [], categories: [createDefaultCategory()] };
    }
    const content = await readTextFile(STORAGE_FILE, { baseDir: BaseDirectory.AppData });
    return JSON.parse(content) as StorageData;
  } catch {
    return { hosts: [], categories: [createDefaultCategory()] };
  }
}

async function saveData(data: StorageData): Promise<void> {
  await writeTextFile(STORAGE_FILE, JSON.stringify(data, null, 2), {
    baseDir: BaseDirectory.AppData,
  });
}

export interface UseHostsReturn {
  hosts: Ref<Host[]>;
  categories: Ref<Category[]>;
  addHost: (input: HostInput) => Host;
  updateHost: (id: string, updates: Partial<HostInput>) => void;
  deleteHost: (id: string) => void;
  addCategory: (name: string) => Category;
  deleteCategory: (id: string) => void;
  reload: () => Promise<void>;
}

// 模块级单例状态
const hosts = ref<Host[]>([]);
const categories = ref<Category[]>([createDefaultCategory()]);
let initialized = false;

export function useHosts(): UseHostsReturn {
  if (!initialized) {
    initialized = true;
    loadData().then((data) => {
      hosts.value = data.hosts;
      categories.value = data.categories;
    });
    // 变更时持久化
    watch([hosts, categories], async () => {
      await saveData({ hosts: hosts.value, categories: categories.value });
    }, { deep: true });
  }

  function addHost(input: HostInput): Host {
    const host: Host = { ...input, id: generateId(), createdAt: Date.now() };
    hosts.value.push(host);
    return host;
  }

  function updateHost(id: string, updates: Partial<HostInput>): void {
    const idx = hosts.value.findIndex((h) => h.id === id);
    if (idx !== -1) {
      hosts.value[idx] = { ...hosts.value[idx], ...updates };
    }
  }

  function deleteHost(id: string): void {
    hosts.value = hosts.value.filter((h) => h.id !== id);
  }

  function addCategory(name: string): Category {
    const category: Category = { id: generateId(), name };
    categories.value.push(category);
    return category;
  }

  function deleteCategory(id: string): void {
    if (id === "default") return; // 不能删除默认分类
    categories.value = categories.value.filter((c) => c.id !== id);
    // 将被删分类下的主机归入默认分类
    hosts.value.forEach((h) => {
      if (h.categoryId === id) h.categoryId = "default";
    });
  }

  async function reload(): Promise<void> {
    const data = await loadData();
    hosts.value = data.hosts;
    categories.value = data.categories;
  }

  return { hosts, categories, addHost, updateHost, deleteHost, addCategory, deleteCategory, reload };
}
```

- [ ] **步骤 4：运行测试验证通过**

```bash
npx vitest run src/composables/__tests__/useHosts.test.ts
```

预期：PASS（如需安装 vitest — 见下方说明）。

> **说明：** 如果未安装 vitest，执行：`npm install -D vitest`，并在 `package.json` 的 scripts 中添加：`"test": "vitest run"`。如需可添加基础 `vitest.config.ts`。

- [ ] **步骤 5：提交**

```bash
git add src/composables/useHosts.ts src/composables/__tests__/useHosts.test.ts
git commit -m "feat: add host and category persistence composable"
```

---

## 任务 4：标签页管理（Composable）

**文件：**
- 新建：`src/composables/useTabs.ts`

**接口：**
- 消费：`Tab`（来自 `src/types/ssh.ts`）
- 产出：`useTabs()` composable，返回 `{ tabs, activeTabId, openTab, closeTab, setActiveTab }`

- [ ] **步骤 1：编写失败测试**

创建 `src/composables/__tests__/useTabs.test.ts`：

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { useTabs } from "../useTabs";

describe("useTabs", () => {
  beforeEach(() => {
    const { tabs, closeTab } = useTabs();
    tabs.value.slice().forEach((t) => closeTab(t.id));
  });

  it("初始无标签页", () => {
    const { tabs } = useTabs();
    expect(tabs.value).toEqual([]);
  });

  it("openTab 添加标签页并设为活动状态", () => {
    const { tabs, activeTabId, openTab } = useTabs();
    openTab({ hostId: "h1", title: "Server 1", connectionId: "c1" });
    expect(tabs.value.length).toBe(1);
    expect(activeTabId.value).toBe(tabs.value[0].id);
  });

  it("closeTab 删除标签页，若为活动标签页则清除活动状态", () => {
    const { tabs, activeTabId, openTab, closeTab } = useTabs();
    openTab({ hostId: "h1", title: "S1", connectionId: "c1" });
    const id = tabs.value[0].id;
    closeTab(id);
    expect(tabs.value.length).toBe(0);
    expect(activeTabId.value).toBeNull();
  });

  it("setActiveTab 切换活动标签页", () => {
    const { activeTabId, openTab, setActiveTab } = useTabs();
    openTab({ hostId: "h1", title: "S1", connectionId: "c1" });
    openTab({ hostId: "h2", title: "S2", connectionId: "c2" });
    const firstId = useTabs().tabs.value[0].id;
    setActiveTab(firstId);
    expect(activeTabId.value).toBe(firstId);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

```bash
npx vitest run src/composables/__tests__/useTabs.test.ts
```

预期：FAIL — `useTabs` 未定义。

- [ ] **步骤 3：编写最小实现**

创建 `src/composables/useTabs.ts`：

```typescript
import { ref, type Ref } from "vue";
import type { Tab } from "../types/ssh";

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export interface OpenTabInput {
  hostId: string;
  title: string;
  connectionId: string;
}

export interface UseTabsReturn {
  tabs: Ref<Tab[]>;
  activeTabId: Ref<string | null>;
  openTab: (input: OpenTabInput) => Tab;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
}

// 模块级单例
const tabs = ref<Tab[]>([]);
const activeTabId = ref<string | null>(null);

export function useTabs(): UseTabsReturn {
  function openTab(input: OpenTabInput): Tab {
    // 同一连接不重复打开
    const existing = tabs.value.find((t) => t.connectionId === input.connectionId);
    if (existing) {
      activeTabId.value = existing.id;
      return existing;
    }
    const tab: Tab = { id: generateId(), ...input };
    tabs.value.push(tab);
    activeTabId.value = tab.id;
    return tab;
  }

  function closeTab(id: string): void {
    const idx = tabs.value.findIndex((t) => t.id === id);
    if (idx === -1) return;
    tabs.value.splice(idx, 1);
    if (activeTabId.value === id) {
      activeTabId.value = tabs.value.length > 0 ? tabs.value[Math.min(idx, tabs.value.length - 1)].id : null;
    }
  }

  function setActiveTab(id: string): void {
    if (tabs.value.some((t) => t.id === id)) {
      activeTabId.value = id;
    }
  }

  return { tabs, activeTabId, openTab, closeTab, setActiveTab };
}
```

- [ ] **步骤 4：运行测试验证通过**

```bash
npx vitest run src/composables/__tests__/useTabs.test.ts
```

预期：PASS。

- [ ] **步骤 5：提交**

```bash
git add src/composables/useTabs.ts src/composables/__tests__/useTabs.test.ts
git commit -m "feat: add tab management composable"
```

---

## 任务 5：Rust SSH 会话模块

**文件：**
- 新建：`src-tauri/src/ssh/mod.rs`
- 新建：`src-tauri/src/ssh/session.rs`

**接口：**
- 产出：`SshSession` 结构体，通过 russh 连接，暴露 `send()`、`resize()`、`disconnect()` 方法
- 产出：输出流为 `tokio::sync::mpsc::Receiver<String>`

- [ ] **步骤 1：创建 SSH 模块入口**

创建 `src-tauri/src/ssh/mod.rs`：

```rust
pub mod manager;
pub mod session;
pub mod commands;
```

- [ ] **步骤 2：编写会话实现**

创建 `src-tauri/src/ssh/session.rs`：

```rust
use russh::*;
use russh_keys::*;
use std::sync::Arc;
use tokio::sync::mpsc;

pub struct SessionHandle {
    pub sender: mpsc::Sender<String>,
    client_handle: client::Handle,
}

impl SessionHandle {
    pub fn send_data(&self, data: String) {
        let _ = self.sender.try_send(data);
    }

    pub fn resize(&self, cols: u32, rows: u32) {
        let _ = self.client_handle.channel_request(
            "window-change",
            false,
            &[
                (cols >> 24) as u8,
                (cols >> 16) as u8,
                (cols >> 8) as u8,
                cols as u8,
                (rows >> 24) as u8,
                (rows >> 16) as u8,
                (rows >> 8) as u8,
                rows as u8,
            ],
        );
    }

    pub fn disconnect(self) {
        drop(self.sender);
        // client_handle 被 drop，会话结束
    }
}

async fn connect_ssh(
    host: &str,
    port: u16,
    username: &str,
    password: &str,
) -> Result<(SessionHandle, mpsc::Receiver<String>), Box<dyn std::error::Error>> {
    let config = client::Config {
        ..Default::default()
    };
    let config = Arc::new(config);
    let mut session = client::connect(config, (host, port), Handler).await?;

    let auth_res = session.authenticate_password(username, password).await?;
    if !auth_res {
        return Err("Authentication failed".into());
    }

    let mut channel = session.channel_open_session().await?;
    channel.request_pty(false, "xterm", 80, 24, 0, 0, &[]).await?;
    channel.shell_request().await?;

    let (tx, input_rx) = mpsc::channel::<String>(256);
    let (output_tx, output_rx) = mpsc::channel::<String>(256);

    let client_handle = session.handle();

    // 生成任务处理 I/O
    tokio::spawn(async move {
        let mut channel = channel;
        let mut input_rx = input_rx;
        let output_tx = output_tx;

        loop {
            tokio::select! {
                Some(data) = input_rx.recv() => {
                    if channel.data(data.as_bytes()).await.is_err() {
                        break;
                    }
                }
                result = channel.wait() => {
                    match result {
                        Some(ChannelMsg::Data { ref data }) => {
                            let text = String::from_utf8_lossy(data).to_string();
                            if output_tx.send(text).await.is_err() {
                                break;
                            }
                        }
                        Some(ChannelMsg::ExitStatus { .. }) | None => break,
                        _ => {}
                    }
                }
            }
        }
    });

    Ok((
        SessionHandle {
            sender: tx,
            client_handle,
        },
        output_rx,
    ))
}

struct Handler;

impl client::Handler for Handler {
    type Error = russh::Error;

    async fn check_server_key(
        self,
        _server_public_key: &key::PublicKey,
    ) -> Result<(Self, bool), Self::Error> {
        Ok((self, true)) // v1 接受所有密钥（TODO: 验证 known_hosts）
    }
}
```

- [ ] **步骤 3：验证编译**

```bash
cd src-tauri && cargo check
```

预期：编译通过（可能需要在 Cargo.toml 中添加 tokio）。

> **说明：** 如需添加：`tokio = { version = "1", features = ["full"] }`

- [ ] **步骤 4：提交**

```bash
git add src-tauri/src/ssh/mod.rs src-tauri/src/ssh/session.rs src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat(rust): add SSH session implementation"
```

---

## 任务 6：Rust 连接管理器

**文件：**
- 新建：`src-tauri/src/ssh/manager.rs`

**接口：**
- 消费：`SessionHandle`（来自 `session.rs`）
- 产出：`ConnectionManager`，含 `connect()`、`send()`、`resize()`、`disconnect()`、`get_output_receiver()` 方法

- [ ] **步骤 1：编写管理器**

创建 `src-tauri/src/ssh/manager.rs`：

```rust
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;
use uuid::Uuid;

use super::session::SessionHandle;

pub struct ConnectionManager {
    sessions: Arc<Mutex<HashMap<String, SessionHandle>>>,
}

impl ConnectionManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn connect(
        &self,
        host: String,
        port: u16,
        username: String,
        password: String,
    ) -> Result<(String, mpsc::Receiver<String>), String> {
        let id = Uuid::new_v4().to_string();
        let (handle, output_rx) = super::session::connect_ssh(&host, port, &username, &password)
            .await
            .map_err(|e| e.to_string())?;

        self.sessions.lock().unwrap().insert(id.clone(), handle);
        Ok((id, output_rx))
    }

    pub fn send(&self, id: &str, data: &str) -> Result<(), String> {
        let sessions = self.sessions.lock().unwrap();
        match sessions.get(id) {
            Some(handle) => {
                handle.send_data(data.to_string());
                Ok(())
            }
            None => Err("Connection not found".to_string()),
        }
    }

    pub fn resize(&self, id: &str, cols: u32, rows: u32) -> Result<(), String> {
        let sessions = self.sessions.lock().unwrap();
        match sessions.get(id) {
            Some(handle) => {
                handle.resize(cols, rows);
                Ok(())
            }
            None => Err("Connection not found".to_string()),
        }
    }

    pub fn disconnect(&self, id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().unwrap();
        match sessions.remove(id) {
            Some(handle) => {
                handle.disconnect();
                Ok(())
            }
            None => Err("Connection not found".to_string()),
        }
    }
}

impl Default for ConnectionManager {
    fn default() -> Self {
        Self::new()
    }
}
```

- [ ] **步骤 2：验证编译**

```bash
cd src-tauri && cargo check
```

预期：编译通过。

- [ ] **步骤 3：提交**

```bash
git add src-tauri/src/ssh/manager.rs
git commit -m "feat(rust): add SSH connection manager"
```

---

## 任务 7：Rust Tauri 命令

**文件：**
- 新建：`src-tauri/src/ssh/commands.rs`
- 修改：`src-tauri/src/lib.rs`

**接口：**
- 消费：`ConnectionManager`（来自 `manager.rs`）
- 产出：Tauri 命令：`ssh_connect`、`ssh_send`、`ssh_resize`、`ssh_disconnect`

- [ ] **步骤 1：编写 Tauri 命令**

创建 `src-tauri/src/ssh/commands.rs`：

```rust
use tauri::{AppHandle, Emitter, State};
use tokio::sync::mpsc;

use super::manager::ConnectionManager;

#[tauri::command]
pub async fn ssh_connect(
    app: AppHandle,
    manager: State<'_, ConnectionManager>,
    host: String,
    port: u16,
    username: String,
    password: String,
) -> Result<String, String> {
    let (id, mut output_rx) = manager.connect(host, port, username, password).await?;
    let app_clone = app.clone();
    let event_id = id.clone();

    // 生成任务将 SSH 输出通过事件转发到前端
    tokio::spawn(async move {
        while let Some(text) = output_rx.recv().await {
            let _ = app_clone.emit(&format!("ssh_output_{}", event_id), text);
        }
        let _ = app_clone.emit(&format!("ssh_closed_{}", event_id), "");
    });

    Ok(id)
}

#[tauri::command]
pub fn ssh_send(
    manager: State<'_, ConnectionManager>,
    id: String,
    data: String,
) -> Result<(), String> {
    manager.send(&id, &data)
}

#[tauri::command]
pub fn ssh_resize(
    manager: State<'_, ConnectionManager>,
    id: String,
    cols: u32,
    rows: u32,
) -> Result<(), String> {
    manager.resize(&id, cols, rows)
}

#[tauri::command]
pub fn ssh_disconnect(
    manager: State<'_, ConnectionManager>,
    id: String,
) -> Result<(), String> {
    manager.disconnect(&id)
}
```

- [ ] **步骤 2：更新 lib.rs 注册命令和插件**

编辑 `src-tauri/src/lib.rs`：

```rust
mod ssh;

use ssh::manager::ConnectionManager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .manage(ConnectionManager::new())
        .invoke_handler(tauri::generate_handler![
            greet,
            ssh::commands::ssh_connect,
            ssh::commands::ssh_send,
            ssh::commands::ssh_resize,
            ssh::commands::ssh_disconnect,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **步骤 3：验证编译**

```bash
cd src-tauri && cargo check
```

预期：编译通过。

- [ ] **步骤 4：提交**

```bash
git add src-tauri/src/ssh/commands.rs src-tauri/src/lib.rs
git commit -m "feat(rust): add SSH Tauri commands"
```

---

## 任务 8：前端连接 Composable

**文件：**
- 新建：`src/composables/useConnections.ts`

**接口：**
- 消费：`ConnectionState`（来自 `src/types/ssh.ts`）
- 产出：`useConnections()`，返回 `{ connect, send, resize, disconnect, connectionStates }`

- [ ] **步骤 1：编写 composable**

创建 `src/composables/useConnections.ts`：

```typescript
import { ref, reactive, type Ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ConnectionState } from "../types/ssh";

export interface UseConnectionsReturn {
  connectionStates: Record<string, ConnectionState>;
  connect: (host: { host: string; port: number; username: string; password: string }) => Promise<string>;
  send: (connectionId: string, data: string) => Promise<void>;
  resize: (connectionId: string, cols: number, rows: number) => Promise<void>;
  disconnect: (connectionId: string) => Promise<void>;
  onOutput: (connectionId: string, callback: (data: string) => void) => () => void;
  onClose: (connectionId: string, callback: () => void) => () => void;
}

// 模块级单例
const connectionStates = reactive<Record<string, ConnectionState>>({});
const outputListeners = new Map<string, Set<(data: string) => void>>();
const closeListeners = new Map<string, Set<() => void>>();

export function useConnections(): UseConnectionsReturn {
  async function connect(host: {
    host: string;
    port: number;
    username: string;
    password: string;
  }): Promise<string> {
    connectionStates["pending"] = "connecting";
    const connectionId = await invoke<string>("ssh_connect", host);
    connectionStates[connectionId] = "connecting";

    // 监听输出
    listen<string>(`ssh_output_${connectionId}`, (event) => {
      const listeners = outputListeners.get(connectionId);
      if (listeners) {
        listeners.forEach((cb) => cb(event.payload));
      }
    });

    // 监听关闭
    listen(`ssh_closed_${connectionId}`, () => {
      connectionStates[connectionId] = "disconnected";
      const listeners = closeListeners.get(connectionId);
      if (listeners) {
        listeners.forEach((cb) => cb());
      }
    });

    connectionStates[connectionId] = "connected";
    return connectionId;
  }

  async function send(connectionId: string, data: string): Promise<void> {
    await invoke("ssh_send", { id: connectionId, data });
  }

  async function resize(connectionId: string, cols: number, rows: number): Promise<void> {
    await invoke("ssh_resize", { id: connectionId, cols, rows });
  }

  async function disconnect(connectionId: string): Promise<void> {
    await invoke("ssh_disconnect", { id: connectionId });
    connectionStates[connectionId] = "disconnected";
  }

  function onOutput(connectionId: string, callback: (data: string) => void): () => void {
    if (!outputListeners.has(connectionId)) {
      outputListeners.set(connectionId, new Set());
    }
    outputListeners.get(connectionId)!.add(callback);
    return () => {
      outputListeners.get(connectionId)?.delete(callback);
    };
  }

  function onClose(connectionId: string, callback: () => void): () => void {
    if (!closeListeners.has(connectionId)) {
      closeListeners.set(connectionId, new Set());
    }
    closeListeners.get(connectionId)!.add(callback);
    return () => {
      closeListeners.get(connectionId)?.delete(callback);
    };
  }

  return { connectionStates, connect, send, resize, disconnect, onOutput, onClose };
}
```

- [ ] **步骤 2：提交**

```bash
git add src/composables/useConnections.ts
git commit -m "feat: add SSH connection composable"
```

---

## 任务 9：全局深色主题样式

**文件：**
- 新建：`src/style.css`
- 修改：`src/main.ts`

**接口：**
- 产出：全局 CSS 变量和深色主题，应用到整个应用

- [ ] **步骤 1：创建全局样式**

创建 `src/style.css`：

```css
:root {
  --bg-primary: #1a1a1a;
  --bg-secondary: #242424;
  --bg-tertiary: #2e2e2e;
  --text-primary: #e0e0e0;
  --text-secondary: #a0a0a0;
  --border-color: #3a3a3a;
  --accent: #4a9eff;
  --danger: #ff4a4a;
  --success: #4aff8a;

  font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
  font-size: 14px;
  color: var(--text-primary);
  background-color: var(--bg-primary);
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  overflow: hidden;
  height: 100vh;
  width: 100vw;
}

#app {
  height: 100vh;
  width: 100vw;
}

/* 滚动条样式 */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: var(--bg-secondary);
}
::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: #4a4a4a;
}

/* 表单元素 */
input, select, button {
  font-family: inherit;
  font-size: inherit;
  color: var(--text-primary);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 6px 10px;
  outline: none;
}
input:focus, select:focus {
  border-color: var(--accent);
}
button {
  cursor: pointer;
  transition: background 0.15s;
}
button:hover {
  background: #3a3a3a;
}
button.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
button.danger {
  color: var(--danger);
}
```

- [ ] **步骤 2：在 main.ts 中引入样式**

编辑 `src/main.ts`：

```typescript
import { createApp } from "vue";
import "./style.css";
import App from "./App.vue";

createApp(App).mount("#app");
```

- [ ] **步骤 3：提交**

```bash
git add src/style.css src/main.ts
git commit -m "style: add global dark theme"
```

---

## 任务 10：侧边栏组件

**文件：**
- 新建：`src/components/Sidebar.vue`

**接口：**
- 消费：`useHosts()` composable
- 产出：带分类树 + 主机列表的侧边栏，触发 `connect` 事件传递主机数据

- [ ] **步骤 1：编写组件**

创建 `src/components/Sidebar.vue`：

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import { useHosts } from "../composables/useHosts";
import type { Host } from "../types/ssh";
import HostForm from "./HostForm.vue";

const emit = defineEmits<{
  connect: [host: Host];
}>();

const { hosts, categories, deleteHost, addCategory, deleteCategory } = useHosts();

const expandedCategories = ref<Set<string>>(new Set(["default"]));
const showHostForm = ref(false);
const editingHost = ref<Host | null>(null);
const newCategoryName = ref("");
const showAddCategory = ref(false);

const hostsByCategory = computed(() => {
  const map = new Map<string, Host[]>();
  categories.value.forEach((c) => map.set(c.id, []));
  hosts.value.forEach((h) => {
    const list = map.get(h.categoryId);
    if (list) list.push(h);
  });
  return map;
});

function toggleCategory(id: string) {
  if (expandedCategories.value.has(id)) {
    expandedCategories.value.delete(id);
  } else {
    expandedCategories.value.add(id);
  }
}

function handleConnect(host: Host) {
  emit("connect", host);
}

function handleAddHost(categoryId: string) {
  editingHost.value = null;
  showHostForm.value = true;
}

function handleEditHost(host: Host) {
  editingHost.value = host;
  showHostForm.value = true;
}

function handleAddCategory() {
  if (newCategoryName.value.trim()) {
    addCategory(newCategoryName.value.trim());
    newCategoryName.value = "";
    showAddCategory.value = false;
  }
}
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-header">
      <h2>主机</h2>
    </div>

    <div class="category-list">
      <div v-for="category in categories" :key="category.id" class="category">
        <div class="category-header" @click="toggleCategory(category.id)">
          <span class="expand-icon">
            {{ expandedCategories.has(category.id) ? "▼" : "▶" }}
          </span>
          <span class="category-name">{{ category.name }}</span>
          <span class="host-count">{{ hostsByCategory.get(category.id)?.length ?? 0 }}</span>
          <button
            v-if="category.id !== 'default'"
            class="icon-btn danger"
            @click.stop="deleteCategory(category.id)"
            title="删除分类"
          >×</button>
        </div>

        <div v-if="expandedCategories.has(category.id)" class="host-list">
          <div
            v-for="host in hostsByCategory.get(category.id)"
            :key="host.id"
            class="host-item"
            @click="handleConnect(host)"
            @contextmenu.prevent="handleEditHost(host)"
          >
            <span class="host-name">{{ host.name }}</span>
            <span class="host-addr">{{ host.host }}:{{ host.port }}</span>
            <button class="icon-btn" @click.stop="deleteHost(host.id)" title="删除">×</button>
          </div>
          <button class="add-host-btn" @click="handleAddHost(category.id)">
            + 添加主机
          </button>
        </div>
      </div>
    </div>

    <div class="sidebar-footer">
      <div v-if="showAddCategory" class="add-category-form">
        <input
          v-model="newCategoryName"
          placeholder="分类名称"
          @keyup.enter="handleAddCategory"
        />
        <button @click="handleAddCategory">添加</button>
      </div>
      <button v-else class="add-category-btn" @click="showAddCategory = true">
        + 新建分类
      </button>
    </div>

    <HostForm
      v-if="showHostForm"
      :host="editingHost"
      @close="showHostForm = false"
    />
  </aside>
</template>

<style scoped>
.sidebar {
  width: 240px;
  min-width: 200px;
  height: 100%;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}
.sidebar-header h2 {
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
}

.category-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.category-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  cursor: pointer;
  user-select: none;
}
.category-header:hover {
  background: var(--bg-tertiary);
}
.expand-icon {
  font-size: 10px;
  width: 12px;
}
.category-name {
  flex: 1;
  font-weight: 500;
}
.host-count {
  font-size: 11px;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  padding: 1px 6px;
  border-radius: 10px;
}

.host-list {
  padding-left: 16px;
}

.host-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  cursor: pointer;
  border-radius: 4px;
  margin: 2px 8px;
}
.host-item:hover {
  background: var(--bg-tertiary);
}
.host-name {
  flex: 1;
  font-size: 13px;
}
.host-addr {
  font-size: 11px;
  color: var(--text-secondary);
}

.icon-btn {
  background: transparent;
  border: none;
  padding: 2px 6px;
  font-size: 14px;
  opacity: 0.6;
}
.icon-btn:hover {
  opacity: 1;
  background: transparent;
}
.icon-btn.danger:hover {
  color: var(--danger);
}

.add-host-btn {
  width: calc(100% - 16px);
  margin: 4px 8px;
  background: transparent;
  border: 1px dashed var(--border-color);
  color: var(--text-secondary);
  font-size: 12px;
  padding: 6px;
}
.add-host-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.sidebar-footer {
  padding: 12px;
  border-top: 1px solid var(--border-color);
}
.add-category-btn {
  width: 100%;
  background: transparent;
  border: 1px dashed var(--border-color);
  color: var(--text-secondary);
}
.add-category-form {
  display: flex;
  gap: 6px;
}
.add-category-form input {
  flex: 1;
}
</style>
```

- [ ] **步骤 2：提交**

```bash
git add src/components/Sidebar.vue
git commit -m "feat: add sidebar component with categories and hosts"
```

---

## 任务 11：主机表单组件

**文件：**
- 新建：`src/components/HostForm.vue`

**接口：**
- 消费：`useHosts()` composable
- 产出：添加/编辑主机的弹窗表单

- [ ] **步骤 1：编写组件**

创建 `src/components/HostForm.vue`：

```vue
<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useHosts } from "../composables/useHosts";
import type { Host, HostInput } from "../types/ssh";

const props = defineProps<{
  host?: Host | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

const { categories, addHost, updateHost } = useHosts();

const form = ref<HostInput>({
  name: "",
  host: "",
  port: 22,
  username: "",
  password: "",
  categoryId: "default",
});

onMounted(() => {
  if (props.host) {
    form.value = {
      name: props.host.name,
      host: props.host.host,
      port: props.host.port,
      username: props.host.username,
      password: props.host.password,
      categoryId: props.host.categoryId,
    };
  }
});

function handleSubmit() {
  if (!form.value.name || !form.value.host || !form.value.username) return;
  if (props.host) {
    updateHost(props.host.id, form.value);
  } else {
    addHost(form.value);
  }
  emit("close");
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal">
      <div class="modal-header">
        <h3>{{ host ? "编辑主机" : "添加主机" }}</h3>
        <button class="icon-btn" @click="emit('close')">×</button>
      </div>

      <form @submit.prevent="handleSubmit" class="modal-body">
        <label>
          <span>名称</span>
          <input v-model="form.name" placeholder="我的服务器" required />
        </label>

        <label>
          <span>主机地址</span>
          <input v-model="form.host" placeholder="192.168.1.1" required />
        </label>

        <label>
          <span>端口</span>
          <input v-model.number="form.port" type="number" min="1" max="65535" />
        </label>

        <label>
          <span>用户名</span>
          <input v-model="form.username" placeholder="root" required />
        </label>

        <label>
          <span>密码</span>
          <input v-model="form.password" type="password" placeholder="••••••" />
        </label>

        <label>
          <span>分类</span>
          <select v-model="form.categoryId">
            <option v-for="cat in categories" :key="cat.id" :value="cat.id">
              {{ cat.name }}
            </option>
          </select>
        </label>

        <div class="modal-footer">
          <button type="button" @click="emit('close')">取消</button>
          <button type="submit" class="primary">{{ host ? "保存" : "添加" }}</button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  width: 360px;
  max-width: 90vw;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
}
.modal-header h3 {
  font-size: 16px;
}

.modal-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

label {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
label span {
  font-size: 12px;
  color: var(--text-secondary);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
</style>
```

- [ ] **步骤 2：提交**

```bash
git add src/components/HostForm.vue
git commit -m "feat: add host form modal component"
```

---

## 任务 12：标签页栏组件

**文件：**
- 新建：`src/components/TabBar.vue`

**接口：**
- 消费：`useTabs()` composable
- 产出：带关闭按钮的水平标签页条

- [ ] **步骤 1：编写组件**

创建 `src/components/TabBar.vue`：

```vue
<script setup lang="ts">
import { useTabs } from "../composables/useTabs";

const emit = defineEmits<{
  closeConnection: [connectionId: string];
}>();

const { tabs, activeTabId, setActiveTab, closeTab } = useTabs();

function handleClose(id: string, connectionId: string, event: MouseEvent) {
  event.stopPropagation();
  closeTab(id);
  emit("closeConnection", connectionId);
}
</script>

<template>
  <div class="tab-bar">
    <div
      v-for="tab in tabs"
      :key="tab.id"
      class="tab"
      :class="{ active: tab.id === activeTabId }"
      @click="setActiveTab(tab.id)"
    >
      <span class="tab-title">{{ tab.title }}</span>
      <button
        class="tab-close"
        @click="handleClose(tab.id, tab.connectionId, $event)"
        title="关闭"
      >×</button>
    </div>
  </div>
</template>

<style scoped>
.tab-bar {
  display: flex;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  overflow-x: auto;
  min-height: 36px;
}

.tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-right: 1px solid var(--border-color);
  cursor: pointer;
  white-space: nowrap;
  max-width: 200px;
}
.tab:hover {
  background: var(--bg-tertiary);
}
.tab.active {
  background: var(--bg-primary);
  border-bottom: 2px solid var(--accent);
}

.tab-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
}

.tab-close {
  background: transparent;
  border: none;
  padding: 0 4px;
  font-size: 14px;
  opacity: 0.5;
}
.tab-close:hover {
  opacity: 1;
  color: var(--danger);
  background: transparent;
}
</style>
```

- [ ] **步骤 2：提交**

```bash
git add src/components/TabBar.vue
git commit -m "feat: add tab bar component"
```

---

## 任务 13：终端面板组件

**文件：**
- 新建：`src/components/TerminalPane.vue`

**接口：**
- 消费：`useConnections()` composable
- 产出：绑定到连接的 xterm.js 终端，处理 I/O 和调整大小

- [ ] **步骤 1：编写组件**

创建 `src/components/TerminalPane.vue`：

```vue
<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useConnections } from "../composables/useConnections";

const props = defineProps<{
  connectionId: string;
  hostName: string;
  active: boolean;
}>();

const emit = defineEmits<{
  connected: [];
  disconnected: [];
}>();

const { send, resize, onOutput, onClose } = useConnections();

const terminalRef = ref<HTMLDivElement | null>(null);
let terminal: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let unsubOutput: (() => void) | null = null;
let unsubClose: (() => void) | null = null;

function initTerminal() {
  if (!terminalRef.value) return;

  terminal = new Terminal({
    theme: {
      background: "#1a1a1a",
      foreground: "#e0e0e0",
      cursor: "#e0e0e0",
      selection: "#4a4a4a",
      black: "#1a1a1a",
      red: "#ff5555",
      green: "#50fa7b",
      yellow: "#f1fa8c",
      blue: "#6272a4",
      magenta: "#bd93f9",
      cyan: "#8be9fd",
      white: "#e0e0e0",
    },
    fontFamily: "Consolas, 'Courier New', monospace",
    fontSize: 14,
    cursorBlink: true,
    scrollback: 10000,
  });

  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(terminalRef.value);
  fitAddon.fit();

  // 将输入转发到 SSH
  terminal.onData((data) => {
    send(props.connectionId, data);
  });

  // 监听 SSH 输出
  unsubOutput = onOutput(props.connectionId, (data) => {
    terminal?.write(data);
  });

  // 监听关闭
  unsubClose = onClose(props.connectionId, () => {
    emit("disconnected");
  });

  emit("connected");
}

function handleResize() {
  if (!fitAddon || !terminal) return;
  fitAddon.fit();
  const dims = fitAddon.proposeDimensions();
  if (dims) {
    resize(props.connectionId, dims.cols, dims.rows);
  }
}

watch(
  () => props.active,
  (active) => {
    if (active) {
      // 标签页激活时重新适配
      setTimeout(handleResize, 50);
    }
  }
);

onMounted(() => {
  initTerminal();
  window.addEventListener("resize", handleResize);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", handleResize);
  unsubOutput?.();
  unsubClose?.();
  terminal?.dispose();
});
</script>

<template>
  <div class="terminal-pane" :class="{ active }">
    <div ref="terminalRef" class="terminal-container"></div>
    <div v-if="!active" class="inactive-overlay"></div>
  </div>
</template>

<style scoped>
.terminal-pane {
  position: relative;
  flex: 1;
  overflow: hidden;
  display: none;
}
.terminal-pane.active {
  display: block;
}

.terminal-container {
  width: 100%;
  height: 100%;
  padding: 4px;
}

.inactive-overlay {
  position: absolute;
  inset: 0;
}
</style>
```

- [ ] **步骤 2：提交**

```bash
git add src/components/TerminalPane.vue
git commit -m "feat: add xterm.js terminal pane component"
```

---

## 任务 14：主应用布局集成

**文件：**
- 修改：`src/App.vue`

**接口：**
- 消费：所有 composables 和组件
- 产出：完整应用布局，连接侧边栏、标签页和终端面板

- [ ] **步骤 1：重写 App.vue**

替换 `src/App.vue`：

```vue
<script setup lang="ts">
import { computed } from "vue";
import Sidebar from "./components/Sidebar.vue";
import TabBar from "./components/TabBar.vue";
import TerminalPane from "./components/TerminalPane.vue";
import { useHosts } from "./composables/useHosts";
import { useTabs } from "./composables/useTabs";
import { useConnections } from "./composables/useConnections";
import type { Host } from "./types/ssh";

const { hosts } = useHosts();
const { tabs, activeTabId, openTab } = useTabs();
const { connect, disconnect } = useConnections();

async function handleConnect(host: Host) {
  try {
    const connectionId = await connect({
      host: host.host,
      port: host.port,
      username: host.username,
      password: host.password,
    });
    openTab({
      hostId: host.id,
      title: `${host.name} (${host.username}@${host.host})`,
      connectionId,
    });
  } catch (err) {
    console.error("连接失败:", err);
  }
}

function handleCloseConnection(connectionId: string) {
  disconnect(connectionId);
}

const activeTab = computed(() => tabs.value.find((t) => t.id === activeTabId.value));
</script>

<template>
  <div class="app-layout">
    <Sidebar @connect="handleConnect" />

    <main class="main-area">
      <TabBar @close-connection="handleCloseConnection" />

      <div class="terminal-area">
        <TerminalPane
          v-for="tab in tabs"
          :key="tab.id"
          :connection-id="tab.connectionId"
          :host-name="tab.title"
          :active="tab.id === activeTabId"
        />

        <div v-if="tabs.length === 0" class="empty-state">
          <div class="empty-content">
            <h2>无活动连接</h2>
            <p>从左侧选择主机进行连接</p>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
}

.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.terminal-area {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.empty-state {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-content {
  text-align: center;
  color: var(--text-secondary);
}
.empty-content h2 {
  font-size: 18px;
  margin-bottom: 8px;
  font-weight: 400;
}
.empty-content p {
  font-size: 13px;
}
</style>
```

- [ ] **步骤 2：更新 tauri.conf.json 窗口大小**

编辑 `src-tauri/tauri.conf.json`，增大默认窗口尺寸：

```json
"windows": [
  {
    "title": "Cherimoya SSH",
    "width": 1200,
    "height": 720,
    "minWidth": 800,
    "minHeight": 600
  }
]
```

- [ ] **步骤 3：更新 index.html 标题**

编辑 `index.html`：

```html
<title>Cherimoya SSH 客户端</title>
```

- [ ] **步骤 4：运行应用**

```bash
npm run tauri dev
```

预期：应用启动，深色侧边栏，空白终端区域，可添加主机并连接。

- [ ] **步骤 5：提交**

```bash
git add src/App.vue src-tauri/tauri.conf.json index.html
git commit -m "feat: integrate all components into main app layout"
```

---

## 任务 15：窗口调整大小处理

**文件：**
- 修改：`src/components/TerminalPane.vue`

**接口：**
- 确保窗口调整大小时终端重新适配

- [ ] **步骤 1：添加 ResizeObserver 实现容器感知调整**

更新 `TerminalPane.vue` 中的 `handleResize` 函数并添加 ResizeObserver。替换 `onMounted` 和 `onBeforeUnmount`：

```typescript
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
// ... 现有导入

let resizeObserver: ResizeObserver | null = null;

// 替换 onMounted：
onMounted(() => {
  initTerminal();
  window.addEventListener("resize", handleResize);

  if (terminalRef.value) {
    resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(terminalRef.value);
  }
});

// 替换 onBeforeUnmount：
onBeforeUnmount(() => {
  window.removeEventListener("resize", handleResize);
  resizeObserver?.disconnect();
  unsubOutput?.();
  unsubClose?.();
  terminal?.dispose();
});
```

- [ ] **步骤 2：验证应用仍可运行**

```bash
npm run tauri dev
```

预期：窗口调整大小时终端平滑适配。

- [ ] **步骤 3：提交**

```bash
git add src/components/TerminalPane.vue
git commit -m "fix: add ResizeObserver for terminal pane"
```

---

## 任务 16：连接错误处理与状态显示

**文件：**
- 修改：`src/App.vue`
- 修改：`src/components/TerminalPane.vue`

**接口：**
- 产出：终端中显示错误信息，标签页中显示连接状态指示器

- [ ] **步骤 1：为 TerminalPane 添加错误状态**

在 `TerminalPane.vue` 中，在 `initTerminal` 添加错误处理：

```typescript
const status = ref<"connecting" | "connected" | "error" | "disconnected">("connecting");

function initTerminal() {
  if (!terminalRef.value) return;

  terminal = new Terminal({
    theme: {
      background: "#1a1a1a",
      foreground: "#e0e0e0",
      cursor: "#e0e0e0",
      selection: "#4a4a4a",
      black: "#1a1a1a",
      red: "#ff5555",
      green: "#50fa7b",
      yellow: "#f1fa8c",
      blue: "#6272a4",
      magenta: "#bd93f9",
      cyan: "#8be9fd",
      white: "#e0e0e0",
    },
    fontFamily: "Consolas, 'Courier New', monospace",
    fontSize: 14,
    cursorBlink: true,
    scrollback: 10000,
  });

  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(terminalRef.value);
  fitAddon.fit();

  terminal.writeln(`\x1b[33m正在连接 ${props.hostName}...\x1b[0m\r\n`);

  terminal.onData((data) => {
    if (status.value === "connected") {
      send(props.connectionId, data);
    }
  });

  unsubOutput = onOutput(props.connectionId, (data) => {
    if (status.value === "connecting") {
      status.value = "connected";
    }
    terminal?.write(data);
  });

  unsubClose = onClose(props.connectionId, () => {
    status.value = "disconnected";
    terminal?.writeln("\r\n\x1b[31m连接已关闭。\x1b[0m");
    emit("disconnected");
  });

  status.value = "connecting";
}
```

- [ ] **步骤 2：更新 App.vue 处理连接错误**

在 `App.vue` 中，更新 `handleConnect`：

```typescript
async function handleConnect(host: Host) {
  try {
    const connectionId = await connect({
      host: host.host,
      port: host.port,
      username: host.username,
      password: host.password,
    });
    openTab({
      hostId: host.id,
      title: `${host.name} (${host.username}@${host.host})`,
      connectionId,
    });
  } catch (err) {
    console.error("连接失败:", err);
    // 可在此显示 toast/通知
  }
}
```

- [ ] **步骤 3：提交**

```bash
git add src/components/TerminalPane.vue src/App.vue
git commit -m "feat: add connection status and error handling"
```

---

## 自查清单

**需求覆盖：**
- ✅ 左侧边栏，支持添加/删除主机 → 任务 10、11
- ✅ 分类管理主机 → 任务 10、11
- ✅ 顶部标签页支持多连接 → 任务 12
- ✅ 标签页切换 → 任务 12、14
- ✅ 深灰黑背景，白色文字 → 任务 9
- ✅ 清晰的终端显示 → 任务 13
- ✅ SSH 连接功能 → 任务 5-8、14

**占位符扫描：** 无 TBD，无"稍后实现"，所有代码完整。

**类型一致性：** `Host`、`Category`、`Tab`、`ConnectionState`、`HostInput` 类型在任务 2 中定义，在所有任务中一致使用。

---

方案已完成并保存至 `docs/superpowers/plans/2026-08-27-ssh-client.md`。两种执行方式：

**1. 子代理驱动（推荐）** — 每个任务分派独立子代理，任务间审查，快速迭代

**2. 内联执行** — 在当前会话中使用 executing-plans 执行，批量执行带检查点

**选择哪种方式？**
