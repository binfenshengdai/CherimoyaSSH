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
