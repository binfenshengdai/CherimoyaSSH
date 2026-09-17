<script setup lang="ts">
import { useDialog } from "../composables/useDialog";
import ConfirmDialog from "./ConfirmDialog.vue";
import PromptDialog from "./PromptDialog.vue";
import AboutDialog from "./AboutDialog.vue";

const { activeConfirm, activePrompt, activeAbout, resolveConfirm, resolvePrompt, closeAbout } = useDialog();
</script>

<template>
  <ConfirmDialog
    v-if="activeConfirm"
    :options="activeConfirm"
    @confirm="resolveConfirm(true)"
    @cancel="resolveConfirm(false)"
  />
  <PromptDialog
    v-if="activePrompt"
    :options="activePrompt"
    @confirm="resolvePrompt($event)"
    @cancel="resolvePrompt(null)"
  />
  <AboutDialog v-if="activeAbout" @close="closeAbout" />
</template>