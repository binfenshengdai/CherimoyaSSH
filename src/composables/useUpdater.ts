// src/composables/useUpdater.ts
import { ref } from "vue";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpgradeStatus =
  | "idle"
  | "checking"
  | "available"
  | "no-update"
  | "downloading"
  | "installing"
  | "error";

// 模块级单例状态（与其他 composable 模式一致）
const status = ref<UpgradeStatus>("idle");
const progress = ref(0); // 0-100；totalBytes 为 0 时无意义
const downloadedBytes = ref(0);
const totalBytes = ref(0);
const latestVersion = ref<string | null>(null);
const errorMessage = ref("");

export function useUpdater() {
  /** 检查更新。返回 Update 表示有新版本（由调用方决定是否下载）；null 表示已是最新。 */
  async function checkUpdate(): Promise<Update | null> {
    status.value = "checking";
    try {
      const update = await check();
      if (!update) {
        status.value = "no-update";
        return null;
      }
      latestVersion.value = update.version;
      status.value = "available";
      return update;
    } catch (e) {
      status.value = "error";
      errorMessage.value = e instanceof Error ? e.message : String(e);
      throw e;
    }
  }

  /**
   * 下载并安装更新，进度通过 progress / downloadedBytes / totalBytes 反映；
   * 完成后重启应用。下载或安装失败时不抛出，而是置 status='error' 并写入
   * errorMessage，由 UpgradeProgressHost 进度面板展示。
   */
  async function downloadAndInstall(update: Update): Promise<void> {
    status.value = "downloading";
    progress.value = 0;
    downloadedBytes.value = 0;
    totalBytes.value = 0;
    errorMessage.value = "";

    try {
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            totalBytes.value = event.data.contentLength ?? 0;
            downloadedBytes.value = 0;
            progress.value = 0;
            break;
          case "Progress":
            downloadedBytes.value += event.data.chunkLength;
            progress.value =
              totalBytes.value > 0
                ? Math.min(100, Math.round((downloadedBytes.value / totalBytes.value) * 100))
                : 0;
            break;
          case "Finished":
            progress.value = 100;
            if (totalBytes.value > 0) downloadedBytes.value = totalBytes.value;
            break;
        }
      });
    } catch (e) {
      status.value = "error";
      errorMessage.value = e instanceof Error ? e.message : String(e);
      return;
    }

    status.value = "installing";
    await relaunch();
  }

  /** 关闭错误提示面板 */
  function dismissError() {
    if (status.value === "error") status.value = "idle";
  }

  function reset() {
    status.value = "idle";
    progress.value = 0;
    downloadedBytes.value = 0;
    totalBytes.value = 0;
    latestVersion.value = null;
    errorMessage.value = "";
  }

  return {
    status,
    progress,
    downloadedBytes,
    totalBytes,
    latestVersion,
    errorMessage,
    checkUpdate,
    downloadAndInstall,
    dismissError,
    reset,
  };
}

/** @internal Test-only */
export function _resetForTests(): void {
  status.value = "idle";
  progress.value = 0;
  downloadedBytes.value = 0;
  totalBytes.value = 0;
  latestVersion.value = null;
  errorMessage.value = "";
}
