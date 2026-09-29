<script setup lang="ts">
import Sidebar from "./components/Sidebar.vue";
import TabBar from "./components/TabBar.vue";
import TerminalPane from "./components/TerminalPane.vue";
import SftpPane from "./components/SftpPane.vue";
import SftpProgressHost from "./components/SftpProgressHost.vue";
import DialogHost from "./components/DialogHost.vue";
import TitleBar from "./components/TitleBar.vue";
import NotificationHost from "./components/NotificationHost.vue";
import { useTabs } from "./composables/useTabs";
import { useHosts } from "./composables/useHosts";
import { useConnections } from "./composables/useConnections";
import { useNotifications } from "./composables/useNotifications";
import type { Host, Tab } from "./types/ssh";

const { tabs, activeTabId, openTab, updateConnectionId, duplicateTab } = useTabs();
const { hosts } = useHosts();
const { connect, disconnect } = useConnections();
const { success, error } = useNotifications();

/** 向已创建的标签页发起连接，成功后回填真实 connectionId。失败时保留标签页并通知 */
async function connectInto(tab: Tab, host: Host) {
  try {
    const connectionId = await connect({
      host: host.host,
      port: host.port,
      username: host.username,
      password: host.password,
    });
    // 连接成功后更新 connectionId
    updateConnectionId(tab.id, connectionId);
    success(`已连接到 ${host.name}`);
  } catch (err) {
    console.error("连接失败:", err);
    error(`连接 ${host.name} 失败：${err instanceof Error ? err.message : String(err)}`);
  }
}

async function handleConnect(host: Host) {
  // 先打开标签页，显示"正在连接"
  const tab = openTab({
    hostId: host.id,
    title: `${host.name} (${host.username}@${host.host})`,
    connectionId: "pending",
  });
  await connectInto(tab, host);
}

async function handleDuplicateTab(tabId: string) {
  const src = tabs.value.find((t) => t.id === tabId);
  if (!src) return;

  const host = hosts.value.find((h) => h.id === src.hostId);
  if (!host) {
    error("该主机已被删除，无法复制");
    return;
  }

  const copy = duplicateTab(tabId);
  if (copy) await connectInto(copy, host);
}

function handleCloseConnection(connectionId: string) {
  disconnect(connectionId);
}
</script>

<template>
  <div class="app-layout">
    <TitleBar />
    <div class="app-body">
      <Sidebar @connect="handleConnect" />

      <main class="main-area">
        <TabBar
          @close-connection="handleCloseConnection"
          @duplicate-tab="handleDuplicateTab"
        />

        <div class="terminal-area">
          <template v-for="tab in tabs" :key="tab.id">
            <TerminalPane
              v-if="tab.kind === 'terminal'"
              :connection-id="tab.connectionId"
              :host-name="tab.title"
              :active="tab.id === activeTabId"
            />
            <SftpPane
              v-else
              :session-id="tab.connectionId"
              :initial-path="tab.sftpPath"
              :active="tab.id === activeTabId"
            />
          </template>

          <div v-if="tabs.length === 0" class="empty-state">
            <div class="empty-content">
              <h2>无活动连接</h2>
              <p>从左侧选择主机进行连接</p>
            </div>
          </div>
        </div>
      </main>
    </div>
    <NotificationHost />
    <SftpProgressHost />
    <DialogHost />
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

.app-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.terminal-area {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.empty-state {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-content {
  text-align: center;
  color: var(--text-secondary);
}
.empty-content h2 {
  font-size: 18px;
  margin-bottom: 8px;
  font-weight: 400;
}
.empty-content p {
  font-size: 13px;
}
</style>
