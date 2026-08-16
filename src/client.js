/**
 * 归档会话管理插件 —— Client 半边
 *
 * 这是动态 Cordis 插件 code.client 的函数体（受限环境纯 JavaScript：
 * 无 import、无 JSX，React 用 React.createElement）。
 * 返回一个 Cordis Plugin 对象。
 *
 * 界面：设置面板（settings.section）新增「归档管理」页面。
 * 数据：通过 host.call 调用 Host 半边的私有 RPC（archived-list 等）。
 * 隐私：删除引导只显示脱敏路径（~/.dsh/sessions/…/session-xxxx/），
 *       不暴露用户名；完整路径仅进入本机剪贴板。
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
      .archmgr-guidance { margin: 10px 0; padding: 10px 12px; border: 1px solid rgba(128,128,128,.3); border-radius: 8px; background: rgba(128,128,128,.06); font-size: 13px; line-height: 1.7; }
      .archmgr-guidance-title { font-weight: 600; margin: 0 0 6px; }
      .archmgr-pathrow { display: flex; align-items: center; gap: 8px; margin: 4px 0 6px; flex-wrap: wrap; }
      .archmgr-path { font-family: monospace; font-size: 12px; word-break: break-all; background: rgba(128,128,128,.12); padding: 2px 6px; border-radius: 4px; }
      .archmgr-steps { margin: 4px 0; padding-left: 20px; }
      .archmgr-alt { margin: 6px 0 0; opacity: .75; }
    `)

    slots.inject('settings.section', () => slots.register(
      { name: 'settings.section', id: 'archived-manager', order: 90, label: () => '归档管理' },
      () => {
        const [items, setItems] = React.useState(null)
        const [error, setError] = React.useState(null)
        const [busyId, setBusyId] = React.useState(null)
        const [confirmId, setConfirmId] = React.useState(null)
        const [notice, setNotice] = React.useState(null)
        const [guidance, setGuidance] = React.useState(null)
        const [copyTip, setCopyTip] = React.useState(null)
        const load = React.useCallback(() => {
          setError(null)
          host.call('archived-list', {}).then((res) => {
            if (res && res.ok) setItems(res.items || [])
            else setError((res && res.error) || '加载归档列表失败')
          }).catch((err) => setError(String((err && err.message) || err)))
        }, [])
        React.useEffect(() => { load() }, [load])
        const run = (method, id, onOk) => {
          setBusyId(id)
          setError(null)
          setNotice(null)
          setGuidance(null)
          host.call(method, { sessionId: id }).then((res) => {
            setBusyId(null)
            setConfirmId(null)
            if (res && res.ok) {
              load()
              if (onOk) onOk(res)
            } else setError((res && res.error) || '操作失败')
          }).catch((err) => { setBusyId(null); setError(String((err && err.message) || err)) })
        }
        const onRestore = (id) => run('archived-unarchive', id, () => setNotice('已恢复，该会话已重新出现在侧边栏'))
        const onDeleteClick = (id) => {
          if (confirmId !== id) { setConfirmId(id); return }
          run('archived-delete', id, (res) => {
            if (res && res.displayPath) {
              setNotice('记录已清除')
              setGuidance({ displayPath: res.displayPath, copyPath: res.filePath || null })
            } else {
              setNotice('已彻底清除（该会话没有残留文件）')
            }
          })
        }
        const copyPath = () => {
          if (!guidance || !guidance.copyPath) return
          try {
            if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(guidance.copyPath).then(() => setCopyTip('已复制到剪贴板（仅本机使用）✓')).catch(() => setCopyTip('复制失败，请手动选中复制'))
            } else {
              setCopyTip('请手动选中路径复制')
            }
          } catch (err) {
            setCopyTip('请手动选中路径复制')
          }
        }
        return React.createElement('div', { className: 'archmgr-wrap' },
          React.createElement('p', { className: 'archmgr-tip' },
            '归档的会话不会出现在侧边栏，且官方界面没有查看/恢复入口。这里可以恢复或彻底删除它们。删除会清除记录；数据文件受系统保护无法由插件删除，若需彻底清理可按提示手动删除。'),
          React.createElement('div', { className: 'archmgr-bar' },
            React.createElement('button', { className: 'archmgr-btn', onClick: load, disabled: busyId !== null }, '刷新列表')),
          error !== null && React.createElement('p', { className: 'archmgr-err' }, String(error)),
          notice !== null && React.createElement('p', { className: 'archmgr-notice' }, String(notice)),
          guidance !== null && React.createElement('div', { className: 'archmgr-guidance' },
            React.createElement('p', { className: 'archmgr-guidance-title' }, '数据文件仍在磁盘上，可选：手动删除'),
            React.createElement('div', { className: 'archmgr-pathrow' },
              React.createElement('code', { className: 'archmgr-path' }, guidance.displayPath),
              guidance.copyPath !== null && React.createElement('button', { className: 'archmgr-btn', onClick: copyPath }, copyTip || '复制完整路径')),
            React.createElement('ol', { className: 'archmgr-steps' },
              React.createElement('li', null, '按 ⌘ + Shift + G 打开「前往文件夹」'),
              React.createElement('li', null, '输入 ~/.dsh/sessions，回车'),
              React.createElement('li', null, '找到以该 session-xxxx 开头的文件夹，移到废纸篓'),
              React.createElement('li', null, '重启 DSH 后，该会话彻底消失')),
            React.createElement('p', { className: 'archmgr-alt' }, '复制按钮会把完整路径放进你自己的剪贴板（仅本机使用），用于访达快速定位。也可以直接对助手说"把残留文件删了"，助手会用提升权限帮你处理。')),
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
