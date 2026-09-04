<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useConnections } from "../composables/useConnections";

const props = defineProps<{
  connectionId: string;
  hostName: string;
  active: boolean;
}>();

const emit = defineEmits<{
  connected: [];
  disconnected: [];
}>();

const { send, resize, onOutput, onClose } = useConnections();

const status = ref<"connecting" | "connected" | "error" | "disconnected">("connecting");

const terminalRef = ref<HTMLDivElement | null>(null);
let terminal: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let currentConnectionId: string | null = null;
let unsubOutput: (() => void) | null = null;
let unsubClose: (() => void) | null = null;
let resizeObserver: ResizeObserver | null = null;

function initTerminal() {
  if (!terminalRef.value) return;

  terminal = new Terminal({
    theme: {
      background: "#1a1a1a",
      foreground: "#e0e0e0",
      cursor: "#e0e0e0",
      selectionBackground: "#4a4a4a",
      black: "#1a1a1a",
      red: "#ff5555",
      green: "#50fa7b",
      yellow: "#f1fa8c",
      blue: "#6272a4",
      magenta: "#bd93f9",
      cyan: "#8be9fd",
      white: "#e0e0e0",
    },
    fontFamily: "Consolas, 'Courier New', monospace",
    fontSize: 14,
    cursorBlink: true,
    scrollback: 10000,
  });

  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(terminalRef.value);
  fitAddon.fit();

  terminal.writeln(`\x1b[33m正在连接 ${props.hostName}...\x1b[0m\r\n`);

  // 将输入转发到 SSH
  terminal.onData((data) => {
    if (status.value === "connected" && currentConnectionId) {
      send(currentConnectionId, data);
    }
  });

  status.value = "connecting";
}

function setupListeners(connectionId: string) {
  // 清理旧监听
  unsubOutput?.();
  unsubClose?.();

  currentConnectionId = connectionId;

  // 监听 SSH 输出
  unsubOutput = onOutput(connectionId, (data) => {
    if (status.value === "connecting") {
      status.value = "connected";
    }
    terminal?.write(data);
  });

  // 监听关闭
  unsubClose = onClose(connectionId, () => {
    status.value = "disconnected";
    terminal?.writeln("\r\n\x1b[31m连接已关闭。\x1b[0m");
    emit("disconnected");
  });
}

function handleResize() {
  if (!fitAddon || !terminal || !currentConnectionId) return;
  // 容器尺寸为 0 说明还没完成布局（display:none→block 过渡中），
  // 跳过并在下一帧重试，避免 fit 成 0 高度
  if (terminalRef.value && terminalRef.value.clientHeight === 0) {
    requestAnimationFrame(() => handleResize());
    return;
  }
  fitAddon.fit();
  const dims = fitAddon.proposeDimensions();
  if (dims) {
    resize(currentConnectionId, dims.cols, dims.rows);
  }
}

function scheduleResize() {
  requestAnimationFrame(() => handleResize());
}

// 监听 connectionId 变化，当从 "pending" 变为真实 id 时设置监听
watch(
  () => props.connectionId,
  (newId) => {
    if (newId && newId !== "pending") {
      setupListeners(newId);
    }
  }
);

watch(
  () => props.active,
  (active) => {
    if (active) {
      // 标签页激活时重新适配，等布局完成后再 fit
      scheduleResize();
    }
  }
);

onMounted(() => {
  initTerminal();
  window.addEventListener("resize", scheduleResize);

  if (terminalRef.value) {
    resizeObserver = new ResizeObserver(() => {
      // display:none→block 切换时，ResizeObserver 在布局同步阶段触发，
      // 此时 clientHeight 可能为 0。延迟到下一帧，等浏览器算完实际尺寸再 fit。
      scheduleResize();
    });
    resizeObserver.observe(terminalRef.value);
  }

  // 如果初始 connectionId 就是真实的（非 pending），直接设置监听
  if (props.connectionId && props.connectionId !== "pending") {
    setupListeners(props.connectionId);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", handleResize);
  resizeObserver?.disconnect();
  unsubOutput?.();
  unsubClose?.();
  terminal?.dispose();
});
</script>

<template>
  <div class="terminal-pane" :class="{ active }">
    <div ref="terminalRef" class="terminal-container"></div>
    <div v-if="!active" class="inactive-overlay"></div>
  </div>
</template>

<style scoped>
.terminal-pane {
  position: relative;
  height: 90%;
  overflow: hidden;
  display: none;
}
.terminal-pane.active {
  display: block;
}

.terminal-container {
  width: 100%;
  height: 100%;
  padding: 4px;
}

.inactive-overlay {
  position: absolute;
  inset: 0;
}
</style>
