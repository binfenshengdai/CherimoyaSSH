import { ref, type Ref } from "vue";
import type { Tab } from "../types/ssh";

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

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

export interface OpenTabInput {
  hostId: string;
  title: string;
  connectionId: string;
  kind?: "terminal" | "sftp";
  sftpPath?: string;
}

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

// 模块级单例状态
const tabs = ref<Tab[]>([]);
const activeTabId = ref<string | null>(null);

export function useTabs(): UseTabsReturn {
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

  function updateConnectionId(tabId: string, connectionId: string): void {
    const tab = tabs.value.find((t) => t.id === tabId);
    if (tab) {
      tab.connectionId = connectionId;
    }
  }

  function closeTab(id: string): void {
    const idx = tabs.value.findIndex((t) => t.id === id);
    if (idx === -1) return;
    tabs.value.splice(idx, 1);
    if (activeTabId.value === id) {
      activeTabId.value =
        tabs.value.length > 0 ? tabs.value[Math.min(idx, tabs.value.length - 1)].id : null;
    }
  }

  function setActiveTab(id: string): void {
    if (tabs.value.some((t) => t.id === id)) {
      activeTabId.value = id;
    }
  }

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

  return { tabs, activeTabId, openTab, updateConnectionId, closeTab, setActiveTab, renameTab, reorderTab, duplicateTab };
}

/** @internal Test-only: reset singleton state */
export function _resetForTests(): void {
  tabs.value = [];
  activeTabId.value = null;
}
