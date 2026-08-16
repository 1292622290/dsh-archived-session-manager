/**
 * 归档会话管理插件 —— Host 半边
 *
 * 这是动态 Cordis 插件 code.host 的函数体（受限环境纯 JavaScript：
 * 无 import、无 TypeScript、无 JSX）。返回一个 Cordis Plugin 对象。
 *
 * 提供 3 个 Package 私有 RPC 方法（Client 通过 host.call 调用）：
 *   archived-list      列出归档会话（id、标题、创建时间、数据是否完好）
 *   archived-unarchive 恢复（取消归档）
 *   archived-delete    彻底删除（取消归档 + 从工作区记录移除 + 删除磁盘文件）
 *
 * 原理：归档清单存在 DSH workspace 存储域的 global 区（workspace.json 的
 * archivedSessionIds）。官方 workspaceRegistry 只有 archiveSession()，没有
 * 反向 API，因此这里直接操作已打开的存储域（与官方按钮同一条持久化写入链）。
 */

return {
  inject: ['storageDomain', 'sessionQuery', 'sessionPersistence', 'workspaceRegistry'],
  apply(ctx) {
    const shell = ctx.get('shell')
    const domain = () => ctx.storageDomain.get('workspace')

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
        await d.global.set({
          ...state,
          archivedSessionIds: state.archivedSessionIds.filter((id) => id !== sessionId)
        })
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
          await d.global.set({
            ...state,
            archivedSessionIds: state.archivedSessionIds.filter((id) => id !== sessionId)
          })
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
        let fileDeleted = false
        if (shell !== undefined) {
          try {
            const records = await ctx.sessionQuery.listSessions()
            const rec = records.find((r) => r.header.id === sessionId)
            if (rec) {
              const loc = ctx.sessionPersistence.locate(rec.header)
              if (loc && loc.path) {
                const spec = shell.resolve({
                  command: `rm -rf "$(dirname '${loc.path}')"`,
                  timeoutMs: 15000
                })
                const result = await shell.run(spec)
                fileDeleted = result.exitCode === 0
              }
            }
          } catch (err) {
            console.error('archived-delete: file removal failed', err)
          }
        }
        return { ok: true, fileDeleted }
      } catch (err) {
        console.error('archived-delete failed', err)
        return { ok: false, error: String((err && err.message) || err) }
      }
    })
  },
}
