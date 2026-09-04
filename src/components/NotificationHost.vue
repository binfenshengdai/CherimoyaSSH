<!-- src/components/NotificationHost.vue -->
<script setup lang="ts">
import { useNotifications } from "../composables/useNotifications";

const { notifications, remove } = useNotifications();
</script>

<template>
  <div class="notification-host">
    <TransitionGroup name="notif" tag="div" class="notif-list">
      <div
        v-for="n in notifications"
        :key="n.id"
        class="notification"
        :class="n.type"
        @click="remove(n.id)"
      >
        <span class="notif-icon">
          {{ n.type === "success" ? "✓" : n.type === "error" ? "✕" : "ℹ" }}
        </span>
        <span class="notif-message">{{ n.message }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.notification-host {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}
.notif-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.notification {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  border-radius: 8px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  min-width: 240px;
  max-width: 360px;
  cursor: pointer;
  font-size: 13px;
}
.notification.success {
  border-left: 3px solid #4caf50;
}
.notification.error {
  border-left: 3px solid #f44336;
}
.notification.info {
  border-left: 3px solid var(--accent);
}
.notif-icon {
  font-size: 16px;
  font-weight: bold;
}
.success .notif-icon { color: #4caf50; }
.error .notif-icon { color: #f44336; }
.info .notif-icon { color: var(--accent); }
.notif-message { flex: 1; }

/* 过渡动画 */
.notif-enter-active {
  transition: all 0.25s ease;
}
.notif-leave-active {
  transition: all 0.2s ease;
  position: absolute;
}
.notif-enter-from {
  opacity: 0;
  transform: translateX(40px);
}
.notif-leave-to {
  opacity: 0;
  transform: translateX(40px);
}
.notif-move {
  transition: transform 0.2s ease;
}
</style>
