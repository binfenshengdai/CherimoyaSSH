// src/composables/useNotifications.ts
import { ref, type Ref } from "vue";

export interface Notification {
  id: string;
  type: "success" | "error" | "info";
  message: string;
}

export interface UseNotificationsReturn {
  notifications: Ref<Notification[]>;
  notify: (type: Notification["type"], message: string, duration?: number) => void;
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
  remove: (id: string) => void;
}

const notifications = ref<Notification[]>([]);

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function useNotifications(): UseNotificationsReturn {
  function notify(type: Notification["type"], message: string, duration = 3000) {
    const id = generateId();
    notifications.value.push({ id, type, message });
    setTimeout(() => {
      remove(id);
    }, duration);
  }

  const success = (msg: string, d?: number) => notify("success", msg, d);
  const error = (msg: string, d?: number) => notify("error", msg, d ?? 5000);
  const info = (msg: string, d?: number) => notify("info", msg, d);

  function remove(id: string) {
    const idx = notifications.value.findIndex((n) => n.id === id);
    if (idx !== -1) notifications.value.splice(idx, 1);
  }

  return { notifications, notify, success, error, info, remove };
}

/** @internal Test-only */
export function _resetForTests(): void {
  notifications.value = [];
}
