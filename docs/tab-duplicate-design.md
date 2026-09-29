# 标签页「复制」功能设计

## 概述

为标签页右键菜单增加「复制」项，用于对同一台主机建立**多个并行的独立 SSH 会话**。典型场景：同时开两个终端看同一台机器上不同目录的日志，或一个跑前台任务、一个做运维操作。

复制出的标签页与原标签页是**两个互不相干的会话**——各自独立的 `connectionId`、独立的 PTY、独立的滚动缓冲区，关闭其中一个不影响另一个。

---

## 现状分析

### 标签页右键菜单

`src/components/TabBar.vue:24-41` 维护一个 `contextMenu` ref（`{ tabId, x, y }`），在 `144-147` 渲染菜单，目前只有两项：

```vue
<div class="context-menu-item" @click="startRename">重命名</div>
<div class="context-menu-item danger" @click="menuClose">关闭</div>
```

`TabBar` 不持有连接能力，只通过 `emit("closeConnection", connectionId)` 把动作交给 `App.vue`。

### 连接流程

`App.vue:19-41` 的 `handleConnect(host)` 是唯一的终端连接入口：

1. `openTab({ hostId, title, connectionId: "pending" })` —— 先建标签页，显示「正在连接」
2. `await connect({ host, port, username, password })` —— 拿到 Rust 侧返回的真实 UUID
3. `updateConnectionId(tab.id, connectionId)` —— 把占位符替换成真实 ID

`TerminalPane.vue:72` 的 `setupListeners()` 监听 `props.connectionId`，从 `"pending"` 变成真实 UUID 时才挂载事件监听。**这个「先占位、后回填」的模式是复制功能可以直接复用的**：只要新标签页也走一遍这个流程，就自然得到一个独立会话。

### 关键障碍：`openTab` 的 connectionId 去重

`src/composables/useTabs.ts:32-42`：

```ts
function openTab(input: OpenTabInput): Tab {
  const existing = tabs.value.find((t) => t.connectionId === input.connectionId);
  if (existing) {
    activeTabId.value = existing.id;
    return existing;          // ← 直接复用，不创建新标签页
  }
  ...
}
```

这段去重的**本意**应该是「点击已连接的主机时聚焦到已有标签页」。但按 `connectionId` 匹配实现不了这个意图，因为：

- 每次 `connect()` 都由 Rust 侧生成**全新的 UUID**，所以点击已连接的主机时，`input.connectionId` 是 `"pending"`，而已有标签页的 `connectionId` 是某个 UUID —— **永远匹配不上**，去重从不生效
- 真正能匹配上的唯一情况，是**两个连接同时在途**（都是 `"pending"`）

也就是说这行代码没有实现它想实现的功能，反而引入了一个 bug。而这个 bug 恰好会挡住「复制」：

> **复现**：点击主机 A（连接尚未返回）→ 立刻点击主机 B
> **结果**：`openTab` 匹配到 A 的 pending 标签页并直接返回，B 的标签页从未创建；随后 `updateConnectionId` 把 A 标签页的 `connectionId` 覆盖成 B 的会话 ID。
> **后果**：界面上只有一个标签页，xterm 缓冲区里还是 A 的输出，实际连着 B；A 的 SSH 会话在 Rust 侧继续存活，既没有标签页可以关闭，也不会被 `disconnect`，属于**连接泄漏**。

同样的路径也存在于 SFTP：`Sidebar.vue:84-108` 的 `handleSftpConnect` 也用 `connectionId: "pending"` 调 `openTab`，所以「终端连接在途时开 SFTP」会撞上同一个问题。

**结论：复制功能必须先把这行去重修掉，否则新标签页会被静默吞掉。**

---

## 方案设计

### 交互设计

右键菜单新增一项，排在「重命名」之上：

```
┌──────────┐
│ 复制      │
│ 重命名    │
│ 关闭      │   ← 红色
└──────────┘
```

- 点击「复制」→ 在原标签页**右侧**插入新标签页 → 立即发起连接 → 新标签页成为活动标签页
- 新标签页标题自动编号：`web-01 (root@10.0.0.1)` → `web-01 (root@10.0.0.1) (2)` → `(3)`……
- 原标签页完全不受影响，继续运行
- **SFTP 标签页不显示「复制」菜单项**（本次不支持，理由见「设计决策」）

标题编号规则：去掉结尾的 ` (N)` 得到基准标题，在**同 `hostId`** 的标签页中找已用的最大 `N`，取 `N+1`；无后缀的视为 `1`。这样即使用户先手动重命名过，编号也不会重复。

插入位置规则：插到「同 `hostId` + 同基准标题」的**最后一个**标签页右侧。这样连续对同一标签页点「复制」时，副本按 `(2)`、`(3)`、`(4)` 的顺序聚在一起；若简单地插在源标签页正右侧，连续复制的顺序会变成倒序（`(4)(3)(2)`），不符合直觉。

### 各文件改动

#### 1. `src/composables/useTabs.ts` —— 修去重 + 新增 `duplicateTab`

**修去重**（`useTabs.ts:33`）：`"pending"` 只是占位符，不代表真实会话，不参与去重。

```ts
function openTab(input: OpenTabInput): Tab {
  // "pending" 是连接中的占位符，每次都是独立会话，不参与去重
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

这个改动**不影响点击已连接主机的行为**——如上文分析，那种情况下去重本来就不生效。

**新增 `duplicateTab(tabId: string): Tab | null`**，并在 `UseTabsReturn` 接口中声明：

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

  // 插到「同主机 + 同基准标题」的最后一个标签页右侧
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

配套两个纯函数：`stripSuffix(title)` 去掉结尾的 ` (N)`，`nextDuplicateTitle(src, all)` 负责编号计算（见上文规则），都抽出来便于测试。

> 注意：`duplicateTab` 只负责**建标签页**，不发起连接。连接是副作用，放在 `App.vue` 里，与 `handleConnect` 保持一致的分工——`useTabs` 只管状态，`App` 管编排。

#### 2. `src/App.vue` —— 抽出共用的连接逻辑

当前 `handleConnect` 把「建标签页」和「发起连接」揉在一起。复制功能需要「用已有的标签页发起连接」，所以把后半段抽出来：

```ts
/** 向已创建的标签页发起连接，并在成功后回填 connectionId */
async function connectInto(tab: Tab, host: Host) {
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

function handleConnect(host: Host) {
  const tab = openTab({
    hostId: host.id,
    title: `${host.name} (${host.username}@${host.host})`,
    connectionId: "pending",
  });
  connectInto(tab, host);   // 不 await，标签页立刻可见
}

async function handleDuplicateTab(tabId: string) {
  const src = tabs.value.find((t) => t.id === tabId);
  if (!src) return;

  const host = hosts.value.find((h) => h.id === src.hostId);
  if (!host) {
    error("该主机已被删除，无法复制");
    return;
  }

  const tab = duplicateTab(tabId);
  if (tab) connectInto(tab, host);
}
```

需要新增 `const { hosts } = useHosts();` 和从 `useTabs()` 取出 `duplicateTab`。

#### 3. `src/components/TabBar.vue` —— 菜单项

新增一个 emit、一个 computed 和一个处理函数：

```ts
import { computed, ref } from "vue";   // 原本只导入了 ref

const emit = defineEmits<{
  closeConnection: [connectionId: string];
  duplicateTab: [tabId: string];
}>();

/** 菜单当前指向的标签页，用于按 kind 条件渲染菜单项 */
const contextMenuTab = computed(() =>
  tabs.value.find((t) => t.id === contextMenu.value?.tabId) ?? null
);

function menuDuplicate() {
  if (!contextMenu.value) return;
  emit("duplicateTab", contextMenu.value.tabId);
  contextMenu.value = null;
}
```

模板中插入菜单项，SFTP 标签页不渲染：

```vue
<div
  v-if="contextMenuTab?.kind === 'terminal'"
  class="context-menu-item"
  @click="menuDuplicate"
>复制</div>
```

#### 4. 绑定：`App.vue` 模板

```vue
<TabBar
  @close-connection="handleCloseConnection"
  @duplicate-tab="handleDuplicateTab"
/>
```

---

## 边界情况

| 场景 | 处理 |
|------|------|
| 源标签页的主机已被删除 | 通知「该主机已被删除，无法复制」，不创建标签页 |
| 源标签页仍处于 `"pending"`（连接中） | 允许复制，再发起一个独立连接 |
| 源标签页已断开（`disconnected`） | 允许复制，新建的连接与旧会话无关 |
| 源标签页是 SFTP | 不渲染「复制」菜单项（本次不支持） |
| 复制后连接失败 | 与 `handleConnect` 一致：**保留标签页**，错误通过通知呈现。注意标签页会停留在「正在连接」，终端里不会有错误文字——见下方遗留问题 |
| 用户已重命名过标签页 | 按重命名后的标题做基准编号，如 `我的日志 (2)` |
| 连续复制多次 | 编号递增到 `(3)`、`(4)`……无上限 |

> **已知遗留问题（非本次引入）**：连接失败时标签页会永久停留在 `connectionId: "pending"`，`TerminalPane` 显示「正在连接」。这是现有 `handleConnect` 的行为，本次不改，但复制功能会放大它（复制失败也留下一个死标签页）。建议后续单独处理，比如失败时把标签页标记为 `error` 状态。

---

## 测试计划

`src/composables/__tests__/` 下新增用例，沿用现有 `_resetForTests()` 模式（见 `useTabs.test.ts`）：

**`useTabs.test.ts` 补充：**

1. 两个 `connectionId: "pending"` 的 `openTab` 调用应创建**两个**标签页（回归测试，锁住去重修复）
2. 相同真实 `connectionId` 的第二次 `openTab` 仍复用已有标签页（确认没破坏原有语义）
3. `duplicateTab` 复制出标题、`hostId`、`kind` 一致的新标签页，且 `connectionId` 为 `"pending"`
4. 新标签页插入在源标签页右侧，并成为活动标签页；连续复制时按编号顺序聚集
5. 标题编号：无后缀 → `(2)`；已有 `(2)` → `(3)`；跳号时取最大值 +1
6. 对不存在的 `tabId` 调 `duplicateTab` 返回 `null`
7. 复制出的标签页与原标签页 `id` 不同

`nextDuplicateTitle` / `stripSuffix` 是纯函数，通过 `duplicateTab` 的用例间接覆盖（编号递增、跳号取最大值、跨主机不共享编号），不依赖模块状态。

**手动验证：**

- 同一主机连续复制 3 次 → 4 个标签页，标题 `(2)(3)(4)`，各自 `pwd` 输出互不干扰
- 在副本里执行 `exit` → 只有该标签页关闭，其余不受影响
- 复制后关闭原标签页 → 副本继续正常工作
- 快速连点两个不同主机 → 两个标签页都出现（验证去重修复）
- 删除主机后再复制其标签页 → 弹出错误通知，不崩溃

---

## 实施步骤

1. `useTabs.ts`：修 `openTab` 去重 + 加 `duplicateTab` / `nextDuplicateTitle` + 更新 `UseTabsReturn`
2. 补 `useTabs.test.ts` 用例（先写测试，确认 1、2 两条在修复前会失败）
3. `App.vue`：抽 `connectInto`，加 `handleDuplicateTab`，绑定 TabBar 事件
4. `TabBar.vue`：加 emit、`contextMenuTab` computed、菜单项与处理函数（SFTP 标签页不渲染）
5. `npm test` + `npm run build`（`vue-tsc --noEmit` 是唯一的静态检查）
6. 手动跑 `npm run tauri dev` 走一遍上面的验证清单

改动集中在 4 个文件，无 Rust 侧改动。

---

## 设计决策（已确认）

1. **SFTP 标签页不支持复制。**
   SFTP 走的是 `useSftp().connect` 这条独立链路（`Sidebar.vue:84`），要支持复制得把 `Sidebar` 里的 SFTP 连接逻辑也抽到 `App.vue`，改动面变大。本次通过菜单项 `v-if` 直接隐藏，后续如需支持再单独做。

2. **菜单项文案为「复制」。**
   已知有被理解成「复制终端文本」的歧义，但「复制标签页 → 再开一个到同一主机的会话」这一语义在右键标签页的上下文里足够清晰，按此实现。

3. **点击已连接的主机，每次都产生新的连接会话。**
   即保持 `openTab` 去重修复后的行为，不额外实现「按 `hostId` 聚焦已有标签页」。这一点与复制功能的意图一致——用户想要第二个会话时，点主机和点「复制」都能拿到一个新会话。

   > 注意：这意味着**不存在**「同一主机只允许一个会话」的约束。若将来要加，应该在 `handleConnect` 里显式按 `hostId + kind` 查找并聚焦，而不是依赖 `openTab` 内部的 `connectionId` 去重——后者在语义上匹配不了这个需求（详见「现状分析」）。
