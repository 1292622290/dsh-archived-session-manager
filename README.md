# dsh-archived-session-manager

DeepSeek Harness 归档会话管理插件（动态 Cordis 插件）。

官方 Web 界面只提供「归档会话」这一个动作，**没有查看、恢复或删除归档会话的任何入口**（官方文档明确注明 "archived sessions have no viewing or unarchive surface"）。本插件补齐这个缺口：

- ✅ 查看归档会话列表（标题、创建时间、数据是否完好）
- ✅ 恢复（取消归档，**即时生效**，重新出现在侧边栏）
- ✅ 删除记录（清除归档标记与工作区归属记录，并给出数据文件位置引导）

## 界面位置

左下角 **设置（齿轮）→ 「归档管理」**。

## 删除行为的诚实说明

- 删除会立即清除：归档标记（`archivedSessionIds`）与工作区会话归属（`sessionIds`）。
- **数据文件不会被插件删除**：会话文件位于 DSH 数据目录（`~/.dsh/sessions/...`），受系统沙箱保护，插件**不绕过沙箱**。
- 删除后界面会显示**脱敏后的文件位置**（`~/.dsh/sessions/…/session-xxxx/`，不暴露用户名）与手动删除步骤；也可让本机助手用提升权限代为清理。
- 删除文件后重启 DSH，会话即彻底消失。

## 隐私

- 界面展示的路径经过脱敏：省略用户目录与工作区目录名，不暴露用户名。
- 「复制完整路径」按钮仅把完整路径写入**本机剪贴板**（用于访达快速定位），不会显示在界面上，也不会发送到任何地方。

## 原理（走官方存储域写入链）

归档状态保存在 DSH 的 workspace 存储域（`~/.dsh/storages/workspace.json` 的 `archivedSessionIds`）。

- **读取**：通过 `ctx.storageDomain.get('workspace')` 读取已打开 workspace 域的 `global` 状态；
- **恢复/删除**：统一通过 `workspaceRegistry.setState()` 写入——官方同一条持久化写链（写盘 + 内存同步 + `domain/changed` 事件广播），**界面即时更新**，且不会与官方后续操作互相覆盖；
- **文件定位**：通过 `ctx.sessionPersistence.locate(header)` 获取文件位置，脱敏后展示。

> 官方 `workspaceRegistry` 只暴露 `archiveSession()`，没有 unarchive/删除 API，故本插件直接操作存储域。

## 源码结构

```
src/host.js     Host 半边（数据读取与写入逻辑，3 个私有 RPC 方法）
src/client.js   Client 半边（设置页界面：列表、恢复、删除、手动删除引导）
```

`src/` 下两个文件就是动态插件 `cordis_define` 的 `code.host` / `code.client` 函数体（受限环境纯 JavaScript，无 import / JSX）。

## 在本机使用

当前插件以「动态 Cordis 插件」形式运行在会话进程中（**服务重启后不会自动恢复**），需要重新定义运行：

1. 在任意会话中让助手「运行归档会话管理插件」，或
2. 把 `src/host.js` / `src/client.js` 的内容作为 `code.host` / `code.client` 传给 `cordis_define`，然后 `cordis_run`。

首次运行需要在界面上批准（Cordis 面板 / Run 卡片）。

## 发布形态说明

这是一个**动态插件源码包**（不是 npm 可安装包）：DSH 的动态插件机制定义在进程内、无需打包。如需做成 `dsh plugin add` 可安装的静态插件包（`window.__ModuleLoader__` + `dsh.client` 配置 + 构建脚本），可在此基础上扩展。

## License

MIT
