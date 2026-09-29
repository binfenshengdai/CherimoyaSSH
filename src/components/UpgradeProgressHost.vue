<!-- src/components/UpgradeProgressHost.vue -->
<script setup lang="ts">
import { computed } from "vue";
import { useUpdater } from "../composables/useUpdater";

const { status, progress, downloadedBytes, totalBytes, latestVersion, errorMessage, dismissError } =
  useUpdater();

// 仅在下载/安装/失败时展示，检查更新与"已是最新"由通知提示
const visible = computed(() =>
  status.value === "downloading" || status.value === "installing" || status.value === "error",
);

// 服务端未返回 Content-Length 时无法计算百分比，退化为不确定进度条
const indeterminate = computed(
  () => status.value === "downloading" && totalBytes.value === 0,
);

const percent = computed(() => (indeterminate.value ? 0 : progress.value));

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

const statusText = computed(() => {
  switch (status.value) {
    case "downloading":
      return indeterminate.value ? "下载中…" : `${percent.value}%`;
    case "installing":
      return "正在安装…";
    case "error":
      return "更新失败";
    default:
      return "";
  }
});
</script>

<template>
  <Transition name="upgrade-progress">
    <div v-if="visible" class="progress-item" :class="status">
      <div class="progress-header">
        <span class="progress-name">Cherimoya SSH 更新</span>
        <span v-if="latestVersion" class="progress-version">v{{ latestVersion }}</span>
        <button
          v-if="status === 'error'"
          class="progress-close"
          @click="dismissError"
          title="关闭"
        >
          ×
        </button>
      </div>
      <div class="progress-bar">
        <div
          class="progress-fill"
          :class="{ indeterminate }"
          :style="indeterminate ? undefined : { width: percent + '%' }"
        ></div>
      </div>
      <div class="progress-info">
        <span v-if="status === 'error'" class="progress-error">{{ errorMessage }}</span>
        <template v-else>
          <span v-if="totalBytes > 0">
            {{ formatBytes(downloadedBytes) }} / {{ formatBytes(totalBytes) }}
          </span>
          <span v-else></span>
          <span class="progress-status">{{ statusText }}</span>
        </template>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* 定位由 App.vue 的 .bottom-right-host 容器负责，便于与 SFTP 进度面板堆叠 */
.progress-item {
  pointer-events: auto;
  width: 320px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 10px 14px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}
.progress-item.error {
  border-left: 3px solid #f44336;
}

.progress-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}
.progress-name {
  font-size: 13px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.progress-version {
  font-size: 11px;
  color: var(--text-secondary);
  flex-shrink: 0;
}
.progress-close {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 16px;
  cursor: pointer;
  padding: 0 4px;
  flex-shrink: 0;
}
.progress-close:hover {
  color: var(--danger);
}

.progress-bar {
  height: 4px;
  background: var(--bg-tertiary);
  border-radius: 2px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.2s ease;
}
.error .progress-fill {
  background: #f44336;
}

/* 未知总大小时的不确定进度条 */
.progress-fill.indeterminate {
  width: 40%;
  animation: indeterminate 1.2s ease-in-out infinite;
}
@keyframes indeterminate {
  0% {
    margin-left: -40%;
  }
  100% {
    margin-left: 100%;
  }
}

.progress-info {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 4px;
}
.progress-error {
  color: var(--danger);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.upgrade-progress-enter-active {
  transition: all 0.25s ease;
}
.upgrade-progress-leave-active {
  transition: all 0.2s ease;
}
.upgrade-progress-enter-from,
.upgrade-progress-leave-to {
  opacity: 0;
  transform: translateY(20px);
}
</style>
