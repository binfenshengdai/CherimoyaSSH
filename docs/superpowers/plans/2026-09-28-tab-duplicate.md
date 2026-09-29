# 标签页「复制」功能实施方案

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 为标签页右键菜单增加「复制」项，对同一台主机建立多个并行的独立 SSH 会话；同时修复 `openTab` 中因 `"pending"` 占位符导致的标签页去重 bug。

**架构：**
- **Task 1（状态层）**：`useTabs.ts` 修 `openTab` 去重逻辑（`"pending"` 占位符不参与去重），新增纯函数 `nextDuplicateTitle()` 与 `duplicateTab()`。`duplicateTab` 只负责建标签页，不发起连接。纯逻辑，用 vitest 覆盖。
- **Task 2（编排层）**：`App.vue` 从 `handleConnect` 抽出共用的 `connectInto(tab, host)`，新增 `handleDuplicateTab(tabId)`——按 `tab.hostId` 从 `useHosts` 查回主机凭据，再复用同一条连接链路。此任务是纯重构 + 新增函数，行为上不改变现有连接流程。
- **Task 3（视图层）**：`TabBar.vue` 新增 `duplicateTab` emit、`contextMenuTab` computed 与菜单项（SFTP 标签页不渲染）。

三层分别可独立验证：Task 1 跑单测，Task 2 回归现有连接流程，Task 3 端到端手动验证。

**技术栈：** Vue 3.5 + TypeScript, Tauri v2, vitest, xterm.js（已有，本次不改）

## 全局约束

- **无新依赖：** 不引入任何第三方库，菜单项复用 `TabBar.vue` 已有的 `.context-menu-item` 样式
- **不改 Rust 侧：** `src-tauri/` 下无任何改动，不需要 `cargo check`
- **状态模式：** `useTabs` 是模块级单例 composable；测试必须在 `beforeEach` 调 `_resetForTests()`，否则状态在用例间泄漏
- **中文约定：** 代码注释与 UI 字符串一律用中文（CLAUDE.md 约定）
- **无 linter：** 本项目没有 linter，`npm run build`（内含 `vue-tsc --noEmit`）是唯一的静态检查
- **提交需确认：** CLAUDE.md 明确要求 commit 和 push 必须先与用户确认，**不得擅自提交**。每个任务末尾的 commit 步骤都要先征求用户同意再执行
- **commit 风格：** 中文 + Conventional Commits 前缀，如 `feat: 标签页支持复制`（与 `git log` 现有风格一致）
- **SFTP 不支持复制：** 菜单项通过 `v-if` 对 `kind === 'sftp'` 直接不渲染，这是已确认的设计决策

---

## 文件结构

```
src/
├── composables/
│   ├── useTabs.ts                              # 修改：修去重 + 新增 nextDuplicateTitle / duplicateTab
│   └── __tests__/
│       └── useTabs_duplicate.test.ts           # 新建：去重修复 + duplicateTab 的单元测试
├── components/
│   └── TabBar.vue                              # 修改：新增 emit、contextMenuTab computed、菜单项
└── App.vue                                     # 修改：抽出 connectInto + 新增 handleDuplicateTab + 事件绑定
```

参考文档：`docs/tab-duplicate-design.md`（设计依据与现状分析）

---

## 接口契约（跨任务共享）

### `useTabs.ts` 新增导出（Task 1 产出）

```ts
export interface UseTabsReturn {
  tabs: Ref<Tab[]>;
  activeTabId: Ref<string | null>;
  openTab: (input: OpenTabInput) => Tab;
  updateConnectionId: (tabId: string, connectionId: string) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  renameTab: (tabId: string, newTitle: string) => void;
  reorderTab: (fromIndex: number, toIndex: number) => void;
  duplicateTab: (tabId: string) => Tab | null;   // ← 新增
}

/** 计算复制标签页的标题，如 "S1" → "S1 (2)"。纯函数，已导出便于单测 */
export function nextDuplicateTitle(src: Tab, all: Tab[]): string;
```

**行为契约：**
- `duplicateTab(tabId)` 返回新标签页；`tabId` 不存在时返回 `null` 且不修改状态
- 新标签页的 `connectionId` 恒为 `"pending"`，`kind` / `hostId` 与源标签页一致
- 新标签页插入在**同主机 + 同基准标题**的最后一个标签页右侧，并成为活动标签页

### `App.vue` 新增（Task 2 产出）

```ts
/** 向已创建的标签页发起连接，成功后回填真实 connectionId。失败时保留标签页并通知 */
async function connectInto(tab: Tab, host: Host): Promise<void>;

/** 供 TabBar 的 duplicateTab 事件调用 */
async function handleDuplicateTab(tabId: string): Promise<void>;
```

### `TabBar.vue` 事件（Task 3 产出）

```ts
const emit = defineEmits<{
  closeConnection: [connectionId: string];
  duplicateTab: [tabId: string];   // ← 新增
}>();
```

---

## Task 1: `useTabs` 去重修复 + `duplicateTab`

**Files:**
- Modify: `src/composables/useTabs.ts`
- Create: `src/composables/__tests__/useTabs_duplicate.test.ts`

**Interfaces:**
- Consumes: 无（本任务是最底层）
- Produces:
  - `useTabs().duplicateTab(tabId: string): Tab | null`
  - `nextDuplicateTitle(src: Tab, all: Tab[]): string`
  - 修复后的 `openTab`：`connectionId === "pending"` 时不参与去重

---

- [ ] **Step 1: 新建测试文件，写去重修复的失败测试**

创建 `src/composables/__tests__/useTabs_duplicate.test.ts`：

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { useTabs, _resetForTests, type OpenTabInput } from "../useTabs";

function makeTab(hostId: string, connectionId: string, title = `tab-${hostId}`): OpenTabInput {
  return { hostId, title, connectionId };
}

describe("useTabs openTab 去重", () => {
  beforeEach(() => _resetForTests());

  it("两个 pending 占位符创建两个独立标签页", () => {
    const { openTab, tabs } = useTabs();
    openTab(makeTab("h1", "pending"));
    openTab(makeTab("h2", "pending"));
    expect(tabs.value.length).toBe(2);
    expect(tabs.value.map((t) => t.hostId)).toEqual(["h1", "h2"]);
  });

  it("相同真实 connectionId 复用已有标签页", () => {
    const { openTab, tabs, activeTabId } = useTabs();
    const first = openTab(makeTab("h1", "c1"));
    openTab(makeTab("h2", "c2"));
    const again = openTab(makeTab("h1", "c1"));
    expect(tabs.value.length).toBe(2);
    expect(again.id).toBe(first.id);
    expect(activeTabId.value).toBe(first.id);
  });
});
```

- [ ] **Step 2: 运行测试，确认第一条失败**

Run: `npx vitest run src/composables/__tests__/useTabs_duplicate.test.ts`
Expected: 第一个用例 FAIL —— `expected 1 to be 2`（第二个 `openTab` 被去重逻辑匹配到 pending 标签页并复用，没有创建新标签页）。第二个用例 PASS。

- [ ] **Step 3: 修复 `openTab` 去重逻辑**

修改 `src/composables/useTabs.ts`，将 `openTab` 函数体（当前在 `useTabs.ts:32-42`）整体替换为：

```ts
  function openTab(input: OpenTabInput): Tab {
    // "pending" 是连接中的占位符，每次都是独立会话，不参与去重。
    // 否则两个连接同时在途时，后一个会被前一个的占位标签页吞掉。
    if (input.connectionId !== "pending") {
      const existing = tabs.value.find((t) => t.connectionId === input.connectionId);
      if (existing) {
        activeTabId.value = existing.id;
        return existing;
      }
    }
    const tab: Tab = { id: generateId(), kind: "terminal", sftpPath: undefined, ...input };
    tabs.value.push(tab);
    activeTabId.value = tab.id;
    return tab;
  }
```

- [ ] **Step 4: 运行测试，确认两条都通过**

Run: `npx vitest run src/composables/__tests__/useTabs_duplicate.test.ts`
Expected: PASS，2 passed

- [ ] **Step 5: 追加 `duplicateTab` 的失败测试**

在 `src/composables/__tests__/useTabs_duplicate.test.ts` 末尾追加：

```ts
describe("useTabs duplicateTab", () => {
  beforeEach(() => _resetForTests());

  it("复制出独立标签页，connectionId 为 pending", () => {
    const { openTab, duplicateTab, tabs } = useTabs();
    const src = openTab(makeTab("h1", "c1", "S1"));
    const copy = duplicateTab(src.id);
    expect(copy).not.toBeNull();
    expect(copy!.id).not.toBe(src.id);
    expect(copy!.hostId).toBe("h1");
    expect(copy!.kind).toBe("terminal");
    expect(copy!.connectionId).toBe("pending");
    expect(tabs.value.length).toBe(2);
  });

  it("插入在源标签页右侧并成为活动标签页", () => {
    const { openTab, duplicateTab, tabs, activeTabId } = useTabs();
    const t1 = openTab(makeTab("h1", "c1", "S1"));
    const src = openTab(makeTab("h2", "c2", "S2"));
    const t3 = openTab(makeTab("h3", "c3", "S3"));
    const copy = duplicateTab(src.id)!;
    expect(tabs.value.map((t) => t.id)).toEqual([t1.id, src.id, copy.id, t3.id]);
    expect(activeTabId.value).toBe(copy.id);
  });

  it("连续复制同一标签页，标题按编号递增且顺序聚集", () => {
    const { openTab, duplicateTab, tabs } = useTabs();
    const src = openTab(makeTab("h1", "c1", "S1"));
    duplicateTab(src.id);
    duplicateTab(src.id);
    duplicateTab(src.id);
    expect(tabs.value.map((t) => t.title)).toEqual(["S1", "S1 (2)", "S1 (3)", "S1 (4)"]);
  });

  it("源标签页已有编号时，取最大编号 +1", () => {
    const { openTab, duplicateTab, tabs } = useTabs();
    const src = openTab(makeTab("h1", "c1", "S1"));
    openTab(makeTab("h1", "c2", "S1 (3)"));
    duplicateTab(src.id);
    expect(tabs.value.map((t) => t.title)).toEqual(["S1", "S1 (3)", "S1 (4)"]);
  });

  it("不同主机不共享编号", () => {
    const { openTab, duplicateTab, tabs } = useTabs();
    const src = openTab(makeTab("h1", "c1", "S1"));
    openTab(makeTab("h2", "c2", "S1"));
    duplicateTab(src.id);
    expect(tabs.value.map((t) => t.title)).toEqual(["S1", "S1 (2)", "S1"]);
  });

  it("不存在的 tabId 返回 null 且不修改状态", () => {
    const { duplicateTab, tabs } = useTabs();
    expect(duplicateTab("nope")).toBeNull();
    expect(tabs.value.length).toBe(0);
  });
});
```

- [ ] **Step 6: 运行测试，确认 `duplicateTab` 相关用例失败**

Run: `npx vitest run src/composables/__tests__/useTabs_duplicate.test.ts`
Expected: 前 2 个用例 PASS，后 6 个 FAIL —— `duplicateTab is not a function`（TypeScript 层面也会报 `Property 'duplicateTab' does not exist`）

- [ ] **Step 7: 实现 `nextDuplicateTitle` 与 `duplicateTab`**

在 `src/composables/useTabs.ts` 中，紧跟在 `generateId()` 函数之后（当前 `useTabs.ts:6` 附近）加入两个纯函数：

```ts
/** 去掉标题结尾的 " (N)" 编号，得到基准标题 */
function stripSuffix(title: string): string {
  return title.replace(/ \(\d+\)$/, "");
}

/**
 * 计算复制标签页的标题：以源标题为基准，在同 hostId 的标签页中
 * 找已用的最大编号，取 +1。无后缀的标题视为第 1 个。
 * 例：唯一标签 "S1" → "S1 (2)"；已有 "S1" 和 "S1 (3)" → "S1 (4)"
 */
export function nextDuplicateTitle(src: Tab, all: Tab[]): string {
  const base = stripSuffix(src.title);
  let max = 0;
  for (const t of all) {
    if (t.hostId !== src.hostId) continue;
    if (stripSuffix(t.title) !== base) continue;
    const m = t.title.match(/ \((\d+)\)$/);
    max = Math.max(max, m ? Number(m[1]) : 1);
  }
  return `${base} (${max + 1})`;
}
```

在 `useTabs()` 内部、`reorderTab` 之后加入 `duplicateTab`：

```ts
  function duplicateTab(tabId: string): Tab | null {
    const idx = tabs.value.findIndex((t) => t.id === tabId);
    if (idx === -1) return null;

    const src = tabs.value[idx];
    const base = stripSuffix(src.title);

    const copy: Tab = {
      id: generateId(),
      hostId: src.hostId,
      title: nextDuplicateTitle(src, tabs.value),
      connectionId: "pending",
      kind: src.kind,
      sftpPath: src.kind === "sftp" ? "/" : undefined,
    };

    // 插到「同主机 + 同基准标题」的最后一个标签页右侧，
    // 这样连续复制同一标签页时，副本按编号顺序聚在一起而不是倒序
    let insertAt = idx;
    for (let i = idx + 1; i < tabs.value.length; i++) {
      const t = tabs.value[i];
      if (t.hostId === src.hostId && stripSuffix(t.title) === base) insertAt = i;
    }

    tabs.value.splice(insertAt + 1, 0, copy);
    activeTabId.value = copy.id;
    return copy;
  }
```

最后更新 `UseTabsReturn` 接口（`useTabs.ts:16-25`）与 `useTabs()` 的返回值（`useTabs.ts:84`），都加上 `duplicateTab`：

```ts
export interface UseTabsReturn {
  tabs: Ref<Tab[]>;
  activeTabId: Ref<string | null>;
  openTab: (input: OpenTabInput) => Tab;
  updateConnectionId: (tabId: string, connectionId: string) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  renameTab: (tabId: string, newTitle: string) => void;
  reorderTab: (fromIndex: number, toIndex: number) => void;
  duplicateTab: (tabId: string) => Tab | null;
}
```

```ts
  return { tabs, activeTabId, openTab, updateConnectionId, closeTab, setActiveTab, renameTab, reorderTab, duplicateTab };
```

- [ ] **Step 8: 运行测试，确认全部通过**

Run: `npx vitest run src/composables/__tests__/useTabs_duplicate.test.ts`
Expected: PASS，8 passed

- [ ] **Step 9: 跑全量测试，确认没有破坏既有用例**

Run: `npm test`
Expected: 全部 PASS。特别注意 `useTabs.test.ts` 和 `useTabs_rename_reorder.test.ts` 必须仍然通过——它们用的 `connectionId` 都是 `"c1"` / `"c2"` 这类真实值，不受去重修复影响。

- [ ] **Step 10: 静态检查**

Run: `npm run build`
Expected: `vue-tsc --noEmit` 无类型错误，vite 构建成功

- [ ] **Step 11: 征求确认后提交**

**先向用户确认，得到同意后再执行：**

```bash
git add src/composables/useTabs.ts src/composables/__tests__/useTabs_duplicate.test.ts
git commit -m "fix: openTab 的 pending 占位符不再参与去重

同时新增 duplicateTab / nextDuplicateTitle，为标签页复制功能提供状态层支持。"
```

---

## Task 2: `App.vue` 抽出 `connectInto` + 新增 `handleDuplicateTab`

**Files:**
- Modify: `src/App.vue:1-46`（`<script setup>` 部分）

**Interfaces:**
- Consumes: `useTabs().duplicateTab(tabId)`（Task 1 产出）
- Produces:
  - `connectInto(tab: Tab, host: Host): Promise<void>`
  - `handleDuplicateTab(tabId: string): Promise<void>`
  - 模板上新增 `@duplicate-tab` 绑定（Task 3 的 emit 接这里）

> **本任务不改变现有行为。** `handleConnect` 的对外表现（建标签页 → 连接 → 通知）必须与改动前完全一致，这是本任务的验收标准。

---

- [ ] **Step 1: 改造 `App.vue` 的 `<script setup>`**

将 `src/App.vue:1-46` 的整个 `<script setup>` 块替换为：

```vue
<script setup lang="ts">
import Sidebar from "./components/Sidebar.vue";
import TabBar from "./components/TabBar.vue";
import TerminalPane from "./components/TerminalPane.vue";
import SftpPane from "./components/SftpPane.vue";
import SftpProgressHost from "./components/SftpProgressHost.vue";
import DialogHost from "./components/DialogHost.vue";
import TitleBar from "./components/TitleBar.vue";
import NotificationHost from "./components/NotificationHost.vue";
import { useTabs } from "./composables/useTabs";
import { useHosts } from "./composables/useHosts";
import { useConnections } from "./composables/useConnections";
import { useNotifications } from "./composables/useNotifications";
import type { Host, Tab } from "./types/ssh";

const { tabs, activeTabId, openTab, updateConnectionId, duplicateTab } = useTabs();
const { hosts } = useHosts();
const { connect, disconnect } = useConnections();
const { success, error } = useNotifications();

/** 向已创建的标签页发起连接，成功后回填真实 connectionId。失败时保留标签页并通知 */
async function connectInto(tab: Tab, host: Host) {
  try {
    const connectionId = await connect({
      host: host.host,
      port: host.port,
      username: host.username,
      password: host.password,
    });
    // 连接成功后更新 connectionId
    updateConnectionId(tab.id, connectionId);
    success(`已连接到 ${host.name}`);
  } catch (err) {
    console.error("连接失败:", err);
    error(`连接 ${host.name} 失败：${err instanceof Error ? err.message : String(err)}`);
  }
}

async function handleConnect(host: Host) {
  // 先打开标签页，显示"正在连接"
  const tab = openTab({
    hostId: host.id,
    title: `${host.name} (${host.username}@${host.host})`,
    connectionId: "pending",
  });
  await connectInto(tab, host);
}

async function handleDuplicateTab(tabId: string) {
  const src = tabs.value.find((t) => t.id === tabId);
  if (!src) return;

  const host = hosts.value.find((h) => h.id === src.hostId);
  if (!host) {
    error("该主机已被删除，无法复制");
    return;
  }

  const copy = duplicateTab(tabId);
  if (copy) await connectInto(copy, host);
}

function handleCloseConnection(connectionId: string) {
  disconnect(connectionId);
}
</script>
```

**改动要点：**
- 新增 `useHosts` 导入与 `hosts` 解构——复制时需要按 `tab.hostId` 查回主机凭据（密码存在 `Host` 上）
- 新增 `Tab` 类型导入，用于 `connectInto` 的参数标注
- 原来 `handleConnect` 里「建标签页 + 连接」两段逻辑拆成 `openTab`（留在 `handleConnect`）和 `connectInto`（共用）
- 新增 `handleDuplicateTab`：查主机 → 主机不存在则报错返回 → `duplicateTab` → `connectInto`

- [ ] **Step 2: 绑定 TabBar 的 `duplicate-tab` 事件**

在 `src/App.vue` 模板中，将 TabBar 那一行改为：

```vue
        <TabBar
          @close-connection="handleCloseConnection"
          @duplicate-tab="handleDuplicateTab"
        />
```

> Task 3 尚未完成时，`duplicate-tab` 还没有任何地方 emit 它，绑定是空转的——这不影响编译，也不会产生警告。

- [ ] **Step 3: 静态检查**

Run: `npm run build`
Expected: 无类型错误，构建成功。若报 `Property 'duplicateTab' does not exist`，说明 Task 1 未完成或未导出。

- [ ] **Step 4: 回归验证现有连接流程（本任务的验收）**

Run: `npm run tauri dev`

依次确认（这些行为必须与改动前**完全一致**）：
1. 左侧点击任一主机 → 标签页立即出现，标题为 `<名称> (<用户>@<主机>)`，终端显示「正在连接 …」
2. 连接成功后终端出现 shell 提示符，右上角弹出绿色「已连接到 <名称>」通知
3. 输入 `ls` 等命令，输出正常回显
4. 点击标签页的 `×` → 标签页关闭，SSH 会话断开
5. 故意填错密码的主机 → 弹出红色失败通知，标签页保留
6. 快速连续点击两个**不同**主机 → **两个标签页都出现**（这是 Task 1 去重修复带来的变化，也正是修复的目标）
7. 标签页右键 → 「重命名」和「关闭」仍正常工作

- [ ] **Step 5: 征求确认后提交**

**先向用户确认，得到同意后再执行：**

```bash
git add src/App.vue
git commit -m "refactor: 抽出 connectInto 并新增 handleDuplicateTab

将 handleConnect 中「建标签页」与「发起连接」拆开，复制标签页复用同一条连接链路。"
```

---

## Task 3: `TabBar.vue` 右键菜单新增「复制」

**Files:**
- Modify: `src/components/TabBar.vue:1-9`（导入与 emit）、`TabBar.vue:29-41` 附近（新增 computed 与处理函数）、`TabBar.vue:144-147`（菜单模板）

**Interfaces:**
- Consumes: `handleDuplicateTab(tabId: string)`（Task 2 产出，通过模板事件绑定）
- Produces: `emit("duplicateTab", tabId: string)` —— 供 `App.vue` 的 `@duplicate-tab` 接收

---

- [ ] **Step 1: 导入 `computed` 并扩展 emit 定义**

将 `src/components/TabBar.vue:1-9` 替换为：

```ts
import { computed, ref } from "vue";
import { useTabs } from "../composables/useTabs";

const emit = defineEmits<{
  closeConnection: [connectionId: string];
  duplicateTab: [tabId: string];
}>();

const { tabs, activeTabId, setActiveTab, closeTab, renameTab, reorderTab } = useTabs();
```

- [ ] **Step 2: 新增 `contextMenuTab` computed 与 `menuDuplicate` 处理函数**

在 `src/components/TabBar.vue` 中，紧跟 `closeContextMenu()` 函数之后（当前 `TabBar.vue:29-31` 之后）插入：

```ts
/** 菜单当前指向的标签页，用于按 kind 条件渲染菜单项 */
const contextMenuTab = computed(
  () => tabs.value.find((t) => t.id === contextMenu.value?.tabId) ?? null
);

function menuDuplicate() {
  if (!contextMenu.value) return;
  emit("duplicateTab", contextMenu.value.tabId);
  contextMenu.value = null;
}
```

- [ ] **Step 3: 在菜单模板中插入「复制」项**

将 `src/components/TabBar.vue:144-147` 的菜单内容替换为：

```vue
      <div class="tab-context-menu" :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }">
        <div
          v-if="contextMenuTab?.kind === 'terminal'"
          class="context-menu-item"
          @click="menuDuplicate"
        >复制</div>
        <div class="context-menu-item" @click="startRename">重命名</div>
        <div class="context-menu-item danger" @click="menuClose">关闭</div>
      </div>
```

**要点：** `v-if` 挂在「复制」这一项上，SFTP 标签页不渲染它，菜单自然只剩「重命名」「关闭」两项，布局不变。样式直接复用已有的 `.context-menu-item`，无需改 `<style>`。

- [ ] **Step 4: 静态检查**

Run: `npm run build`
Expected: 无类型错误，构建成功

- [ ] **Step 5: 端到端手动验证**

Run: `npm run tauri dev`

**基础流程：**
1. 连接任一主机 → 标签页右键 → 菜单显示「复制」「重命名」「关闭」三项，「复制」在最上
2. 点击「复制」→ 新标签页出现在原标签页**右侧**，标题为 `<原名> (2)`，并自动成为活动标签页
3. 新标签页终端出现独立的 shell 提示符
4. 在副本里 `cd /tmp`，切回原标签页执行 `pwd` → **输出互不干扰**（确认是两个独立会话）
5. 再对原标签页点两次「复制」→ 标题依次为 `(3)`、`(4)`，且三个副本按编号顺序紧挨排列

**生命周期：**
6. 在副本里执行 `exit` → 只有该标签页关闭，其余标签页不受影响
7. 关闭**原**标签页 → 副本继续正常工作，能正常收发命令
8. 复制后立即关闭原标签页（副本还在连接中）→ 副本仍能连上

**边界情况：**
9. 复制一个「正在连接」中的标签页 → 再开一个独立连接，两个最终都能连上
10. 连接失败的主机 → 复制它 → 弹出失败通知，副本标签页保留
11. 在左侧删掉某主机 → 对它已打开的标签页点「复制」→ 弹出红色「该主机已被删除，无法复制」，**不创建新标签页**，不崩溃
12. 先手动重命名标签页为「我的日志」→ 复制 → 新标题为「我的日志 (2)」
13. 打开一个 SFTP 标签页（左侧主机右键 → SFTP）→ 右键它 → **菜单里没有「复制」**，只有「重命名」「关闭」
14. 在某个标签页的 shell 里执行 `exit`，使其变为已断开状态 → 右键它点「复制」→ 能正常建立新会话，与已断开的旧会话无关

- [ ] **Step 6: 跑全量测试**

Run: `npm test`
Expected: 全部 PASS

- [ ] **Step 7: 征求确认后提交**

**先向用户确认，得到同意后再执行：**

```bash
git add src/components/TabBar.vue
git commit -m "feat: 标签页右键菜单支持复制

复制出的标签页与原标签页是独立的 SSH 会话，SFTP 标签页不显示该项。"
```

---

## 完成后

三个任务全部完成后，建议在 `docs/tab-duplicate-design.md` 顶部补一行「状态：已实现（YYYY-MM-DD）」，方便后续追溯设计与实现的对应关系。这一步并入 Task 3 的提交或单独提交，由用户决定。

**已知遗留问题（本次不修）：** 连接失败时标签页会永久停留在 `connectionId: "pending"`，`TerminalPane` 一直显示「正在连接」。这是现有 `handleConnect` 就有的行为，复制功能会放大它（复制失败也留下一个死标签页）。建议后续单独处理，比如失败时把标签页标记为 `error` 状态。
