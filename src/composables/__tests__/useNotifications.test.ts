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
