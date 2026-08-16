/**
 * 归档会话管理插件 —— Host 半边
 *
 * 这是动态 Cordis 插件 code.host 的函数体（受限环境纯 JavaScript：
 * 无 import、无 TypeScript、无 JSX）。返回一个 Cordis Plugin 对象。
 *
 * 提供 3 个 Package 私有 RPC 方法（Client 通过 host.call 调用）：
 *   archived-list      列出归档会话（id、标题、创建时间、数据是否完好）
 *   archived-unarchive 恢复（取消归档）
 *   archived-delete    删除记录（取消归档 + 从工作区记录移除 + 返回文件位置）
 *
 * 原理：
 * - 归档清单存在 DSH workspace 存储域的 global 区。官方 workspaceRegistry
 *   只有 archiveSession()，没有反向 API。
 * - 写入统一走 workspaceRegistry.setState()：同一条官方写链（持久化 +
 *   内存同步 + domain/changed 事件广播），界面即时更新，且不会被后续官方
 *   操作覆盖。
 * - 数据文件不删除（受沙箱保护，插件不绕过沙箱）：删除记录后返回
 *   displayPath（脱敏显示路径）与 filePath（完整路径，仅供本机剪贴板），
 *   由界面引导用户手动删除。
 */

return {
  inject: ['storageDomain', 'sessionQuery', 'sessionPersistence', 'workspaceRegistry'],
  apply(ctx) {
    const domain = () => ctx.storageDomain.get('workspace')
    // 写操作串行化：防止并发“读-改-写”互相覆盖
    let writeTail = Promise.resolve()
    const enqueueWrite = (fn) => {
      const run = writeTail.then(fn, fn)
      writeTail = run.then(() => {}, () => {})
      return run
    }
    // 通过 workspaceRegistry.setState 写入：持久化 + 内存同步 + 事件广播，
    // 避免官方内存状态与磁盘不一致导致后续官方操作把修改冲掉。
    const setArchivedSessionIds = async (nextIds) => {
      const state = domain().global.get()
      await ctx.workspaceRegistry.setState({ ...state, archivedSessionIds: nextIds })
    }

    harness.handle('archived-list', async () => {
      try {
        const d = domain()
        if (!d) return { ok: false, error: 'workspace 存储域未打开' }
        const state = d.global.get()
        const ids = Array.isArray(state.archivedSessionIds) ? state.archivedSessionIds : []
        const records = await ctx.sessionQuery.listSessions()
        const byId = new Map(records.map((r) => [r.header.id, r]))
        let titles = []
        if (ids.length > 0) {
          try {
            titles = await ctx.sessionQuery.readTitleSnapshots(ids)
          } catch (err) {
            console.error('archived-list: readTitleSnapshots failed', err)
          }
        }
        const items = ids.map((id) => {
          const rec = byId.get(id)
          const hit = titles.find((t) => t.sessionId === id)
          const title = hit && hit.status === 'fulfilled' && hit.value && hit.value.title
            ? hit.value.title.title : null
          const createdAt = rec ? rec.header.createdAt : null
          let createdAtText = null
          if (createdAt != null) {
            try {
              createdAtText = new Date(createdAt).toISOString().replace('T', ' ').slice(0, 16)
            } catch (err) {
              createdAtText = null
            }
          }
          return {
            id,
            title,
            createdAt,
            createdAtText,
            exists: rec !== undefined && rec.persisted
          }
        })
        items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        return { ok: true, items }
      } catch (err) {
        console.error('archived-list failed', err)
        return { ok: false, error: String((err && err.message) || err) }
      }
    })

    harness.handle('archived-unarchive', async (args) => {
      try {
        const sessionId = args && args.sessionId
        if (typeof sessionId !== 'string') return { ok: false, error: '缺少 sessionId' }
        const d = domain()
        if (!d) return { ok: false, error: 'workspace 存储域未打开' }
        const state = d.global.get()
        if (!(state.archivedSessionIds || []).includes(sessionId)) return { ok: true, already: true }
        await enqueueWrite(() => setArchivedSessionIds(state.archivedSessionIds.filter((id) => id !== sessionId)))
        return { ok: true }
      } catch (err) {
        console.error('archived-unarchive failed', err)
        return { ok: false, error: String((err && err.message) || err) }
      }
    })

    harness.handle('archived-delete', async (args) => {
      try {
        const sessionId = args && args.sessionId
        if (typeof sessionId !== 'string') return { ok: false, error: '缺少 sessionId' }
        const d = domain()
        if (!d) return { ok: false, error: 'workspace 存储域未打开' }
        const state = d.global.get()
        if ((state.archivedSessionIds || []).includes(sessionId)) {
          await enqueueWrite(() => setArchivedSessionIds(state.archivedSessionIds.filter((id) => id !== sessionId)))
        }
        const table = d.table('workspaces')
        for (const ws of ctx.workspaceRegistry.list()) {
          const record = table.get(ws.id)
          if (record && Array.isArray(record.sessionIds) && record.sessionIds.includes(sessionId)) {
            await table.update(ws.id, (current) => ({
              ...current,
              sessionIds: current.sessionIds.filter((id) => id !== sessionId)
            }))
          }
        }
        // 不删除数据文件（沙箱限制，不绕过）。返回：
        //   filePath    完整绝对路径（仅进本机剪贴板，用于访达快速定位）
        //   displayPath 脱敏显示路径（省略工作区目录，不暴露用户名）
        let filePath = null
        let displayPath = null
        try {
          const records = await ctx.sessionQuery.listSessions()
          const rec = records.find((r) => r.header.id === sessionId)
          if (rec) {
            const loc = ctx.sessionPersistence.locate(rec.header)
            if (loc && loc.path) {
              filePath = loc.path
              const parts = String(loc.path).split('/')
              const sessionDir = parts.length >= 2 ? parts[parts.length - 2] : null
              displayPath = sessionDir ? '~/.dsh/sessions/…/' + sessionDir + '/' : null
            }
          }
        } catch (err) {
          console.error('archived-delete: locate failed', err)
        }
        return { ok: true, filePath, displayPath }
      } catch (err) {
        console.error('archived-delete failed', err)
        return { ok: false, error: String((err && err.message) || err) }
      }
    })
  },
}
