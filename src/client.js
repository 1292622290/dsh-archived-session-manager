/**
 * 归档会话管理插件 —— Client 半边
 *
 * 这是动态 Cordis 插件 code.client 的函数体（受限环境纯 JavaScript：
 * 无 import、无 JSX，React 用 React.createElement）。
 * 返回一个 Cordis Plugin 对象。
 *
 * 界面：设置面板（settings.section）新增「归档管理」页面。
 * 数据：通过 host.call 调用 Host 半边的私有 RPC（archived-list 等）。
 */

return {
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return

    styles.insert(`
      .archmgr-wrap { padding: 4px 0; }
      .archmgr-tip { font-size: 12px; opacity: .65; margin: 0 0 10px; line-height: 1.6; }
      .archmgr-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
      .archmgr-row { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(128,128,128,.25); margin-bottom: 8px; }
      .archmgr-main { flex: 1; min-width: 0; }
      .archmgr-title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; gap: 6px; }
      .archmgr-sub { font-size: 12px; opacity: .6; margin-top: 2px; }
      .archmgr-badge { font-size: 11px; padding: 1px 7px; border-radius: 99px; flex: none; }
      .archmgr-badge-ok { background: rgba(34,139,34,.15); color: #2e7d32; }
      .archmgr-badge-lost { background: rgba(200,80,40,.15); color: #c0502a; }
      .archmgr-btn { border: 1px solid rgba(128,128,128,.4); background: transparent; border-radius: 6px; padding: 4px 10px; font-size: 13px; cursor: pointer; }
      .archmgr-btn:disabled { opacity: .5; cursor: default; }
      .archmgr-btn-danger { border-color: rgba(200,60,50,.6); color: #c0392b; }
      .archmgr-empty { opacity: .6; font-size: 13px; padding: 12px 0; }
      .archmgr-err { color: #c0392b; font-size: 13px; margin: 8px 0; }
      .archmgr-notice { color: #2e7d32; font-size: 13px; margin: 8px 0; }
    `)

    slots.inject('settings.section', () => slots.register(
      { name: 'settings.section', id: 'archived-manager', order: 90, label: () => '归档管理' },
      () => {
        const [items, setItems] = React.useState(null)
        const [error, setError] = React.useState(null)
        const [busyId, setBusyId] = React.useState(null)
        const [confirmId, setConfirmId] = React.useState(null)
        const [notice, setNotice] = React.useState(null)
        const load = React.useCallback(() => {
          setError(null)
          setNotice(null)
          host.call('archived-list', {}).then((res) => {
            if (res && res.ok) setItems(res.items || [])
            else setError((res && res.error) || '加载归档列表失败')
          }).catch((err) => setError(String((err && err.message) || err)))
        }, [])
        React.useEffect(() => { load() }, [load])
        const run = (method, id, successText) => {
          setBusyId(id)
          setError(null)
          setNotice(null)
          host.call(method, { sessionId: id }).then((res) => {
            setBusyId(null)
            setConfirmId(null)
            if (res && res.ok) {
              if (successText) setNotice(successText)
              load()
            } else setError((res && res.error) || '操作失败')
          }).catch((err) => { setBusyId(null); setError(String((err && err.message) || err)) })
        }
        const onRestore = (id) => run('archived-unarchive', id, '已恢复。刷新页面（F5）后，该会话会重新出现在侧边栏')
        const onDeleteClick = (id) => {
          if (confirmId === id) run('archived-delete', id, '已彻底删除（索引与数据文件）')
          else setConfirmId(id)
        }
        return React.createElement('div', { className: 'archmgr-wrap' },
          React.createElement('p', { className: 'archmgr-tip' },
            '归档的会话不会出现在侧边栏，且官方界面没有查看/恢复入口。这里可以恢复或彻底删除它们；操作立即写入数据，刷新页面（F5）后侧边栏同步。'),
          React.createElement('div', { className: 'archmgr-bar' },
            React.createElement('button', { className: 'archmgr-btn', onClick: load, disabled: busyId !== null }, '刷新列表')),
          error !== null && React.createElement('p', { className: 'archmgr-err' }, String(error)),
          notice !== null && React.createElement('p', { className: 'archmgr-notice' }, String(notice)),
          items === null
            ? React.createElement('p', { className: 'archmgr-empty' }, '加载中…')
            : items.length === 0
              ? React.createElement('p', { className: 'archmgr-empty' }, '当前没有归档会话')
              : items.map((item) => React.createElement('div', { key: item.id, className: 'archmgr-row' },
                  React.createElement('div', { className: 'archmgr-main' },
                    React.createElement('div', { className: 'archmgr-title' },
                      React.createElement('span', null, item.title || '（无标题 / 记录已丢失）'),
                      React.createElement('span', { className: 'archmgr-badge ' + (item.exists ? 'archmgr-badge-ok' : 'archmgr-badge-lost') },
                        item.exists ? '数据完好' : '记录丢失')),
                    React.createElement('div', { className: 'archmgr-sub' },
                      '创建于 ' + (item.createdAtText || '—') + ' · ' + item.id)),
                  React.createElement('button', {
                    className: 'archmgr-btn',
                    disabled: busyId !== null,
                    onClick: () => onRestore(item.id)
                  }, '恢复'),
                  React.createElement('button', {
                    className: 'archmgr-btn archmgr-btn-danger',
                    disabled: busyId !== null,
                    onClick: () => onDeleteClick(item.id)
                  }, confirmId === item.id ? '确认删除？' : '删除'))))
      }
    ))
  },
}
