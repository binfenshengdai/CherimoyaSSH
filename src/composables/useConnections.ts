import { reactive } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ConnectionState } from "../types/ssh";

export interface UseConnectionsReturn {
  connectionStates: Record<string, ConnectionState>;
  connect: (host: { host: string; port: number; username: string; password: string }) => Promise<string>;
  send: (connectionId: string, data: string) => Promise<void>;
  resize: (connectionId: string, cols: number, rows: number) => Promise<void>;
  disconnect: (connectionId: string) => Promise<void>;
  onOutput: (connectionId: string, callback: (data: string) => void) => () => void;
  onClose: (connectionId: string, callback: () => void) => () => void;
}

// 模块级单例
const connectionStates = reactive<Record<string, ConnectionState>>({});
const outputListeners = new Map<string, Set<(data: string) => void>>();
const closeListeners = new Map<string, Set<() => void>>();
const unlistenMap = new Map<string, Array<() => void>>();

export function useConnections(): UseConnectionsReturn {
  async function connect(host: {
    host: string;
    port: number;
    username: string;
    password: string;
  }): Promise<string> {
    const connectionId = await invoke<string>("ssh_connect", host);
    connectionStates[connectionId] = "connecting";

    // 监听输出
    const unlistenOutput = await listen<string>(`ssh_output_${connectionId}`, (event) => {
      const listeners = outputListeners.get(connectionId);
      if (listeners) {
        listeners.forEach((cb) => cb(event.payload));
      }
    });

    // 监听关闭
    const unlistenClose = await listen(`ssh_closed_${connectionId}`, () => {
      connectionStates[connectionId] = "disconnected";
      const listeners = closeListeners.get(connectionId);
      if (listeners) {
        listeners.forEach((cb) => cb());
      }
      // 清理监听器
      const unlisteners = unlistenMap.get(connectionId);
      if (unlisteners) {
        unlisteners.forEach(fn => fn());
        unlistenMap.delete(connectionId);
      }
      outputListeners.delete(connectionId);
      closeListeners.delete(connectionId);
    });

    unlistenMap.set(connectionId, [unlistenOutput, unlistenClose]);

    connectionStates[connectionId] = "connected";
    return connectionId;
  }

  async function send(connectionId: string, data: string): Promise<void> {
    await invoke("ssh_send", { id: connectionId, data });
  }

  async function resize(connectionId: string, cols: number, rows: number): Promise<void> {
    await invoke("ssh_resize", { id: connectionId, cols, rows });
  }

  async function disconnect(connectionId: string): Promise<void> {
    await invoke("ssh_disconnect", { id: connectionId });
    connectionStates[connectionId] = "disconnected";
  }

  function onOutput(connectionId: string, callback: (data: string) => void): () => void {
    if (!outputListeners.has(connectionId)) {
      outputListeners.set(connectionId, new Set());
    }
    outputListeners.get(connectionId)!.add(callback);
    return () => {
      outputListeners.get(connectionId)?.delete(callback);
    };
  }

  function onClose(connectionId: string, callback: () => void): () => void {
    if (!closeListeners.has(connectionId)) {
      closeListeners.set(connectionId, new Set());
    }
    closeListeners.get(connectionId)!.add(callback);
    return () => {
      closeListeners.get(connectionId)?.delete(callback);
    };
  }

  return { connectionStates, connect, send, resize, disconnect, onOutput, onClose };
}
