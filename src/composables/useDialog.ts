// src/composables/useDialog.ts
import { ref } from "vue";

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

export interface PromptOptions {
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  validator?: (value: string) => string | null;
}

// 模块级单例状态（与 useNotifications 模式一致）
const activeConfirm = ref<ConfirmOptions | null>(null);
const activePrompt = ref<PromptOptions | null>(null);
let confirmResolver: ((value: boolean) => void) | null = null;
let promptResolver: ((value: string | null) => void) | null = null;

export function useDialog() {
  function showConfirm(options: ConfirmOptions): Promise<boolean> {
    // 如果已有弹框，先关闭
    if (confirmResolver) {
      confirmResolver(false);
      confirmResolver = null;
    }
    if (promptResolver) {
      promptResolver(null);
      promptResolver = null;
    }
    activePrompt.value = null;
    activeConfirm.value = options;
    return new Promise((resolve) => {
      confirmResolver = resolve;
    });
  }

  function showPrompt(options: PromptOptions): Promise<string | null> {
    // 如果已有弹框，先关闭
    if (promptResolver) {
      promptResolver(null);
      promptResolver = null;
    }
    if (confirmResolver) {
      confirmResolver(false);
      confirmResolver = null;
    }
    activeConfirm.value = null;
    activePrompt.value = options;
    return new Promise((resolve) => {
      promptResolver = resolve;
    });
  }

  function resolveConfirm(value: boolean) {
    activeConfirm.value = null;
    if (confirmResolver) {
      confirmResolver(value);
      confirmResolver = null;
    }
  }

  function resolvePrompt(value: string | null) {
    activePrompt.value = null;
    if (promptResolver) {
      promptResolver(value);
      promptResolver = null;
    }
  }

  return { activeConfirm, activePrompt, showConfirm, showPrompt, resolveConfirm, resolvePrompt };
}