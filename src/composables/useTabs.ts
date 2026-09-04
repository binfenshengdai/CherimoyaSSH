import { ref, type Ref } from "vue";
import type { Tab } from "../types/ssh";

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
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
}

// 模块级单例状态
const tabs = ref<Tab[]>([]);
const activeTabId = ref<string | null>(null);

export function useTabs(): UseTabsReturn {
  function openTab(input: OpenTabInput): Tab {
    const existing = tabs.value.find((t) => t.connectionId === input.connectionId);
    if (existing) {
      activeTabId.value = existing.id;
      return existing;
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

  return { tabs, activeTabId, openTab, updateConnectionId, closeTab, setActiveTab, renameTab, reorderTab };
}

/** @internal Test-only: reset singleton state */
export function _resetForTests(): void {
  tabs.value = [];
  activeTabId.value = null;
}
