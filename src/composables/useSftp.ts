import { ref, reactive, type Ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { writeFile } from "@tauri-apps/plugin-fs";
import type { SftpFile, UploadItem } from "../types/ssh";

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// 模块级单例状态
const uploads = ref<UploadItem[]>([]);
// 上传 id -> AbortController，供 cancelUpload 真正中止上传
const controllers = new Map<string, AbortController>();

// 取消/失败后进度条停留时长（毫秒）
const REMOVE_DELAY_MS = 3000;

// 延时从列表中移除进度条项，触发 TransitionGroup 过渡后自动关闭
function scheduleRemoval(uploadId: string) {
  setTimeout(() => {
    const index = uploads.value.findIndex((u) => u.id === uploadId);
    if (index !== -1) {
      uploads.value.splice(index, 1);
    }
  }, REMOVE_DELAY_MS);
}

export interface UseSftpReturn {
  uploads: Ref<UploadItem[]>;
  connect: (host: { host: string; port: number; username: string; password: string }) => Promise<string>;
  disconnect: (sessionId: string) => Promise<void>;
  listFiles: (sessionId: string, path: string) => Promise<SftpFile[]>;
  deleteFile: (sessionId: string, path: string) => Promise<void>;
  renameFile: (sessionId: string, oldPath: string, newPath: string) => Promise<void>;
  createDir: (sessionId: string, path: string) => Promise<void>;
  uploadFile: (sessionId: string, targetDir: string, file: File, abortController: AbortController) => Promise<void>;
  cancelUpload: (uploadId: string) => void;
  downloadFile: (sessionId: string, remotePath: string, totalBytes: number, targetPath: string, abortController: AbortController) => Promise<void>;
}

export function useSftp(): UseSftpReturn {
  async function connect(host: {
    host: string;
    port: number;
    username: string;
    password: string;
  }): Promise<string> {
    return invoke<string>("sftp_connect", host);
  }

  async function disconnect(sessionId: string): Promise<void> {
    await invoke("sftp_disconnect", { sessionId });
  }

  async function listFiles(sessionId: string, path: string): Promise<SftpFile[]> {
    return invoke<SftpFile[]>("sftp_list", { sessionId, path });
  }

  async function deleteFile(sessionId: string, path: string): Promise<void> {
    await invoke("sftp_remove", { sessionId, path });
  }

  async function renameFile(
    sessionId: string,
    oldPath: string,
    newPath: string,
  ): Promise<void> {
    await invoke("sftp_rename", { sessionId, oldPath, newPath });
  }

  async function createDir(sessionId: string, path: string): Promise<void> {
    await invoke("sftp_mkdir", { sessionId, path });
  }

  async function readRange(sessionId: string, path: string, offset: number, length: number): Promise<Uint8Array> {
    const bytes = await invoke<number[]>("sftp_read_range", { sessionId, path, offset, length });
    return new Uint8Array(bytes);
  }

  async function downloadFile(
    sessionId: string,
    remotePath: string,
    totalBytes: number,
    targetPath: string,
    abortController: AbortController,
  ): Promise<void> {
    const id = generateId();
    const fileName = remotePath.split("/").pop() || "unknown";

    const item = reactive<UploadItem>({
      id,
      fileName,
      targetPath,
      totalBytes,
      uploadedBytes: 0,
      status: "uploading",
    });
    uploads.value.push(item);
    controllers.set(id, abortController);

    const CHUNK_SIZE = 1024 * 1024; // 1MB
    const merged = new Uint8Array(totalBytes);
    let offset = 0;

    try {
      while (offset < totalBytes) {
        if (abortController.signal.aborted) throw new Error("cancelled");
        const chunk = await readRange(sessionId, remotePath, offset, CHUNK_SIZE);
        if (chunk.length === 0) break;
        merged.set(chunk, offset);
        offset += chunk.length;
        item.uploadedBytes = offset;
      }
      await writeFile(targetPath, merged);
      item.status = "completed";
      scheduleRemoval(id);
    } catch (err) {
      if (abortController.signal.aborted || (err instanceof Error && err.message === "cancelled")) {
        item.status = "cancelled";
      } else {
        item.status = "error";
        item.error = err instanceof Error ? err.message : String(err);
      }
      scheduleRemoval(id);
      throw err;
    } finally {
      controllers.delete(id);
    }
  }

  async function uploadFile(
    sessionId: string,
    targetDir: string,
    file: File,
    abortController: AbortController,
  ): Promise<void> {
    const id = generateId();
    const targetPath = targetDir.endsWith("/")
      ? `${targetDir}${file.name}`
      : `${targetDir}/${file.name}`;

    const item = reactive<UploadItem>({
      id,
      fileName: file.name,
      targetPath,
      totalBytes: file.size,
      uploadedBytes: 0,
      status: "uploading",
    });
    uploads.value.push(item);
    controllers.set(id, abortController);

    const CHUNK_SIZE = 64 * 1024; // 64KB
    let offset = 0;
    let isFirst = true;

    try {
      while (offset < file.size) {
        if (abortController.signal.aborted) throw new Error("cancelled");
        const chunk = file.slice(offset, offset + CHUNK_SIZE);
        const arrayBuffer = await chunk.arrayBuffer();
        const uint8 = Array.from(new Uint8Array(arrayBuffer));

        await invoke("sftp_write", {
          sessionId,
          path: targetPath,
          data: uint8,
          append: isFirst ? false : true,
        });

        isFirst = false;
        offset += uint8.length;
        item.uploadedBytes = offset;
      }
      item.status = "completed";
      scheduleRemoval(id);
    } catch (err) {
      if (abortController.signal.aborted || (err instanceof Error && err.message === "cancelled")) {
        item.status = "cancelled";
      } else {
        item.status = "error";
        item.error = err instanceof Error ? err.message : String(err);
      }
      scheduleRemoval(id);
      throw err;
    } finally {
      controllers.delete(id);
    }
  }

  function cancelUpload(uploadId: string) {
    const item = uploads.value.find((u) => u.id === uploadId);
    if (item && item.status === "uploading") {
      item.status = "cancelled";
      controllers.get(uploadId)?.abort();
    }
  }

  return {
    uploads,
    connect,
    disconnect,
    listFiles,
    deleteFile,
    renameFile,
    createDir,
    uploadFile,
    cancelUpload,
    downloadFile,
  };
}

/** @internal Test-only */
export function _resetForTests(): void {
  uploads.value = [];
  controllers.clear();
}
