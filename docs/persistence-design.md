# 主机与分类数据持久化设计

## 概述

主机（Host）和分类（Category）数据以 JSON 文件形式存储在系统应用数据目录下，通过 Tauri v2 的 `@tauri-apps/plugin-fs` 插件读写。

## 存储位置

- **文件路径**：`BaseDirectory.AppData/hosts.json`
- **各系统实际路径**：
  - Windows: `%APPDATA%\com.cherimoya.ssh\hosts.json`
  - macOS: `~/Library/Application Support/com.cherimoya.ssh/hosts.json`
  - Linux: `~/.local/share/com.cherimoya.ssh/hosts.json`

> 实际路径取决于 `tauri.conf.json` 中配置的 `identifier`。

## 数据格式

```json
{
  "hosts": [
    {
      "id": "m6gvq3k_abc123",
      "name": "生产服务器",
      "host": "192.168.1.100",
      "port": 22,
      "username": "admin",
      "password": "",
      "categoryId": "default",
      "createdAt": 1724822400000
    }
  ],
  "categories": [
    { "id": "default", "name": "Default" },
    { "id": "m6gvq40_xyz789", "name": "测试环境" }
  ]
}
```

## 架构

```
┌─────────────────────────────────────────────┐
│                  Vue 组件                    │
│  Sidebar / HostForm / CategoryManager       │
└──────────────┬──────────────────────────────┘
               │ 调用
               ▼
┌─────────────────────────────────────────────┐
│          useHosts() composable              │
│  (模块级单例，状态在模块作用域)              │
│                                             │
│  hosts: Ref<Host[]>                         │
│  categories: Ref<Category[]>                │
│                                             │
│  方法: addHost / updateHost / deleteHost    │
│        addCategory / deleteCategory / reload│
└──────────────┬──────────────────────────────┘
               │ 深度 watch (deep: true)
               ▼
┌─────────────────────────────────────────────┐
│         loadData() / saveData()             │
│  @tauri-apps/plugin-fs                      │
│  BaseDirectory.AppData                      │
└──────────────┬──────────────────────────────┘
               ▼
          AppData/hosts.json
```

## 生命周期

### 启动加载

1. 首次调用 `useHosts()` 时，`initialized` 标志置位
2. 异步读取 `hosts.json`
3. 文件不存在 → 使用默认状态（空 hosts + `id:"default"` 的默认分类）
4. 文件存在 → 解析 JSON 填充 `hosts` / `categories`
5. **加载完成后再注册 watch**，避免初始化写入覆盖已有数据

### 自动保存

- 通过 `watch([hosts, categories], ..., { deep: true })` 监听
- 任何增删改操作触发 watch → 异步写入文件
- 写入为全量覆盖（数据量小，无需增量）

### 关闭

无需显式保存，watch 已保证每次变更都持久化。

## 关键约束

| 约束 | 说明 |
|------|------|
| 默认分类保护 | `id: "default"` 的分类不可删除 |
| 分类删除处理 | 删除分类时，下属主机的 `categoryId` 重置为 `"default"` |
| ID 生成 | `Date.now().toString(36) + Math.random().toString(36).slice(2, 8)` |
| 容错 | 读取/解析失败时回退到默认状态，不阻塞 UI |

## 已知限制

- **无加密**：密码明文存储，当前版本不处理
- **无版本迁移**：数据结构变更时需手动处理兼容
- **单文件全量写**：主机数量 < 1000 时无性能问题

## 未来扩展（如需）

- 密码改用系统密钥链（`keyring-rs`）
- 数据结构加版本号，支持迁移
- 导入/导出功能
