import { describe, it, expect, beforeEach } from "vitest";
import { useTabs, _resetForTests, type OpenTabInput } from "../useTabs";

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
