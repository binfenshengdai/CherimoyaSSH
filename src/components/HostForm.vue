<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useHosts } from "../composables/useHosts";
import { useConnections } from "../composables/useConnections";
import { useNotifications } from "../composables/useNotifications";
import type { Host, HostInput } from "../types/ssh";

const props = defineProps<{
  host?: Host | null;
  categoryId?: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const { categories, addHost, updateHost } = useHosts();
const { connect, disconnect } = useConnections();
const { success, error, info } = useNotifications();

const form = ref<HostInput>({
  name: "",
  host: "",
  port: 22,
  username: "",
  password: "",
  categoryId: props.categoryId ?? "default",
});

onMounted(() => {
  if (props.host) {
    form.value = {
      name: props.host.name,
      host: props.host.host,
      port: props.host.port,
      username: props.host.username,
      password: props.host.password,
      categoryId: props.host.categoryId,
    };
  }
});

function handleSubmit() {
  if (!form.value.name || !form.value.host || !form.value.username) return;
  if (props.host) {
    updateHost(props.host.id, form.value);
  } else {
    addHost(form.value);
  }
  emit("close");
}

const testing = ref(false);

async function handleTest() {
  if (!form.value.host || !form.value.username) {
    error("请填写主机地址和用户名");
    return;
  }
  testing.value = true;
  info("正在测试连接...");
  try {
    const id = await connect({
      host: form.value.host,
      port: form.value.port || 22,
      username: form.value.username,
      password: form.value.password,
    });
    await disconnect(id);
    success(`连接 ${form.value.host} 成功`);
  } catch (err) {
    error(`连接失败：${err instanceof Error ? err.message : String(err)}`);
  } finally {
    testing.value = false;
  }
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal">
      <div class="modal-header">
        <h3>{{ host ? "编辑主机" : "添加主机" }}</h3>
        <button class="icon-btn" @click="emit('close')">×</button>
      </div>

      <form @submit.prevent="handleSubmit" class="modal-body">
        <label>
          <span>名称</span>
          <input v-model="form.name" placeholder="我的服务器" required />
        </label>

        <label>
          <span>主机地址</span>
          <input v-model="form.host" placeholder="192.168.1.1" required />
        </label>

        <label>
          <span>端口</span>
          <input v-model.number="form.port" type="number" min="1" max="65535" />
        </label>

        <label>
          <span>用户名</span>
          <input v-model="form.username" placeholder="root" required />
        </label>

        <label>
          <span>密码</span>
          <input v-model="form.password" type="password" placeholder="••••••" />
        </label>

        <label>
          <span>分类</span>
          <select v-model="form.categoryId">
            <option v-for="cat in categories" :key="cat.id" :value="cat.id">
              {{ cat.name }}
            </option>
          </select>
        </label>

        <div class="modal-footer">
          <button
            type="button"
            class="test-btn"
            :disabled="testing"
            @click="handleTest"
          >
            {{ testing ? "测试中..." : "测试" }}
          </button>
          <div class="modal-footer-right">
            <button type="button" @click="emit('close')">取消</button>
            <button type="submit" class="primary">{{ host ? "保存" : "添加" }}</button>
          </div>
        </div>
      </form>
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
  z-index: 1000;
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
}

.modal-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

label {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
label span {
  font-size: 12px;
  color: var(--text-secondary);
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
}
.modal-footer-right {
  display: flex;
  gap: 8px;
}
.test-btn {
  background: transparent;
  border: 1px solid var(--accent);
  color: var(--accent);
  padding: 6px 14px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
}
.test-btn:hover:not(:disabled) {
  background: var(--accent);
  color: #fff;
}
.test-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
