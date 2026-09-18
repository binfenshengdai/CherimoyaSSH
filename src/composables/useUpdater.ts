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
const progress = ref(0); // 0-100，尚未有进度 UI，预留
const latestVersion = ref<string | null>(null);

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
      throw e;
    }
  }

  /** 下载并安装更新，进度通过 progress 反映；完成后重启应用。 */
  async function downloadAndInstall(update: Update): Promise<void> {
    status.value = "downloading";
    progress.value = 0;

    let downloaded = 0;
    let total = 0;

    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case "Started":
          total = event.data.contentLength ?? 0;
          downloaded = 0;
          progress.value = 0;
          break;
        case "Progress":
          downloaded += event.data.chunkLength;
          progress.value =
            total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0;
          break;
        case "Finished":
          progress.value = 100;
          break;
      }
    });

    status.value = "installing";
    await relaunch();
  }

  function reset() {
    status.value = "idle";
    progress.value = 0;
    latestVersion.value = null;
  }

  return { status, progress, latestVersion, checkUpdate, downloadAndInstall, reset };
}

/** @internal Test-only */
export function _resetForTests(): void {
  status.value = "idle";
  progress.value = 0;
  latestVersion.value = null;
}