# dsh-archived-session-manager

DeepSeek Harness 归档会话管理插件（动态 Cordis 插件）。

官方 Web 界面只提供「归档会话」这一个动作，**没有查看、恢复或删除归档会话的任何入口**（官方文档明确注明 "archived sessions have no viewing or unarchive surface"）。本插件补齐这个缺口：

- ✅ 查看归档会话列表（标题、创建时间、数据是否完好）
- ✅ 恢复（取消归档，刷新页面后重新出现在侧边栏）
- ✅ 彻底删除（同时清除索引记录与磁盘上的会话数据文件）

## 界面位置

左下角 **设置（齿轮）→ 「归档管理」**。

## 原理（不直接改文件，走官方存储域写入链）

归档状态保存在 DSH 的 workspace 存储域（`~/.dsh/storages/workspace.json` 的 `archivedSessionIds`）。

- **读取**：通过 `ctx.storageDomain.get('workspace')` 读取已打开的 workspace 域的 `global` 状态；
- **恢复/删除**：通过 `domain.global.set(...)` 走与官方「归档」按钮**同一条持久化写入链**（写盘 + 内存 + 变更事件），不会损坏数据；
- **删除数据文件**：通过 `ctx.sessionPersistence.locate(header)` 定位会话文件，再调用系统 `rm` 删除（仅针对确认的会话目录，界面需要两次点击确认）。

> 提示：官方 `workspaceRegistry` 服务只暴露 `archiveSession()`，没有 unarchive/删除 API，所以本插件直接操作存储域。操作立即写入磁盘；侧边栏的归档状态是缓存的，刷新页面（F5）后同步。

## 源码结构

```
src/host.js     Host 半边（数据读取与写入逻辑，3 个私有 RPC 方法）
src/client.js   Client 半边（设置页界面：列表、恢复、删除）
```

`src/` 下两个文件就是动态插件 `cordis_define` 的 `code.host` / `code.client` 函数体（受限环境纯 JavaScript，无 import / JSX）。

## 在本机使用

当前插件以「动态 Cordis 插件」形式运行在会话进程中（pluginId：`archm-1`），**服务重启后不会自动恢复**，需要重新定义运行：

1. 在任意会话中让助手「运行归档会话管理插件」，或
2. 把 `src/host.js` / `src/client.js` 的内容作为 `code.host` / `code.client` 传给 `cordis_define`，然后 `cordis_run`。

首次运行需要在界面上批准（Cordis 面板 / Run 卡片）。

## 发布形态说明

这是一个**动态插件源码包**（不是 npm 可安装包）：DSH 的动态插件机制定义在进程内、无需打包。如需做成 `dsh plugin add` 可安装的静态插件包（`window.__ModuleLoader__` + `dsh.client` 配置 + 构建脚本），可在此基础上扩展。

## License

MIT
