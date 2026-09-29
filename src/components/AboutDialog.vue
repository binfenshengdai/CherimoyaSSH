<script setup lang="ts">
import { onMounted, ref } from "vue";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";

const emit = defineEmits<{
  close: [];
}>();

const version = ref("");

onMounted(async () => {
  try {
    version.value = await getVersion();
  } catch {
    version.value = "";
  }
});

async function handleOpenWebsite() {
  await openUrl("https://binfenshengdai.github.io/cherimoya-ssh.html");
}
</script>

<template>
  <div
    class="modal-overlay"
    tabindex="-1"
    @click.self="emit('close')"
    @keydown.escape="emit('close')"
  >
    <div class="modal about-dialog">
      <div class="modal-header">
        <h3>关于</h3>
      </div>
      <div class="modal-body">
        <div class="about-title">Cherimoya SSH</div>
        <div class="about-version">版本 v{{ version }}</div>
        <div class="about-author">作者：sundae</div>
        <a class="about-website" href="#" @click.prevent="handleOpenWebsite">
          官网：https://binfenshengdai.github.io/cherimoya-ssh.html
        </a>
      </div>
      <div class="modal-footer">
        <button class="primary" @click="emit('close')">确定</button>
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
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  text-align: center;
}

.about-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.about-version {
  font-size: 13px;
  color: var(--text-secondary);
}

.about-author {
  font-size: 13px;
  color: var(--text-secondary);
}

.about-website {
  font-size: 13px;
  color: var(--accent);
  text-decoration: none;
  word-break: break-all;
}
.about-website:hover {
  text-decoration: underline;
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