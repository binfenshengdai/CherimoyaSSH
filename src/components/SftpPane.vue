<!-- src/components/SftpPane.vue -->
<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { useSftp } from "../composables/useSftp";
import { useNotifications } from "../composables/useNotifications";
import { useDialog } from "../composables/useDialog";
import type { SftpFile } from "../types/ssh";

const props = defineProps<{
  sessionId: string;
  initialPath?: string;
  active: boolean;
}>();

const { listFiles, deleteFile, renameFile, createDir, uploadFile, downloadFile } = useSftp();
const { success, error } = useNotifications();
const { showConfirm, showPrompt } = useDialog();

const currentPath = ref(props.initialPath || "/");
const files = ref<SftpFile[]>([]);
const loading = ref(false);
const contextMenu = ref<{ file: SftpFile; x: number; y: number } | null>(null);
const renamingFile = ref<SftpFile | null>(null);
const newName = ref("");
const dragOver = ref(false);
const abortControllers = ref<Map<string, AbortController>>(new Map());

async function loadFiles() {
  loading.value = true;
  try {
    const list = await listFiles(props.sessionId, currentPath.value);
    files.value = sortFiles(list);
  } catch (err) {
    error(`加载目录失败：${err instanceof Error ? err.message : String(err)}`);
  } finally {
    loading.value = false;
  }
}

// 目录优先，同类型按名称排序（自然排序，忽略大小写）
function sortFiles(list: SftpFile[]): SftpFile[] {
  return [...list].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
}

// 连接成功后 sessionId 从 "pending" 变为真实 uuid，此时自动加载目录
watch(
  () => props.sessionId,
  (id) => {
    if (id && id !== "pending") {
      loadFiles();
    }
  },
);

// 拖拽上传：dragDropEnabled=false 时走标准 HTML5 drag-drop，
// 在 document 级别 preventDefault 防止子元素阻断拖拽事件（否则鼠标显示禁止图标）
function onDocDragEnter(event: DragEvent) {
  event.preventDefault();
}
function onDocDragOver(event: DragEvent) {
  event.preventDefault();
}
onMounted(() => {
  document.addEventListener("dragenter", onDocDragEnter);
  document.addEventListener("dragover", onDocDragOver);
});
onBeforeUnmount(() => {
  document.removeEventListener("dragenter", onDocDragEnter);
  document.removeEventListener("dragover", onDocDragOver);
});

function navigateTo(path: string) {
  currentPath.value = path;
  loadFiles();
}

function goUp() {
  const parts = currentPath.value.replace(/\/+$/, "").split("/");
  if (parts.length > 1) {
    parts.pop();
    navigateTo(parts.join("/") || "/");
  }
}

async function handleFileClick(file: SftpFile) {
  if (renamingFile.value) return;
  if (file.is_dir) {
    navigateTo(file.path);
  }
}

function onContextMenu(file: SftpFile, event: MouseEvent) {
  event.preventDefault();
  // 估计菜单高度（3 项 x ~35px + padding），底部空间不足时向上弹出
  const estimatedMenuHeight = 110;
  const y =
    event.clientY + estimatedMenuHeight > window.innerHeight
      ? event.clientY - estimatedMenuHeight
      : event.clientY;
  contextMenu.value = { file, x: event.clientX, y };
}

function closeContextMenu() {
  contextMenu.value = null;
}

async function handleDelete() {
  if (!contextMenu.value) return;
  const file = contextMenu.value.file;
  const confirmed = await showConfirm({
    title: "删除确认",
    message: `确定删除「${file.name}」？`,
    confirmText: "删除",
    danger: true,
  });
  if (!confirmed) {
    contextMenu.value = null;
    return;
  }
  try {
    await deleteFile(props.sessionId, file.path);
    success(`已删除 ${file.name}`);
    loadFiles();
  } catch (err) {
    error(`删除失败：${err instanceof Error ? err.message : String(err)}`);
  }
  contextMenu.value = null;
}

async function handleDownload() {
  if (!contextMenu.value) return;
  const file = contextMenu.value.file;
  if (file.is_dir) {
    error("暂不支持下载目录");
    contextMenu.value = null;
    return;
  }
  const filePath = await save({
    title: "保存文件",
    defaultPath: file.name,
  });
  if (!filePath) {
    contextMenu.value = null;
    return;
  }
  const controller = new AbortController();
  abortControllers.value.set(file.name, controller);
  try {
    await downloadFile(props.sessionId, file.path, file.size, filePath, controller);
    success(`已下载 ${file.name}`);
  } catch (err) {
    if ((err as Error)?.message !== "cancelled") {
      error(`下载失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }
  abortControllers.value.delete(file.name);
  contextMenu.value = null;
}

function startRename() {
  if (!contextMenu.value) return;
  renamingFile.value = contextMenu.value.file;
  newName.value = contextMenu.value.file.name;
  contextMenu.value = null;
}

async function commitRename() {
  if (!renamingFile.value || !newName.value.trim()) {
    renamingFile.value = null;
    return;
  }
  const file = renamingFile.value;
  const dir = file.path.replace(/\/[^/]+$/, "") || "/";
  const newPath = `${dir}/${newName.value.trim()}`;
  try {
    await renameFile(props.sessionId, file.path, newPath);
    success("重命名成功");
    loadFiles();
  } catch (err) {
    error(`重命名失败：${err instanceof Error ? err.message : String(err)}`);
  }
  renamingFile.value = null;
}

function cancelRename() {
  renamingFile.value = null;
}

async function promptCreateDir() {
  const name = await showPrompt({
    title: "新建目录",
    message: "请输入目录名称：",
    placeholder: "目录名称",
  });
  if (!name?.trim()) return;
  const path = currentPath.value.endsWith("/")
    ? `${currentPath.value}${name.trim()}`
    : `${currentPath.value}/${name.trim()}`;
  try {
    await createDir(props.sessionId, path);
    success("目录创建成功");
    loadFiles();
  } catch (err) {
    error(`创建失败：${err instanceof Error ? err.message : String(err)}`);
  }
}

/* 文件选择器上传 */
async function promptUploadFiles() {
  try {
    const selected = await open({
      multiple: true,
      title: "选择要上传的文件",
    });
    if (!selected || selected.length === 0) return;

    for (const filePath of selected) {
      // 从路径提取文件名
      const fileName = filePath.split(/[/\\]/).pop() || "unknown";
      // 读取文件内容
      const data = await readFile(filePath);
      // 构造 File 对象（用 Uint8Array 构造 Blob）
      const blob = new Blob([data]);
      const file = new File([blob], fileName);
      const controller = new AbortController();
      abortControllers.value.set(fileName, controller);
      await uploadFile(props.sessionId, currentPath.value, file, controller);
      abortControllers.value.delete(fileName);
    }
    success("上传完成");
    loadFiles();
  } catch (err) {
    if ((err as Error)?.message !== "cancelled") {
      error(`上传失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

/* 拖拽上传：标准 HTML5 拖放，dragDropEnabled=false 时生效 */
function onDragOver(event: DragEvent) {
  event.preventDefault();
  dragOver.value = true;
}

function onDragLeave() {
  dragOver.value = false;
}

async function onDrop(event: DragEvent) {
  event.preventDefault();
  dragOver.value = false;
  const items = event.dataTransfer?.files;
  if (!items || items.length === 0) return;

  try {
    for (const file of Array.from(items)) {
      const controller = new AbortController();
      abortControllers.value.set(file.name, controller);
      await uploadFile(props.sessionId, currentPath.value, file, controller);
      abortControllers.value.delete(file.name);
    }
    loadFiles();
  } catch (err) {
    if ((err as Error)?.message !== "cancelled") {
      error(`上传失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatTime(ts: number): string {
  if (!ts) return "-";
  return new Date(ts * 1000).toLocaleString("zh-CN");
}
</script>

<template>
  <div
    class="sftp-pane"
    :class="{ active, 'drag-over': dragOver }"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <!-- 工具栏 -->
    <div class="sftp-toolbar">
      <button @click="goUp" title="上级目录">↑</button>
      <span class="sftp-path">{{ currentPath }}</span>
      <button @click="promptUploadFiles" title="上传文件">↑ 上传</button>
      <button @click="promptCreateDir" title="新建目录">+ 目录</button>
      <button @click="loadFiles" title="刷新">↻</button>
    </div>

    <!-- 文件列表 -->
    <div class="sftp-file-list">
      <div v-if="loading" class="sftp-loading">加载中...</div>
      <div
        v-else
        v-for="file in files"
        :key="file.path"
        class="sftp-file-item"
        @click="handleFileClick(file)"
        @dblclick="file.is_dir && navigateTo(file.path)"
        @contextmenu.prevent="onContextMenu(file, $event)"
      >
        <span class="file-icon">{{ file.is_dir ? "📁" : "📄" }}</span>
        <span v-if="renamingFile?.path !== file.path" class="file-name">{{ file.name }}</span>
        <input
          v-else
          v-model="newName"
          class="rename-input"
          @blur="commitRename"
          @keyup.enter="commitRename"
          @keyup.esc="cancelRename"
          @click.stop
          autofocus
        />
        <span class="file-size">{{ file.is_dir ? "" : formatSize(file.size) }}</span>
        <span class="file-time">{{ formatTime(file.modified) }}</span>
      </div>
    </div>

    <!-- 拖拽提示 -->
    <div v-if="dragOver" class="drop-overlay">
      <span>拖放到此处上传文件</span>
    </div>

    <!-- 右键菜单 -->
    <div
      v-if="contextMenu"
      class="sftp-context-overlay"
      @click="closeContextMenu"
      @contextmenu.prevent="closeContextMenu"
    >
      <div
        class="sftp-context-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      >
        <div class="context-menu-item" @click="handleDownload">下载</div>
        <div class="context-menu-item" @click="startRename">重命名</div>
        <div class="context-menu-item danger" @click="handleDelete">删除</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sftp-pane {
  display: none;
  flex-direction: column;
  height: 100%;
  background: var(--bg-primary);
  position: relative;
}
.sftp-pane.active {
  display: flex;
}
.sftp-pane.drag-over {
  outline: 2px dashed var(--accent);
  outline-offset: -2px;
}

.sftp-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
}
.sftp-toolbar button {
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}
.sftp-toolbar button:hover {
  background: var(--bg-tertiary);
}
.sftp-path {
  flex: 1;
  font-size: 13px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sftp-file-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}
.sftp-loading {
  padding: 20px;
  text-align: center;
  color: var(--text-secondary);
}

.sftp-file-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 16px;
  cursor: pointer;
  font-size: 13px;
}
.sftp-file-item:hover {
  background: var(--bg-tertiary);
}
.file-icon {
  width: 20px;
  text-align: center;
}
.file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-size {
  width: 80px;
  text-align: right;
  color: var(--text-secondary);
}
.file-time {
  width: 150px;
  color: var(--text-secondary);
}

.rename-input {
  flex: 1;
  background: var(--bg-primary);
  border: 1px solid var(--accent);
  color: var(--text-primary);
  font-size: 13px;
  padding: 2px 4px;
  border-radius: 3px;
  outline: none;
}

.drop-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  font-size: 18px;
  color: var(--accent);
}

/* 右键菜单 */
.sftp-context-overlay {
  position: fixed;
  inset: 0;
  z-index: 1001;
}
.sftp-context-menu {
  position: fixed;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 4px 0;
  min-width: 120px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}
.context-menu-item {
  padding: 8px 16px;
  cursor: pointer;
  font-size: 13px;
}
.context-menu-item:hover {
  background: var(--bg-tertiary);
}
.context-menu-item.danger {
  color: var(--danger);
}
</style>
