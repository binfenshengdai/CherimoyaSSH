<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { PromptOptions } from "../composables/useDialog";

const props = defineProps<{
  options: PromptOptions;
}>();

const emit = defineEmits<{
  confirm: [value: string];
  cancel: [];
}>();

const inputRef = ref<HTMLInputElement | null>(null);
const inputValue = ref(props.options.defaultValue || "");
const validationError = ref("");

function handleConfirm() {
  if (props.options.validator) {
    const err = props.options.validator(inputValue.value);
    if (err) {
      validationError.value = err;
      return;
    }
  }
  emit("confirm", inputValue.value);
}

onMounted(() => {
  inputRef.value?.focus();
  inputRef.value?.select();
});
</script>

<template>
  <div class="modal-overlay" tabindex="-1" @click.self="emit('cancel')" @keydown.escape="emit('cancel')">
    <div class="modal prompt-dialog">
      <div class="modal-header">
        <h3>{{ options.title }}</h3>
      </div>
      <div class="modal-body">
        <p v-if="options.message" class="prompt-message">{{ options.message }}</p>
        <input
          ref="inputRef"
          v-model="inputValue"
          :placeholder="options.placeholder"
          class="prompt-input"
          @keydown.enter="handleConfirm"
          @keydown.escape.stop="emit('cancel')"
        />
        <p v-if="validationError" class="validation-error">{{ validationError }}</p>
      </div>
      <div class="modal-footer">
        <button @click="emit('cancel')">取消</button>
        <button class="primary" @click="handleConfirm">确定</button>
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
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.prompt-message {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
}

.prompt-input {
  width: 100%;
  padding: 8px 10px;
  font-size: 14px;
}

.validation-error {
  font-size: 12px;
  color: var(--danger);
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
</style>