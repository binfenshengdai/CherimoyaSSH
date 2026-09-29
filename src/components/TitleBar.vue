<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useNotifications } from "../composables/useNotifications";
import { useDialog } from "../composables/useDialog";
import { useUpdater } from "../composables/useUpdater";

const { info, error } = useNotifications();
const { showAbout, showConfirm } = useDialog();
const updater = useUpdater();
const isMaximized = ref(false);
const moreMenuOpen = ref(false);
const appWindow = getCurrentWindow();

async function toggleMaximize() {
  await appWindow.toggleMaximize();
  isMaximized.value = await appWindow.isMaximized();
}

async function minimize() {
  await appWindow.minimize();
}

async function close() {
  await appWindow.close();
}

async function updateMaximized() {
  isMaximized.value = await appWindow.isMaximized();
}

function toggleMoreMenu() {
  moreMenuOpen.value = !moreMenuOpen.value;
}

function closeMoreMenu() {
  moreMenuOpen.value = false;
}

function onSettings() {
  closeMoreMenu();
  info("设置功能开发中");
}

async function onUpgrade() {
  closeMoreMenu();
  try {
    const update = await updater.checkUpdate();
    if (!update) {
      info("已是最新版本");
      return;
    }
    const confirmed = await showConfirm({
      title: "发现新版本",
      message: `检测到新版本 v${update.version}，是否下载并安装？`,
      confirmText: "下载并安装",
    });
    if (!confirmed) return;
    await updater.downloadAndInstall(update);
  } catch (e) {
    error("检查更新失败：" + (e instanceof Error ? e.message : String(e)));
  }
}

function onAbout() {
  closeMoreMenu();
  showAbout();
}

let unlisten: (() => void) | null = null;

onMounted(async () => {
  isMaximized.value = await appWindow.isMaximized();
  // Listen for resize to track maximize/restore
  unlisten = await appWindow.onResized(() => {
    updateMaximized();
  });
});

onBeforeUnmount(() => {
  unlisten?.();
});
</script>

<template>
  <header class="title-bar" data-tauri-drag-region>
    <div class="title-bar-drag" data-tauri-drag-region>
      <img class="app-icon" src="/app-icon.png" alt="" data-tauri-drag-region />
      <span class="app-title" data-tauri-drag-region>Cherimoya SSH</span>
    </div>
    <div class="window-controls">
      <div class="more-menu-wrap">
        <button
          class="window-btn more"
          @click="toggleMoreMenu"
          title="更多"
        >
          <svg width="16" height="16" viewBox="0 0 16 16">
            <circle cx="3" cy="8" r="1.2" fill="currentColor" />
            <circle cx="8" cy="8" r="1.2" fill="currentColor" />
            <circle cx="13" cy="8" r="1.2" fill="currentColor" />
          </svg>
        </button>
        <div v-if="moreMenuOpen" class="more-menu-overlay" @click="closeMoreMenu"></div>
        <div v-if="moreMenuOpen" class="more-menu">
          <div class="more-menu-item" @click="onSettings">设置</div>
          <div class="more-menu-item" @click="onUpgrade">升级</div>
          <div class="more-menu-item" @click="onAbout">关于</div>
        </div>
      </div>
      <button
        class="window-btn minimize"
        @click="minimize"
        title="最小化"
      >
        <svg width="12" height="12" viewBox="0 0 12 12">
          <line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" stroke-width="1.2" />
        </svg>
      </button>
      <button
        class="window-btn maximize"
        @click="toggleMaximize"
        :title="isMaximized ? '向下还原' : '最大化'"
      >
        <svg v-if="!isMaximized" width="12" height="12" viewBox="0 0 12 12">
          <rect x="2" y="2" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1.2" />
        </svg>
        <svg v-else width="12" height="12" viewBox="0 0 12 12">
          <rect x="3" y="1" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1.2" />
          <polyline points="3,3.5 3,1 11,1 11,8.5 8.5,8.5" fill="none" stroke="currentColor" stroke-width="1.2" />
        </svg>
      </button>
      <button
        class="window-btn close"
        @click="close"
        title="关闭"
      >
        <svg width="12" height="12" viewBox="0 0 12 12">
          <line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" stroke-width="1.2" />
          <line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" stroke-width="1.2" />
        </svg>
      </button>
    </div>
  </header>
</template>

<style scoped>
.title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 32px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
  user-select: none;
  -webkit-user-select: none;
}

.title-bar-drag {
  flex: 1;
  height: 100%;
  display: flex;
  align-items: center;
  padding-left: 12px;
  -webkit-app-region: drag;
}

.app-icon {
  display: block;
  width: 16px;
  height: 16px;
  margin-right: 6px;
  flex-shrink: 0;
}

.app-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  letter-spacing: 0.3px;
}

.window-controls {
  display: flex;
  height: 100%;
  -webkit-app-region: no-drag;
}

.window-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 100%;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  padding: 0;
  transition: background 0.1s;
}

.window-btn:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.window-btn.close:hover {
  background: #e81123;
  color: #fff;
}

.window-btn svg {
  display: block;
}

.more-menu-wrap {
  position: relative;
  display: flex;
  height: 100%;
}

.more-menu-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
}

.more-menu {
  position: absolute;
  top: 100%;
  right: 0;
  min-width: 120px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 4px 0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 1001;
}

.more-menu-item {
  padding: 8px 16px;
  font-size: 13px;
  cursor: pointer;
  user-select: none;
}

.more-menu-item:hover {
  background: var(--bg-tertiary);
}
</style>
