<script setup lang="ts">
import { computed, ref } from "vue";
import { useHosts } from "../composables/useHosts";
import { useSftp } from "../composables/useSftp";
import { useTabs } from "../composables/useTabs";
import { useNotifications } from "../composables/useNotifications";
import { useDialog } from "../composables/useDialog";
import type { Host } from "../types/ssh";
import HostForm from "./HostForm.vue";

const emit = defineEmits<{
  connect: [host: Host];
}>();

const { hosts, categories, deleteHost, addCategory, deleteCategory } = useHosts();
const { openTab, updateConnectionId, closeTab } = useTabs();
const { success, error } = useNotifications();
const { showConfirm } = useDialog();

const expandedCategories = ref<Set<string>>(new Set(["default"]));
const showHostForm = ref(false);
const editingHost = ref<Host | null>(null);
const initialCategoryId = ref<string>("default");
const newCategoryName = ref("");
const showAddCategory = ref(false);
const contextMenu = ref<{ host: Host; x: number; y: number } | null>(null);

const hostsByCategory = computed(() => {
  const map = new Map<string, Host[]>();
  categories.value.forEach((c) => map.set(c.id, []));
  hosts.value.forEach((h) => {
    const list = map.get(h.categoryId);
    if (list) list.push(h);
  });
  return map;
});

function toggleCategory(id: string) {
  if (expandedCategories.value.has(id)) {
    expandedCategories.value.delete(id);
  } else {
    expandedCategories.value.add(id);
  }
}

function handleConnect(host: Host) {
  emit("connect", host);
}

function handleAddHost(categoryId: string) {
  editingHost.value = null;
  initialCategoryId.value = categoryId;
  showHostForm.value = true;
}

function handleEditHost(host: Host) {
  editingHost.value = host;
  showHostForm.value = true;
  contextMenu.value = null;
}

async function handleDeleteHost(host: Host) {
  const confirmed = await showConfirm({
    title: "删除确认",
    message: `确定删除主机「${host.name}」？`,
    confirmText: "删除",
    danger: true,
  });
  if (confirmed) {
    deleteHost(host.id);
  }
  contextMenu.value = null;
}

function handleContextMenu(host: Host, event: MouseEvent) {
  event.preventDefault();
  contextMenu.value = { host, x: event.clientX, y: event.clientY };
}

function closeContextMenu() {
  contextMenu.value = null;
}

async function handleSftpConnect(host: Host) {
  contextMenu.value = null;
  const { connect } = useSftp();
  // 先打开标签页
  const tab = openTab({
    hostId: host.id,
    title: `SFTP: ${host.name}`,
    connectionId: "pending",
    kind: "sftp",
    sftpPath: "/",
  });
  try {
    const sessionId = await connect({
      host: host.host,
      port: host.port,
      username: host.username,
      password: host.password,
    });
    updateConnectionId(tab.id, sessionId);
    success(`SFTP 已连接到 ${host.name}`);
  } catch (err) {
    error(`SFTP 连接失败：${err instanceof Error ? err.message : String(err)}`);
    closeTab(tab.id);
  }
}

async function handleDeleteCategory(id: string, name: string, event: MouseEvent) {
  event.stopPropagation();
  const confirmed = await showConfirm({
    title: "删除确认",
    message: `确定删除分类「${name}」？下属主机将移至默认分类。`,
    confirmText: "删除",
    danger: true,
  });
  if (confirmed) {
    deleteCategory(id);
  }
}

function handleAddCategory() {
  if (newCategoryName.value.trim()) {
    addCategory(newCategoryName.value.trim());
    newCategoryName.value = "";
    showAddCategory.value = false;
  }
}
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-header">
      <h2>主机</h2>
    </div>

    <div class="category-list">
      <div v-for="category in categories" :key="category.id" class="category">
        <div class="category-header" @click="toggleCategory(category.id)">
          <span class="expand-icon">
            {{ expandedCategories.has(category.id) ? "▼" : "▶" }}
          </span>
          <span class="category-name">{{ category.name }}</span>
          <span class="host-count">{{ hostsByCategory.get(category.id)?.length ?? 0 }}</span>
          <button
            v-if="category.id !== 'default'"
            class="icon-btn danger"
            @click="handleDeleteCategory(category.id, category.name, $event)"
            title="删除分类"
          >×</button>
        </div>

        <div v-if="expandedCategories.has(category.id)" class="host-list">
          <div
            v-for="host in hostsByCategory.get(category.id)"
            :key="host.id"
            class="host-item"
            @click="handleConnect(host)"
            @contextmenu.prevent="handleContextMenu(host, $event)"
          >
            <span class="host-name">{{ host.name }}</span>
            <span class="host-addr">{{ host.host }}:{{ host.port }}</span>
          </div>
          <button class="add-host-btn" @click="handleAddHost(category.id)">
            + 添加主机
          </button>
        </div>
      </div>
    </div>

    <div class="sidebar-footer">
      <div v-if="showAddCategory" class="add-category-form">
        <input
          v-model="newCategoryName"
          placeholder="分类名称"
          @keyup.enter="handleAddCategory"
        />
        <button @click="handleAddCategory">添加</button>
      </div>
      <button v-else class="add-category-btn" @click="showAddCategory = true">
        + 新建分类
      </button>
    </div>

    <HostForm
      v-if="showHostForm"
      :host="editingHost"
      :category-id="initialCategoryId"
      @close="showHostForm = false"
    />

    <div
      v-if="contextMenu"
      class="context-menu-overlay"
      @click="closeContextMenu"
      @contextmenu.prevent="closeContextMenu"
    >
      <div
        class="context-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      >
        <div class="context-menu-item" @click="handleEditHost(contextMenu.host)">
          编辑
        </div>
        <div class="context-menu-item" @click="handleSftpConnect(contextMenu.host)">
          SFTP 连接
        </div>
        <div class="context-menu-item danger" @click="handleDeleteHost(contextMenu.host)">
          删除
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 240px;
  min-width: 200px;
  height: 100%;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}
.sidebar-header h2 {
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
}

.category-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.category-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  cursor: pointer;
  user-select: none;
}
.category-header:hover {
  background: var(--bg-tertiary);
}
.expand-icon {
  font-size: 10px;
  width: 12px;
}
.category-name {
  flex: 1;
  font-weight: 500;
}
.host-count {
  font-size: 11px;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  padding: 1px 6px;
  border-radius: 10px;
}

.host-list {
  padding-left: 16px;
}

.host-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  cursor: pointer;
  border-radius: 4px;
  margin: 2px 8px;
}
.host-item:hover {
  background: var(--bg-tertiary);
}
.host-name {
  flex: 1;
  font-size: 13px;
}
.host-addr {
  font-size: 11px;
  color: var(--text-secondary);
}

.icon-btn {
  background: transparent;
  border: none;
  padding: 2px 6px;
  font-size: 14px;
  opacity: 0.6;
}
.icon-btn:hover {
  opacity: 1;
  background: transparent;
}
.icon-btn.danger:hover {
  color: var(--danger);
}

.add-host-btn {
  width: calc(100% - 16px);
  margin: 4px 8px;
  background: transparent;
  border: 1px dashed var(--border-color);
  color: var(--text-secondary);
  font-size: 12px;
  padding: 6px;
}
.add-host-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.sidebar-footer {
  padding: 12px;
  border-top: 1px solid var(--border-color);
}
.add-category-btn {
  width: 100%;
  background: transparent;
  border: 1px dashed var(--border-color);
  color: var(--text-secondary);
}
.add-category-form {
  display: flex;
  gap: 6px;
}
.add-category-form input {
  flex: 1;
}

.context-menu-overlay {
  position: fixed;
  inset: 0;
  z-index: 1001;
}
.context-menu {
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
