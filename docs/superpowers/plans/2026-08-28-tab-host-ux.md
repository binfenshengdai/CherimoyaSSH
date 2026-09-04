# 标签页 / 主机表单 UX 增强实施方案

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 为标签页增加重命名、右键菜单、拖拽排序；增加全局通知系统用于连接成功/失败提示；在主机表单增加"测试连接"按钮。

**架构：**
- 通知系统：新建 `useNotifications` composable（模块级单例，与 `useTabs`/`useHosts` 同模式）+ `NotificationHost` 组件（固定定位渲染通知列表，自动消失）。
- 标签页：`useTabs` 增加 `renameTab` / `reorderTab` 方法；`TabBar.vue` 增加 HTML5 拖拽 + 右键菜单（复用 Sidebar 已验证的 context-menu 模式）。
- 连接通知：`App.vue` 的 `handleConnect` 在成功/失败时调用 `notify()`。
- 测试连接：`HostForm.vue` 底部按钮区左侧增加"测试"按钮，调用 `useConnections.connect()` 后立即断开，结果走通知。

**技术栈：** Vue 3.5 + TypeScript, Tauri v2（`@tauri-apps/api/core` invoke），HTML5 原生拖拽 API（不引入拖拽库）

## 全局约束

- **无新依赖：** 拖拽排序使用 HTML5 原生 `draggable` + `onDragStart/Over/Drop`，通知系统用 Vue 响应式 + CSS，不引入第三方库
- **状态模式：** 所有新状态用模块级单例 composable（与 `useTabs`/`useHosts` 一致），测试用 `_resetForTests()` 重置
- **通知自动消失：** 成功 3s、错误 5s 自动关闭，可手动点击关闭
- **测试连接：** 测试通过后立即 `disconnect`，不占用会话；测试中按钮禁用显示"测试中..."
- **右键菜单：** 点击菜单外自动关闭（复用 Sidebar 的 `context-menu-overlay` 模式）
- **提交规则：** 每个任务结束单独 commit，commit message 用中文、`@ feat:` / `@ fix:` 前缀（与现有风格一致）
- **CLAUDE.md 约定：** 不运行 linter（无），构建静态检查仅 `vue-tsc --noEmit`；代码注释与 UI 字符串用中文

---

## 文件结构

```
src/
├── composables/
│   ├── useNotifications.ts        # 新建：通知系统（add/remove/notify，自动消失）
│   └── useTabs.ts                 # 修改：增加 renameTab / reorderTab
├── components/
│   ├── NotificationHost.vue       # 新建：通知列表渲染容器
│   ├── TabBar.vue                 # 修改：拖拽排序 + 右键菜单 + 重命名
│   └── HostForm.vue               # 修改：增加"测试连接"按钮
├── App.vue                        # 修改：挂载 NotificationHost + 连接成功/失败通知
```

---

## 接口契约（跨任务共享）

### `useNotifications` composable（Task 1 产出）

```ts
export interface Notification {
  id: string;
  type: "success" | "error" | "info";
  message: string;
}

export interface UseNotificationsReturn {
  notifications: Ref<Notification[]>;
  notify: (type: Notification["type"], message: string, duration?: number) => void;
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
  remove: (id: string) => void;
}

export function useNotifications(): UseNotificationsReturn;
export function _resetForTests(): void;
```

### `useTabs` 新增方法（Task 3 产出）

```ts
// 追加到 UseTabsReturn 接口
renameTab: (tabId: string, newTitle: string) => void;
reorderTab: (fromIndex: number, toIndex: number) => void;
```

### `NotificationHost` 组件（Task 2 产出）

- 无 props，直接 `useNotifications()` 读取
- `position: fixed; top: 16px; right: 16px; z-index: 9999`
- 通知从右侧滑入，自动消失

---

## 任务

### Task 1: 通知 composable

**Files:**
- Create: `src/composables/__tests__/useNotifications.test.ts`
- Create: `src/composables/useNotifications.ts`

**Interfaces:**
- Consumes: 无
- Produces: `useNotifications()` 返回 `{ notifications, notify, success, error, info, remove }`；`_resetForTests()` 测试重置

- [ ] **Step 1: 写失败测试**

```ts
// src/composables/__tests__/useNotifications.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { useNotifications, _resetForTests } from "../useNotifications";

describe("useNotifications", () => {
  beforeEach(() => _resetForTests());

  it("notify 添加一条通知", () => {
    const { notifications, info } = useNotifications();
    info("hello");
    expect(notifications.value.length).toBe(1);
    expect(notifications.value[0].message).toBe("hello");
    expect(notifications.value[0].type).toBe("info");
  });

  it("success/error 快捷方法设置对应 type", () => {
    const { notifications, success, error } = useNotifications();
    success("ok");
    error("bad");
    expect(notifications.value.map((n) => n.type)).toEqual(["success", "error"]);
  });

  it("remove 按 id 删除", () => {
    const { notifications, info, remove } = useNotifications();
    info("a");
    const id = notifications.value[0].id;
    remove(id);
    expect(notifications.value.length).toBe(0);
  });

  it("自动在 duration 后移除", async () => {
    const { notifications, info } = useNotifications();
    info("temp", 30);
    expect(notifications.value.length).toBe(1);
    await new Promise((r) => setTimeout(r, 50));
    expect(notifications.value.length).toBe(0);
  });

  it("单例：多次调用共享状态", () => {
    const a = useNotifications();
    const b = useNotifications();
    a.info("shared");
    expect(b.notifications.value.length).toBe(1);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/composables/__tests__/useNotifications.test.ts`
Expected: FAIL "Cannot find module '../useNotifications'"

- [ ] **Step 3: 实现 composable**

```ts
// src/composables/useNotifications.ts
import { ref, type Ref } from "vue";

export interface Notification {
  id: string;
  type: "success" | "error" | "info";
  message: string;
}

export interface UseNotificationsReturn {
  notifications: Ref<Notification[]>;
  notify: (type: Notification["type"], message: string, duration?: number) => void;
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
  remove: (id: string) => void;
}

const notifications = ref<Notification[]>([]);

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function useNotifications(): UseNotificationsReturn {
  function notify(type: Notification["type"], message: string, duration = 3000) {
    const id = generateId();
    notifications.value.push({ id, type, message });
    setTimeout(() => {
      remove(id);
    }, duration);
  }

  const success = (msg: string, d?: number) => notify("success", msg, d);
  const error = (msg: string, d?: number) => notify("error", msg, d ?? 5000);
  const info = (msg: string, d?: number) => notify("info", msg, d);

  function remove(id: string) {
    const idx = notifications.value.findIndex((n) => n.id === id);
    if (idx !== -1) notifications.value.splice(idx, 1);
  }

  return { notifications, notify, success, error, info, remove };
}

/** @internal Test-only */
export function _resetForTests(): void {
  notifications.value = [];
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/composables/__tests__/useNotifications.test.ts`
Expected: 5 PASS

- [ ] **Step 5: 类型检查**

Run: `npx vue-tsc --noEmit`
Expected: 无错误

- [ ] **Step 6: Commit**

```bash
git add src/composables/useNotifications.ts src/composables/__tests__/useNotifications.test.ts
git commit -m "@ feat: 增加通知系统 composable（成功/错误/信息，自动消失）"
```

---

### Task 2: NotificationHost 组件 + 挂载到 App

**Files:**
- Create: `src/components/NotificationHost.vue`
- Modify: `src/App.vue`（挂载组件）

**Interfaces:**
- Consumes: `useNotifications()`（Task 1）
- Produces: 全局通知渲染容器

- [ ] **Step 1: 创建 NotificationHost.vue**

```vue
<!-- src/components/NotificationHost.vue -->
<script setup lang="ts">
import { useNotifications } from "../composables/useNotifications";

const { notifications, remove } = useNotifications();
</script>

<template>
  <div class="notification-host">
    <TransitionGroup name="notif" tag="div" class="notif-list">
      <div
        v-for="n in notifications"
        :key="n.id"
        class="notification"
        :class="n.type"
        @click="remove(n.id)"
      >
        <span class="notif-icon">
          {{ n.type === "success" ? "✓" : n.type === "error" ? "✕" : "ℹ" }}
        </span>
        <span class="notif-message">{{ n.message }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.notification-host {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}
.notif-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.notification {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  border-radius: 8px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  min-width: 240px;
  max-width: 360px;
  cursor: pointer;
  font-size: 13px;
}
.notification.success {
  border-left: 3px solid #4caf50;
}
.notification.error {
  border-left: 3px solid #f44336;
}
.notification.info {
  border-left: 3px solid var(--accent);
}
.notif-icon {
  font-size: 16px;
  font-weight: bold;
}
.success .notif-icon { color: #4caf50; }
.error .notif-icon { color: #f44336; }
.info .notif-icon { color: var(--accent); }
.notif-message { flex: 1; }

/* 过渡动画 */
.notif-enter-active {
  transition: all 0.25s ease;
}
.notif-leave-active {
  transition: all 0.2s ease;
  position: absolute;
}
.notif-enter-from {
  opacity: 0;
  transform: translateX(40px);
}
.notif-leave-to {
  opacity: 0;
  transform: translateX(40px);
}
.notif-move {
  transition: transform 0.2s ease;
}
</style>
```

- [ ] **Step 2: 挂载到 App.vue**

在 `src/App.vue` 的 `<script setup>` 末尾加：
```ts
import NotificationHost from "./components/NotificationHost.vue";
```

在 `</div>` 结束 `app-layout` **之前**加（与 `TitleBar`/`app-body` 平级）：
```html
<NotificationHost />
```

- [ ] **Step 3: 类型检查**

Run: `npx vue-tsc --noEmit`
Expected: 无错误

- [ ] **Step 4: 手动验证**

Run: `npm run tauri dev`
Expected: 启动后页面右上角无通知（空态正常），无控制台报错

- [ ] **Step 5: Commit**

```bash
git add src/components/NotificationHost.vue src/App.vue
git commit -m "@ feat: 增加全局通知组件并挂载到主布局"
```

---

### Task 3: useTabs 增加 renameTab / reorderTab

**Files:**
- Create: `src/composables/__tests__/useTabs_rename_reorder.test.ts`
- Modify: `src/composables/useTabs.ts`

**Interfaces:**
- Consumes: 无
- Produces: `renameTab(tabId, newTitle)` / `reorderTab(fromIndex, toIndex)` 加入 `UseTabsReturn`

- [ ] **Step 1: 写失败测试**

```ts
// src/composables/__tests__/useTabs_rename_reorder.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { useTabs, _resetForTests, type OpenTabInput } from "../useHelpers";

function makeTab(hostId: string, connectionId: string): OpenTabInput {
  return { hostId, title: `tab-${hostId}`, connectionId };
}

describe("useTabs rename/reorder", () => {
  beforeEach(() => _resetForTests());

  it("renameTab 修改标题", () => {
    const { openTab, renameTab, tabs } = useTabs();
    const t = openTab(makeTab("h1", "c1"));
    renameTab(t.id, "新名称");
    expect(tabs.value[0].title).toBe("新名称");
  });

  it("renameTab 不存在的 id 静默忽略", () => {
    const { renameTab, tabs } = useTabs();
    renameTab("nope", "x");
    expect(tabs.value.length).toBe(0);
  });

  it("reorderTab 交换位置", () => {
    const { openTab, reorderTab, tabs } = useTabs();
    openTab(makeTab("h1", "c1"));
    openTab(makeTab("h2", "c2"));
    openTab(makeTab("h3", "c3"));
    reorderTab(0, 2);
    expect(tabs.value.map((t) => t.hostId)).toEqual(["h2", "h3", "h1"]);
  });

  it("reorderTab 越界忽略", () => {
    const { openTab, reorderTab, tabs } = useTabs();
    openTab(makeTab("h1", "c1"));
    reorderTab(0, 99);
    expect(tabs.value.map((t) => t.hostId)).toEqual(["h1"]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/composables/__tests__/useTabs_rename_reorder.test.ts`
Expected: FAIL "renameTab is not a function"

- [ ] **Step 3: 实现**

在 `useTabs.ts`：
1. `UseTabsReturn` 接口追加：
```ts
renameTab: (tabId: string, newTitle: string) => void;
reorderTab: (fromIndex: number, toIndex: number) => void;
```
2. 在 `setActiveTab` 之后加：
```ts
function renameTab(tabId: string, newTitle: string): void {
  const tab = tabs.value.find((t) => t.id === tabId);
  if (tab) tab.title = newTitle;
}

function reorderTab(fromIndex: number, toIndex: number): void {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= tabs.value.length ||
    toIndex >= tabs.value.length
  )
    return;
  const [moved] = tabs.value.splice(fromIndex, 1);
  tabs.value.splice(toIndex, 0, moved);
}
```
3. return 对象追加 `renameTab, reorderTab`

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/composables/__tests__/useTabs_rename_reorder.test.ts`
Expected: 4 PASS

- [ ] **Step 5: 类型检查**

Run: `npx vue-tsc --noEmit`
Expected: 无错误

- [ ] **Step 6: Commit**

```bash
git add src/composables/useTabs.ts src/composables/__tests__/useTabs_rename_reorder.test.ts
git commit -m "@ feat: useTabs 增加 renameTab / reorderTab"
```

---

### Task 4: TabBar 右键菜单 + 重命名 + 拖拽排序

**Files:**
- Modify: `src/components/TabBar.vue`

**Interfaces:**
- Consumes: `useTabs()` 的 `renameTab` / `reorderTab`（Task 3）
- Produces: 支持右键菜单（关闭 / 重命名）、拖拽排序的标签栏

- [ ] **Step 1: 重写 TabBar.vue**

```vue
<!-- src/components/TabBar.vue -->
<script setup lang="ts">
import { ref } from "vue";
import { useTabs } from "../composables/useTabs";

const emit = defineEmits<{
  closeConnection: [connectionId: string];
}>();

const { tabs, activeTabId, setActiveTab, closeTab, renameTab, reorderTab } = useTabs();

const contextMenu = ref<{ tabId: string; x: number; y: number } | null>(null);
const renamingTabId = ref<string | null>(null);
const renameInput = ref("");
let dragFromIndex = -1;

function handleClose(id: string, connectionId: string, event: MouseEvent) {
  event.stopPropagation();
  closeTab(id);
  emit("closeConnection", connectionId);
}

function onContextMenu(tabId: string, event: MouseEvent) {
  event.preventDefault();
  contextMenu.value = { tabId, x: event.clientX, y: event.clientY };
}

function closeContextMenu() {
  contextMenu.value = null;
}

function menuClose() {
  if (!contextMenu.value) return;
  const tab = tabs.value.find((t) => t.id === contextMenu.value!.tabId);
  if (tab) {
    closeTab(tab.id);
    emit("closeConnection", tab.connectionId);
  }
  contextMenu.value = null;
}

function startRename() {
  if (!contextMenu.value) return;
  const tab = tabs.value.find((t) => t.id === contextMenu.value!.tabId);
  if (!tab) return;
  renamingTabId.value = tab.id;
  renameInput.value = tab.title;
  contextMenu.value = null;
  // 下一帧聚焦 input
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLInputElement>(".tab-rename-input");
    el?.focus();
    el?.select();
  });
}

function commitRename() {
  if (renamingTabId.value && renameInput.value.trim()) {
    renameTab(renamingTabId.value, renameInput.value.trim());
  }
  renamingTabId.value = null;
}

function cancelRename() {
  renamingTabId.value = null;
}

/* 拖拽排序 */
function onDragStart(index: number, event: DragEvent) {
  dragFromIndex = index;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  }
}

function onDragOver(index: number, event: DragEvent) {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
}

function onDrop(index: number, event: DragEvent) {
  event.preventDefault();
  if (dragFromIndex === -1 || dragFromIndex === index) return;
  reorderTab(dragFromIndex, index);
  dragFromIndex = -1;
}

function onDragEnd() {
  dragFromIndex = -1;
}
</script>

<template>
  <div class="tab-bar">
    <div
      v-for="(tab, index) in tabs"
      :key="tab.id"
      class="tab"
      :class="{ active: tab.id === activeTabId }"
      draggable="true"
      @click="setActiveTab(tab.id)"
      @contextmenu.prevent="onContextMenu(tab.id, $event)"
      @dragstart="onDragStart(index, $event)"
      @dragover="onDragOver(index, $event)"
      @drop="onDrop(index, $event)"
      @dragend="onDragEnd"
    >
      <span v-if="renamingTabId !== tab.id" class="tab-title">{{ tab.title }}</span>
      <input
        v-else
        v-model="renameInput"
        class="tab-rename-input"
        @blur="commitRename"
        @keyup.enter="commitRename"
        @keyup.esc="cancelRename"
        @click.stop
      />
      <button
        class="tab-close"
        @click="handleClose(tab.id, tab.connectionId, $event)"
        title="关闭"
        >×</button>
    </div>

    <!-- 右键菜单 -->
    <div
      v-if="contextMenu"
      class="tab-context-overlay"
      @click="closeContextMenu"
      @contextmenu.prevent="closeContextMenu"
    >
      <div class="tab-context-menu" :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }">
        <div class="context-menu-item" @click="startRename">重命名</div>
        <div class="context-menu-item danger" @click="menuClose">关闭</div>
      </div>
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

.tab-rename-input {
  flex: 1;
  background: var(--bg-primary);
  border: 1px solid var(--accent);
  color: var(--text-primary);
  font-size: 13px;
  padding: 2px 4px;
  border-radius: 3px;
  outline: none;
  min-width: 0;
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

/* 右键菜单 */
.tab-context-overlay {
  position: fixed;
  inset: 0;
  z-index: 1001;
}
.tab-context-menu {
  position: fixed;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 4px 0;
  min-width: 120px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}
.context-menu-item {
  padding: 8px 16px;
  cursor: pointer;
  font-size: 13px;
}
.context-menu-item:hover {
  background: var(--bg-tertiary);
}
.context-menu-item.danger {
  color: var(--danger);
}
</style>
```

- [ ] **Step 2: 类型检查**

Run: `npx vue-tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: 手动验证**

Run: `npm run tauri dev`
Expected:
- 右键标签 → 弹出"重命名/关闭"菜单
- 点"重命名" → 标题变 input，回车/失重命名生效，Esc 取消
- 点"关闭" → 标签关闭
- 拖拽标签到另一标签位置 → 顺序交换
- 点菜单外 → 菜单关闭

- [ ] **Step 4: Commit**

```bash
git add src/components/TabBar.vue
git commit -m "@ feat: 标签栏增加右键菜单（重命名/关闭）+ 拖拽排序"
```

---

### Task 5: 连接成功/失败通知

**Files:**
- Modify: `src/App.vue`

**Interfaces:**
- Consumes: `useNotifications()` 的 `success()` / `error()`（Task 1）

- [ ] **Step 1: 改 App.vue**

`<script setup>` 顶部加：
```ts
import { useNotifications } from "./composables/useNotifications";
```
在 `const { connect, disconnect } = useConnections();` 后加：
```ts
const { success, error } = useNotifications();
```

`handleConnect` 改为：
```ts
async function handleConnect(host: Host) {
  const tab = openTab({
    hostId: host.id,
    title: `${host.name} (${host.username}@${host.host})`,
    connectionId: "pending",
  });

  try {
    const connectionId = await connect({
      host: host.host,
      port: host.port,
      username: host.username,
      password: host.password,
    });
    updateConnectionId(tab.id, connectionId);
    success(`已连接到 ${host.name}`);
  } catch (err) {
    console.error("连接失败:", err);
    error(`连接 ${host.name} 失败：${err instanceof Error ? err.message : String(err)}`);
  }
}
```

- [ ] **Step 2: 类型检查**

Run: `npx vue-tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: 手动验证**

Run: `npm run tauri dev`
Expected:
- 连接成功 → 右上角绿色通知"已连接到 xxx"，3s 后消失
- 连接失败 → 右上角红色通知"连接 xxx 失败：..."，5s 后消失

- [ ] **Step 4: Commit**

```bash
git add src/App.vue
git commit -m "@ feat: 连接成功/失败弹出通知提示"
```

---

### Task 6: 主机表单"测试连接"按钮

**Files:**
- Modify: `src/components/HostForm.vue`

**Interfaces:**
- Consumes: `useConnections()` 的 `connect`/`disconnect`；`useNotifications()` 的 `success`/`error`/`info`

- [ ] **Step 1: 改 HostForm.vue**

`<script setup>` 加：
```ts
import { useConnections } from "../composables/useConnections";
import { useNotifications } from "../composables/useNotifications";
```
在 `const { categories, addHost, updateHost } = useHosts();` 后加：
```ts
const { connect, disconnect } = useConnections();
const { success, error, info } = useNotifications();
```

在 `tryClose()` 之后加：
```ts
const testing = ref(false);

async function handleTest() {
  if (!form.value.host || !form.value.username) {
    error("请填写主机地址和用户名");
    return;
  }
  testing.value = true;
  info("正在测试连接...");
  try {
    const id = await connect({
      host: form.value.host,
      port: form.value.port || 22,
      username: form.value.username,
      password: form.value.password,
    });
    await disconnect(id);
    success(`连接 ${form.value.host} 成功`);
  } catch (err) {
    error(`连接失败：${err instanceof Error ? err.message : String(err)}`);
  } finally {
    testing.value = false;
  }
}
```

模板：把 `.modal-footer` 改为左测试 + 右取消/提交两段：
```html
<div class="modal-footer">
  <button
    type="button"
    class="test-btn"
    :disabled="testing"
    @click="handleTest"
  >
    {{ testing ? "测试中..." : "测试" }}
  </button>
  <div class="modal-footer-right">
    <button type="button" @click="tryClose">取消</button>
    <button type="submit" class="primary">{{ host ? "保存" : "添加" }}</button>
  </div>
</div>
```

CSS 追加（在 `.modal-footer` 后）：
```css
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
}
.modal-footer-right {
  display: flex;
  gap: 8px;
}
.test-btn {
  background: transparent;
  border: 1px solid var(--accent);
  color: var(--accent);
  padding: 6px 14px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
}
.test-btn:hover:not(:disabled) {
  background: var(--accent);
  color: #fff;
}
.test-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

- [ ] **Step 2: 类型检查**

Run: `npx vue-tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: 手动验证**

Run: `npm run tauri dev`
Expected:
- 添加/编辑主机页面底部左侧出现"测试"按钮
- 主机地址/用户名未填时点测试 → 红色通知"请填写主机地址和用户名"
- 填写后点测试 → 灰色通知"正在测试连接..."，按钮变"测试中..."禁用
- 测试成功 → 绿色通知"连接 xxx 成功"
- 测试失败 → 红色通知"连接失败：..."
- 测试完成后按钮恢复可点

- [ ] **Step 4: Commit**

```bash
git add src/components/HostForm.vue
git commit -m "@ feat: 主机表单增加测试连接按钮（左对齐，结果走通知）"
```

---

## 自检

**1. 需求覆盖：**

| 需求 | 对应任务 |
|------|----------|
| 标签页标题支持修改名称 | Task 3 (renameTab) + Task 4 (重命名交互) |
| 右键标签弹出菜单（重命名、关闭等） | Task 4 |
| 前后拖拽重新排序 | Task 3 (reorderTab) + Task 4 (拖拽交互) |
| 连接成功提示 | Task 5 |
| 连接失败报错提示 | Task 5 |
| 通知框 | Task 1 + Task 2 |
| 主机表单测试按钮（左对齐） | Task 6 |
| 测试连接成功/失败提示 | Task 6 |

**2. 占位符扫描：** 无 TBD/TODO，所有步骤含完整代码。

**3. 类型一致性：**
- `notify(type, message, duration?)` — Task 1 定义，Task 5/6 使用，签名一致
- `renameTab(tabId, newTitle)` / `reorderTab(fromIndex, toIndex)` — Task 3 定义，Task 4 使用
- `Notification` 接口 — Task 1 定义，Task 2 渲染

**4. 依赖顺序：** Task 1 (composable) → Task 2 (UI) → Task 3 (tabs 方法) → Task 4 (TabBar) → Task 5 (连接通知) → Task 6 (测试)。每任务可独立编译通过。
