<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { ConfirmOptions } from "../composables/useDialog";

defineProps<{
  options: ConfirmOptions;
}>();

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

const overlayRef = ref<HTMLElement | null>(null);
const confirmBtnRef = ref<HTMLButtonElement | null>(null);

function onOverlayKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    emit("cancel");
  }
}

onMounted(() => {
  // 聚焦确认按钮，支持 Enter 确认
  confirmBtnRef.value?.focus();
});
</script>

<template>
  <div
    ref="overlayRef"
    class="modal-overlay"
    tabindex="-1"
    @click.self="emit('cancel')"
    @keydown="onOverlayKeydown"
  >
    <div class="modal confirm-dialog">
      <div class="modal-header">
        <h3>{{ options.title }}</h3>
      </div>
      <div class="modal-body">
        <p class="confirm-message">{{ options.message }}</p>
      </div>
      <div class="modal-footer">
        <button @click="emit('cancel')">{{ options.cancelText || "取消" }}</button>
        <button
          ref="confirmBtnRef"
          :class="['primary', { danger: options.danger }]"
          @click="emit('confirm')"
        >
          {{ options.confirmText || "确定" }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1001;
  outline: none;
}

.modal {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  width: 360px;
  max-width: 90vw;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
}
.modal-header h3 {
  font-size: 16px;
  font-weight: 600;
}

.modal-body {
  padding: 16px;
}

.confirm-message {
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.5;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 0 16px 16px;
}

button.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
button.primary:hover {
  opacity: 0.9;
}

button.danger {
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
}
button.danger:hover {
  opacity: 0.9;
}
</style>