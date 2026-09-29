<script setup lang="ts">
import { computed, ref } from "vue";
import { useTabs } from "../composables/useTabs";

const emit = defineEmits<{
  closeConnection: [connectionId: string];
  duplicateTab: [tabId: string];
}>();

const { tabs, activeTabId, setActiveTab, closeTab, renameTab, reorderTab } = useTabs();

const contextMenu = ref<{ tabId: string; x: number; y: number } | null>(null);
const renamingTabId = ref<string | null>(null);
const renameInput = ref("");
const dragFromIndex = ref(-1);
const dragOverIndex = ref(-1);
const isDragging = ref(false);

function handleClose(id: string, connectionId: string, event: MouseEvent) {
  event.stopPropagation();
  closeTab(id);
  emit("closeConnection", connectionId);
}

function onContextMenu(tabId: string, event: MouseEvent) {
  event.preventDefault();
  contextMenu.value = { tabId, x: event.clientX, y: event.clientY };
}

function closeContextMenu() {
  contextMenu.value = null;
}

/** 菜单当前指向的标签页，用于按 kind 条件渲染菜单项 */
const contextMenuTab = computed(
  () => tabs.value.find((t) => t.id === contextMenu.value?.tabId) ?? null
);

function menuDuplicate() {
  if (!contextMenu.value) return;
  emit("duplicateTab", contextMenu.value.tabId);
  contextMenu.value = null;
}

function menuClose() {
  if (!contextMenu.value) return;
  const tab = tabs.value.find((t) => t.id === contextMenu.value!.tabId);
  if (tab) {
    closeTab(tab.id);
    emit("closeConnection", tab.connectionId);
  }
  contextMenu.value = null;
}

function startRename() {
  if (!contextMenu.value) return;
  const tab = tabs.value.find((t) => t.id === contextMenu.value!.tabId);
  if (!tab) return;
  renamingTabId.value = tab.id;
  renameInput.value = tab.title;
  contextMenu.value = null;
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLInputElement>(".tab-rename-input");
    el?.focus();
    el?.select();
  });
}

function commitRename() {
  if (renamingTabId.value && renameInput.value.trim()) {
    renameTab(renamingTabId.value, renameInput.value.trim());
  }
  renamingTabId.value = null;
}

function cancelRename() {
  renamingTabId.value = null;
}

function onMouseDown(index: number, event: MouseEvent) {
  // 鼠标左键按下，记录潜在拖拽起点
  if (event.button !== 0) return;
  event.preventDefault(); // 防止拖拽时选中文字
  dragFromIndex.value = index;
  isDragging.value = false;
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
}

function onMouseMove(event: MouseEvent) {
  if (dragFromIndex.value === -1) return;
  // 移动超过阈值才算拖拽，避免普通点击误判
  isDragging.value = true;
  // 计算当前悬停在哪个标签上
  const tabEls = document.querySelectorAll<HTMLElement>(".tab-bar .tab");
  dragOverIndex.value = -1;
  tabEls.forEach((el, i) => {
    const rect = el.getBoundingClientRect();
    if (event.clientX >= rect.left && event.clientX <= rect.right) {
      dragOverIndex.value = i;
    }
  });
}

function onMouseUp() {
  if (dragFromIndex.value !== -1 && dragOverIndex.value !== -1 && dragFromIndex.value !== dragOverIndex.value) {
    reorderTab(dragFromIndex.value, dragOverIndex.value);
  }
  dragFromIndex.value = -1;
  dragOverIndex.value = -1;
  isDragging.value = false;
  document.removeEventListener("mousemove", onMouseMove);
  document.removeEventListener("mouseup", onMouseUp);
}
</script>

<template>
  <div class="tab-bar">
    <div
      v-for="(tab, index) in tabs"
      :key="tab.id"
      class="tab"
      :class="{
        active: tab.id === activeTabId,
        'drag-source': isDragging && dragFromIndex === index,
        'drag-over': isDragging && dragOverIndex === index && dragFromIndex !== index
      }"
      @mousedown="onMouseDown(index, $event)"
      @click="setActiveTab(tab.id)"
      @contextmenu.prevent="onContextMenu(tab.id, $event)"
    >
      <span v-if="renamingTabId !== tab.id" class="tab-title">{{ tab.title }}</span>
      <input
        v-else
        v-model="renameInput"
        class="tab-rename-input"
        @blur="commitRename"
        @keyup.enter="commitRename"
        @keyup.esc="cancelRename"
        @click.stop
      />
      <button
        class="tab-close"
        @click="handleClose(tab.id, tab.connectionId, $event)"
        title="关闭"
      >×</button>
    </div>

    <!-- 右键菜单 -->
    <div
      v-if="contextMenu"
      class="tab-context-overlay"
      @click="closeContextMenu"
      @contextmenu.prevent="closeContextMenu"
    >
      <div class="tab-context-menu" :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }">
        <div
          v-if="contextMenuTab?.kind === 'terminal'"
          class="context-menu-item"
          @click="menuDuplicate"
        >复制</div>
        <div class="context-menu-item" @click="startRename">重命名</div>
        <div class="context-menu-item danger" @click="menuClose">关闭</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tab-bar {
  display: flex;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  overflow-x: auto;
  min-height: 36px;
}

.tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-right: 1px solid var(--border-color);
  cursor: pointer;
  white-space: nowrap;
  max-width: 200px;
}
.tab:hover {
  background: var(--bg-tertiary);
}
.tab.active {
  background: var(--bg-primary);
  border-bottom: 2px solid var(--accent);
}
.tab.drag-source {
  opacity: 0.4;
}
.tab.drag-over {
  border-left: 2px solid var(--accent);
}

.tab-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
}

.tab-rename-input {
  flex: 1;
  background: var(--bg-primary);
  border: 1px solid var(--accent);
  color: var(--text-primary);
  font-size: 13px;
  padding: 2px 4px;
  border-radius: 3px;
  outline: none;
  min-width: 0;
}

.tab-close {
  background: transparent;
  border: none;
  padding: 0 4px;
  font-size: 14px;
  opacity: 0.5;
}
.tab-close:hover {
  opacity: 1;
  color: var(--danger);
  background: transparent;
}

/* 右键菜单 */
.tab-context-overlay {
  position: fixed;
  inset: 0;
  z-index: 1001;
}
.tab-context-menu {
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
