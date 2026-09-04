import { describe, it, expect, beforeEach } from "vitest";
import { useTabs, _resetForTests } from "../useTabs";

describe("useTabs", () => {
  beforeEach(() => {
    _resetForTests();
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
