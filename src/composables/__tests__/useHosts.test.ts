/// <reference types="vitest/globals" />
import { describe, it, expect, beforeEach } from "vitest";
import { useHosts, _resetForTests } from "../useHosts";

// Mock @tauri-apps/plugin-fs
vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  exists: vi.fn(),
  BaseDirectory: { AppData: 1 },
}));

describe("useHosts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetForTests();
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
