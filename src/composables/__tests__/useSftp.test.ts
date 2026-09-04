import { describe, it, expect, beforeEach, vi } from "vitest";
import { useSftp, _resetForTests } from "../useSftp";

// mock invoke
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
const mockInvoke = vi.mocked(invoke);

describe("useSftp", () => {
  beforeEach(() => {
    _resetForTests();
    mockInvoke.mockReset();
  });

  it("connect 调用 sftp_connect 并返回 session id", async () => {
    mockInvoke.mockResolvedValue("session-123");
    const { connect } = useSftp();
    const id = await connect({ host: "h", port: 22, username: "u", password: "p" });
    expect(id).toBe("session-123");
    expect(mockInvoke).toHaveBeenCalledWith("sftp_connect", expect.any(Object));
  });

  it("listFiles 返回文件列表", async () => {
    mockInvoke.mockResolvedValueOnce("sid")
      .mockResolvedValueOnce([
        { name: "a.txt", path: "/a.txt", is_dir: false, size: 100, modified: 0 },
      ]);
    const { connect, listFiles } = useSftp();
    const sid = await connect({ host: "h", port: 22, username: "u", password: "p" });
    const files = await listFiles(sid, "/");
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("a.txt");
  });

  it("deleteFile 调用 sftp_remove", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const { deleteFile } = useSftp();
    await deleteFile("sid", "/a.txt");
    expect(mockInvoke).toHaveBeenCalledWith("sftp_remove", { sessionId: "sid", path: "/a.txt" });
  });

  it("renameFile 调用 sftp_rename", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const { renameFile } = useSftp();
    await renameFile("sid", "/a.txt", "/b.txt");
    expect(mockInvoke).toHaveBeenCalledWith("sftp_rename", {
      sessionId: "sid",
      oldPath: "/a.txt",
      newPath: "/b.txt",
    });
  });

  it("uploads 初始为空", () => {
    const { uploads } = useSftp();
    expect(uploads.value).toEqual([]);
  });
});
