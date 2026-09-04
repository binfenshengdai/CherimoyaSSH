import { ref, watch, type Ref } from "vue";
import { readTextFile, writeTextFile, exists, mkdir, BaseDirectory } from "@tauri-apps/plugin-fs";
import type { Host, Category, HostInput } from "../types/ssh";

const STORAGE_FILE = "hosts.json";

interface StorageData {
  hosts: Host[];
  categories: Category[];
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function createDefaultCategory(): Category {
  return { id: "default", name: "Default" };
}

async function loadData(): Promise<StorageData> {
  try {
    const fileExists = await exists(STORAGE_FILE, { baseDir: BaseDirectory.AppData });
    if (!fileExists) {
      console.log("[hosts] 文件不存在，使用默认状态");
      return { hosts: [], categories: [createDefaultCategory()] };
    }
    const content = await readTextFile(STORAGE_FILE, { baseDir: BaseDirectory.AppData });
    console.log("[hosts] 已加载，主机数:", JSON.parse(content).hosts?.length ?? 0);
    return JSON.parse(content) as StorageData;
  } catch (err) {
    console.error("[hosts] 加载失败:", err);
    return { hosts: [], categories: [createDefaultCategory()] };
  }
}

async function saveData(data: StorageData): Promise<void> {
  try {
    // 确保 AppData 目录存在（writeTextFile 不会自动创建上级目录）
    await mkdir("", { baseDir: BaseDirectory.AppData, recursive: true });
    await writeTextFile(STORAGE_FILE, JSON.stringify(data, null, 2), {
      baseDir: BaseDirectory.AppData,
    });
    console.log("[hosts] 已保存到", STORAGE_FILE);
  } catch (err) {
    console.error("[hosts] 保存失败:", err);
  }
}

export interface UseHostsReturn {
  hosts: Ref<Host[]>;
  categories: Ref<Category[]>;
  addHost: (input: HostInput) => Host;
  updateHost: (id: string, updates: Partial<HostInput>) => void;
  deleteHost: (id: string) => void;
  addCategory: (name: string) => Category;
  deleteCategory: (id: string) => void;
  reload: () => Promise<void>;
}

// 模块级单例状态
const hosts = ref<Host[]>([]);
const categories = ref<Category[]>([createDefaultCategory()]);
let initialized = false;

export function useHosts(): UseHostsReturn {
  if (!initialized) {
    initialized = true;
    loadData().then((data) => {
      hosts.value = data.hosts;
      categories.value = data.categories;
      // 加载完成后再注册 watch，避免初始化触发写入覆盖已有数据
      watch([hosts, categories], async () => {
        await saveData({ hosts: hosts.value, categories: categories.value });
      }, { deep: true });
    });
  }

  function addHost(input: HostInput): Host {
    const host: Host = { ...input, id: generateId(), createdAt: Date.now() };
    hosts.value.push(host);
    return host;
  }

  function updateHost(id: string, updates: Partial<HostInput>): void {
    const idx = hosts.value.findIndex((h) => h.id === id);
    if (idx !== -1) {
      hosts.value[idx] = { ...hosts.value[idx], ...updates };
    }
  }

  function deleteHost(id: string): void {
    hosts.value = hosts.value.filter((h) => h.id !== id);
  }

  function addCategory(name: string): Category {
    const category: Category = { id: generateId(), name };
    categories.value.push(category);
    return category;
  }

  function deleteCategory(id: string): void {
    if (id === "default") return; // 不能删除默认分类
    categories.value = categories.value.filter((c) => c.id !== id);
    // 将被删分类下的主机归入默认分类
    hosts.value.forEach((h) => {
      if (h.categoryId === id) h.categoryId = "default";
    });
  }

  async function reload(): Promise<void> {
    const data = await loadData();
    hosts.value = data.hosts;
    categories.value = data.categories;
  }

  return { hosts, categories, addHost, updateHost, deleteHost, addCategory, deleteCategory, reload };
}

/** @internal Test-only: reset singleton state */
export function _resetForTests(): void {
  hosts.value = [];
  categories.value = [createDefaultCategory()];
  initialized = false;
}
