<!-- src/components/SftpProgressHost.vue -->
<script setup lang="ts">
import { computed } from "vue";
import { useSftp } from "../composables/useSftp";

const { uploads, cancelUpload } = useSftp();

// 只显示进行中和最近完成的（3秒内）
const visibleUploads = computed(() => {
  return uploads.value.filter(
    (u) => u.status === "uploading" || u.status === "error" || u.status === "cancelled",
  );
});

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

function getProgress(item: { uploadedBytes: number; totalBytes: number }): number {
  if (item.totalBytes === 0) return 100;
  return Math.min(100, Math.round((item.uploadedBytes / item.totalBytes) * 100));
}
</script>

<template>
  <TransitionGroup name="sftp-progress" tag="div" class="sftp-progress-host">
    <div
      v-for="item in visibleUploads"
      :key="item.id"
      class="progress-item"
      :class="item.status"
    >
      <div class="progress-header">
        <span class="progress-name">{{ item.fileName }}</span>
        <button
          v-if="item.status === 'uploading'"
          class="progress-cancel"
          @click="cancelUpload(item.id)"
          title="取消"
        >
          ×
        </button>
      </div>
      <div class="progress-bar">
        <div
          class="progress-fill"
          :style="{ width: getProgress(item) + '%' }"
        ></div>
      </div>
      <div class="progress-info">
        <span>{{ formatBytes(item.uploadedBytes) }} / {{ formatBytes(item.totalBytes) }}</span>
        <span class="progress-status">
          {{ item.status === "uploading" ? `${getProgress(item)}%` : "" }}
          {{ item.status === "completed" ? "完成" : "" }}
          {{ item.status === "error" ? "失败" : "" }}
          {{ item.status === "cancelled" ? "已取消" : "" }}
        </span>
      </div>
    </div>
  </TransitionGroup>
</template>

<style scoped>
/* 定位由 App.vue 的 .bottom-right-host 容器负责，便于与更新进度面板堆叠 */
.sftp-progress-host {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 320px;
  pointer-events: none;
}
.progress-item {
  pointer-events: auto;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 10px 14px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}
.progress-item.error {
  border-left: 3px solid #f44336;
}
.progress-item.cancelled {
  border-left: 3px solid #ff9800;
}
.progress-item.completed {
  border-left: 3px solid #4caf50;
}

.progress-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.progress-name {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.progress-cancel {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 16px;
  cursor: pointer;
  padding: 0 4px;
}
.progress-cancel:hover {
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
.error .progress-fill { background: #f44336; }
.cancelled .progress-fill { background: #ff9800; }
.completed .progress-fill { background: #4caf50; }

.progress-info {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 4px;
}

/* 过渡 */
.sftp-progress-enter-active {
  transition: all 0.25s ease;
}
.sftp-progress-leave-active {
  transition: all 0.2s ease;
  position: absolute;
}
.sftp-progress-enter-from {
  opacity: 0;
  transform: translateY(20px);
}
.sftp-progress-leave-to {
  opacity: 0;
  transform: translateX(40px);
}
.sftp-progress-move {
  transition: transform 0.2s ease;
}
</style>
