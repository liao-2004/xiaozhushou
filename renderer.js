const $ = (id) => document.getElementById(id);

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
$('offDate').value = todayStr();
$('onDate').value = todayStr();
$('customDate').value = todayStr();

function showStatus(msg, ok = true) {
  const el = $('status');
  el.textContent = msg || (ok ? '操作成功' : '操作失败，请检查设置');
  el.className = ok ? 'ok show' : 'err show';
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2500);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function refreshTasks() {
  const list = await window.api.listTasks();
  const tbody = document.querySelector('#taskTable tbody');
  tbody.innerHTML = '';
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#999">暂无关机/重启相关任务</td></tr>'; return; }
  const opMap = { shutdown:'关机', reboot:'重启', logout:'注销', hibernate:'休眠', sleep:'唤醒/睡眠', custom:'自定义指令' };
  list.forEach(t => {
    const tr = document.createElement('tr');
    let displayName = t.name;
    const m = t.name.match(/OnOffScheduler_Custom_(.+)$/);
    if (m) displayName = m[1];
    else if (t.name === 'OnOffScheduler_Shutdown') displayName = '定时关机';
    else if (t.name === 'OnOffScheduler_Wake') displayName = '定时唤醒';
    const cmdText = t.cmd || '';
    const cmdCellStyle = `font-family:Consolas,monospace;font-size:11px;color:#666;max-width:200px;word-break:break-all;cursor:${cmdText?'pointer':'default'}`;
    tr.innerHTML = `<td>${esc(displayName)}</td><td>${esc(opMap[t.op]||t.op||'未知')}</td><td>${esc(t.nextRun||'—')}</td><td style="${cmdCellStyle}" title="${cmdText?'点击复制命令代码':''}">${cmdText?esc(cmdText):'—'}</td><td></td>`;
    if (cmdText) {
      tr.children[3].onclick = async () => { await window.api.clipCopy(cmdText); showStatus('命令代码已复制', true); };
    }
    const del = document.createElement('button');
    del.className = 'del-btn'; del.textContent = '关闭';
    del.style.cssText = 'height:28px;line-height:1;padding:0 12px;white-space:nowrap;vertical-align:middle';
    del.onclick = async () => {
      const r = await window.api.deleteTask(t.name);
      showStatus(r.message||r.error, r.ok);
      refreshTasks();
    };
    tr.children[4].appendChild(del); tbody.appendChild(tr);
  });
}

// 按钮绑定
$('btnSetOff').onclick = async () => {
  const r = await window.api.scheduleShutdown({ date:$('offDate').value, time:$('offTime').value, once:$('offOnce').checked });
  showStatus(r.message||r.error, r.ok); refreshTasks();
};
$('btnCancelOff').onclick = async () => { const r = await window.api.cancelShutdown(); showStatus(r.message||r.error, r.ok); refreshTasks(); };
$('btnSetOn').onclick = async () => {
  const r = await window.api.scheduleWake({ date:$('onDate').value, time:$('onTime').value, once:$('onOnce').checked });
  showStatus(r.message||r.error, r.ok); refreshTasks();
};
$('btnCancelOn').onclick = async () => { const r = await window.api.cancelWake(); showStatus(r.message||r.error, r.ok); refreshTasks(); };
$('btnShutdownNow').onclick = async () => { const r = await window.api.shutdownNow(); showStatus(r.message||r.error, r.ok); };
$('btnRestartNow').onclick = async () => { const r = await window.api.restartNow(); showStatus(r.message||r.error, r.ok); };
$('btnAbort').onclick = async () => { const r = await window.api.abortShutdown(); showStatus(r.message||r.error, r.ok); };
$('btnRefresh').onclick = refreshTasks;
$('btnSetCustom').onclick = async () => {
  const r = await window.api.scheduleCustom({ name:$('customName').value, date:$('customDate').value, time:$('customTime').value, command:$('customCmd').value });
  showStatus(r.message||r.error, r.ok); refreshTasks();
};
$('btnRunCustomNow').onclick = async () => {
  const cmd = $('customCmd').value;
  if (!cmd) { showStatus('请先输入命令', false); return; }
  const r = await window.api.runCustomNow(cmd); showStatus(r.message||r.error, r.ok);
};

// 视频下载
$('btnDownload').onclick = async () => {
  const url = $('videoUrl').value.trim();
  if (!url) { showStatus('请输入视频URL', false); return; }
  showStatus('下载中，请稍候...', true);
  const r = await window.api.downloadOnline({ url, saveDir: $('videoDir').value.trim() });
  showStatus(r.message||r.error, r.ok);
};
$('btnDownloadDirect').onclick = async () => {
  const url = $('videoUrl').value.trim();
  if (!url) { showStatus('请输入视频直链URL', false); return; }
  showStatus('下载中...', true);
  const r = await window.api.downloadVideo({ url, saveDir: $('videoDir').value.trim() });
  showStatus(r.message||r.error, r.ok);
};

// 置顶
$('btnPin').onclick = async () => {
  const r = await window.api.toggleTop();
  $('btnPin').classList.toggle('pinned', r.top);
  $('btnPin').textContent = r.onTop ? '已置顶' : '置顶';
};

// 窗口控制
$('btnMin').onclick = () => window.api.minimize();
$('btnClose').onclick = () => window.api.close();

// 主题切换
function applyTheme(t) {
  document.body.dataset.theme = t;
  $('btnTheme').innerHTML = t === 'dark' ? '&#9788;' : '&#9789;';
}
$('btnTheme').onclick = () => {
  const next = document.body.dataset.theme === 'dark' ? '' : 'dark';
  applyTheme(next); localStorage.setItem('theme', next);
  window.api.setTheme(next);
};
applyTheme(localStorage.getItem('theme') || '');
window.api.setTheme(localStorage.getItem('theme') || '');

// 下拉菜单
$('btnDrop').onclick = (e) => { e.stopPropagation(); $('dropMenu').classList.toggle('show'); };
document.onclick = () => $('dropMenu').classList.remove('show');
$('btnShot').onclick = async () => {
  const r = await window.api.captureShot(); showStatus(r.message||r.error, r.ok);
  $('dropMenu').classList.remove('show');
};
$('btnHibernate').onclick = async () => {
  const r = await window.api.hibernateNow(); showStatus(r.message||r.error, r.ok);
  $('dropMenu').classList.remove('show');
};

// 标签切换
document.querySelectorAll('.tab').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.page).classList.add('active');
    if (capturing) { capturing=false; $('keyHint').style.display='none'; $('btnEditKey').textContent='修改'; }
  };
});

// 开机自启动
async function loadAutoStart() {
  const r = await window.api.getAutostart();
  $('autoStart').checked = r.enabled; updateSwitch();
}
function updateSwitch() {
  const on = $('autoStart').checked;
  const s = $('autoStart').nextElementSibling, d = s.nextElementSibling;
  s.style.background = on ? 'var(--accent)' : 'var(--border)';
  d.style.transform = on ? 'translateX(16px)' : 'translateX(0)';
}
$('autoStart').onchange = async () => { updateSwitch(); await window.api.setAutostart($('autoStart').checked); showStatus($('autoStart').checked?'已开启开机自启动':'已关闭开机自启动', true); };
loadAutoStart();

// 快捷键设置
let capturing = false;
let captureTarget = 'shot';
async function loadKey() {
  const cfg = await window.api.getConfig();
  $('shotKeyLabel').textContent = cfg.shotKey || 'Alt+Q';
  $('shotKeyHint').textContent = cfg.shotKey || 'Alt+Q';
  $('hibKeyLabel').textContent = cfg.hibKey || 'Alt+W';
  $('hibKeyHint').textContent = cfg.hibKey || 'Alt+W';
  $('shutdownKeyLabel').textContent = cfg.shutdownKey || 'Alt+S';
  $('openKeyLabel').textContent = cfg.openKey || 'Alt+E';
  $('shotDisabled').checked = !!cfg.shotDisabled;
  $('hibDisabled').checked = !!cfg.hibDisabled;
  $('shutdownDisabled').checked = !!cfg.shutdownDisabled;
  $('openDisabled').checked = !!cfg.openDisabled;
  $('clipKeyLabel').textContent = cfg.clipKey || 'Alt+1';
  $('clipDisabled').checked = !!cfg.clipDisabled;
  $('hideKeyLabel').textContent = cfg.hideKey || 'Alt+2';
  $('hideDisabled').checked = !!cfg.hideDisabled;
  $('cmdKeyLabel').textContent = cfg.cmdKey || 'Alt+R';
  $('launchAllKeyLabel').textContent = cfg.launchAllKey || 'Alt+A';
  $('cmdDisabled').checked = !!cfg.cmdDisabled;
  $('launchAllKeyLabel').textContent = cfg.launchAllKey || 'Alt+A';
  $('launchAllDisabled').checked = !!cfg.launchAllDisabled;
  $('desktopKeyLabel').textContent = cfg.desktopKey || 'Alt+I';
  $('desktopDisabled').checked = !!cfg.desktopDisabled;
}
document.querySelectorAll('[data-edit]').forEach(btn => {
  btn.onclick = () => {
    captureTarget = btn.dataset.edit;
    capturing = true;
    $('keyHint').style.display = 'block';
    btn.textContent = '按任意键...(Esc取消)';
    // 捕获新快捷键期间，临时屏蔽所有全局快捷键，避免按下 Alt+Q 等组合键时直接触发功能
    window.api.suspendShortcuts();
  };
});
document.addEventListener('keydown', async (e) => {
  if (!capturing) return;
  e.preventDefault();
  // Esc 取消本次修改，恢复全局快捷键
  if (e.key === 'Escape') {
    capturing = false;
    $('keyHint').style.display = 'none';
    document.querySelectorAll('[data-edit]').forEach(b => b.textContent = '修改');
    showStatus('已取消修改', true);
    window.api.refreshShortcuts();
    return;
  }
  if (['Control','Alt','Shift','Meta'].includes(e.key)) return;
  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Super');
  let key = e.key === ' ' ? 'Space' : e.key;
  parts.push(key.length === 1 ? key.toUpperCase() : key);
  const newKey = parts.join('+');
  const cfg = await window.api.getConfig();
  if (captureTarget === 'shot') cfg.shotKey = newKey;
  else if (captureTarget === 'hib') cfg.hibKey = newKey;
  else if (captureTarget === 'shutdown') cfg.shutdownKey = newKey;
  else if (captureTarget === 'open') cfg.openKey = newKey;
  else if (captureTarget === 'clip') cfg.clipKey = newKey;
  else if (captureTarget === 'hide') cfg.hideKey = newKey;
  else if (captureTarget === 'cmd') cfg.cmdKey = newKey;
  else if (captureTarget === 'launchAll') cfg.launchAllKey = newKey;
  else if (captureTarget === 'desktop') cfg.desktopKey = newKey;
  await window.api.setConfig(cfg);
  $('shotKeyLabel').textContent = cfg.shotKey || 'Alt+Q';
  $('shotKeyHint').textContent = cfg.shotKey || 'Alt+Q';
  $('hibKeyLabel').textContent = cfg.hibKey || 'Alt+W';
  $('hibKeyHint').textContent = cfg.hibKey || 'Alt+W';
  $('shutdownKeyLabel').textContent = cfg.shutdownKey || 'Alt+S';
  $('openKeyLabel').textContent = cfg.openKey || 'Alt+E';
  $('clipKeyLabel').textContent = cfg.clipKey || 'Alt+1';
  $('hideKeyLabel').textContent = cfg.hideKey || 'Alt+2';
  $('cmdKeyLabel').textContent = cfg.cmdKey || 'Alt+R';
  $('launchAllKeyLabel').textContent = cfg.launchAllKey || 'Alt+A';
  $('desktopKeyLabel').textContent = cfg.desktopKey || 'Alt+I';
  capturing = false;
  $('keyHint').style.display = 'none';
  document.querySelectorAll('[data-edit]').forEach(b => b.textContent = '修改');
  showStatus(`快捷键已改为 ${newKey}`, true);
  window.api.refreshShortcuts();
});
$('shotDisabled').onchange = async () => {
  const cfg = await window.api.getConfig();
  cfg.shotDisabled = $('shotDisabled').checked;
  await window.api.setConfig(cfg);
  showStatus(cfg.shotDisabled?'截图快捷键已禁用':'截图快捷键已启用', true);
  window.api.refreshShortcuts();
};
$('hibDisabled').onchange = async () => {
  const cfg = await window.api.getConfig();
  cfg.hibDisabled = $('hibDisabled').checked;
  await window.api.setConfig(cfg);
  showStatus(cfg.hibDisabled?'休眠快捷键已禁用':'休眠快捷键已启用', true);
  window.api.refreshShortcuts();
};
$('shutdownDisabled').onchange = async () => {
  const cfg = await window.api.getConfig();
  cfg.shutdownDisabled = $('shutdownDisabled').checked;
  await window.api.setConfig(cfg);
  showStatus(cfg.shutdownDisabled?'关机快捷键已禁用':'关机快捷键已启用', true);
  window.api.refreshShortcuts();
};
$('openDisabled').onchange = async () => {
  const cfg = await window.api.getConfig();
  cfg.openDisabled = $('openDisabled').checked;
  await window.api.setConfig(cfg);
  showStatus(cfg.openDisabled?'打开页面快捷键已禁用':'打开页面快捷键已启用', true);
  window.api.refreshShortcuts();
};
$('clipDisabled').onchange = async () => {
  const cfg = await window.api.getConfig();
  cfg.clipDisabled = $('clipDisabled').checked;
  await window.api.setConfig(cfg);
  showStatus(cfg.clipDisabled?'剪贴板快捷键已禁用':'剪贴板快捷键已启用', true);
  window.api.refreshShortcuts();
};
$('hideDisabled').onchange = async () => {
  const cfg = await window.api.getConfig();
  cfg.hideDisabled = $('hideDisabled').checked;
  await window.api.setConfig(cfg);
  showStatus(cfg.hideDisabled?'放回后台快捷键已禁用':'放回后台快捷键已启用', true);
  window.api.refreshShortcuts();
};
$('cmdDisabled').onchange = async () => {
  const cfg = await window.api.getConfig();
  cfg.cmdDisabled = $('cmdDisabled').checked;
  await window.api.setConfig(cfg);
  showStatus(cfg.cmdDisabled?'打开CMD快捷键已禁用':'打开CMD快捷键已启用', true);
  window.api.refreshShortcuts();
};
$('launchAllDisabled').onchange = async () => {
  const cfg = await window.api.getConfig();
  cfg.launchAllDisabled = $('launchAllDisabled').checked;
  await window.api.setConfig(cfg);
  showStatus(cfg.launchAllDisabled?'全部启动快捷键已禁用':'全部启动快捷键已启用', true);
  window.api.refreshShortcuts();
};
$('desktopDisabled').onchange = async () => {
  const cfg = await window.api.getConfig();
  cfg.desktopDisabled = $('desktopDisabled').checked;
  await window.api.setConfig(cfg);
  showStatus(cfg.desktopDisabled?'显示桌面快捷键已禁用':'显示桌面快捷键已启用', true);
  window.api.refreshShortcuts();
};
loadKey();

// 快捷启动
async function refreshLaunchList() {
  const list = await window.api.launchList();
  const tbody = document.querySelector('#launchTable tbody');
  tbody.innerHTML = '';
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#999">暂无软件</td></tr>'; return; }
  list.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${item.name}</td><td style="font-size:11px;color:#999">${item.path}</td><td></td>`;
    const del = document.createElement('button');
    del.className = 'del-btn'; del.textContent = '删除';
    del.onclick = async () => { await window.api.launchRemove(item.name); showStatus('已删除', true); refreshLaunchList(); };
    tr.children[2].appendChild(del); tbody.appendChild(tr);
  });
}
$('btnAddLaunch').onclick = async () => {
  const name = $('launchName').value.trim();
  const p = $('launchPath').value.trim();
  if (!name || !p) { showStatus('请填写名称和路径', false); return; }
  const r = await window.api.launchAdd({ name, path: p });
  showStatus(r.message||r.error, r.ok);
  $('launchName').value=''; $('launchPath').value='';
  refreshLaunchList();
};
$('btnLaunchAll').onclick = async () => {
  const r = await window.api.launchRunAll();
  showStatus(r.message||r.error, r.ok);
};

// 剪贴板历史
async function refreshClip() {
  const list = await window.api.clipList();
  const el = $('clipList');
  el.innerHTML = '';
  if (!list.length) { el.innerHTML = '<div style="color:#999;font-size:12px;padding:8px">暂无记录</div>'; return; }
  list.forEach((item, i) => {
    const text = typeof item === 'string' ? item : item.text;
    const time = typeof item === 'string' ? '' : (item.time || '');
    const div = document.createElement('div');
    div.style.cssText = 'padding:8px;border:1px solid var(--border);border-radius:6px;margin-bottom:6px;cursor:pointer;font-size:12px;';
    div.innerHTML = `<div style="color:#999;font-size:11px;margin-bottom:4px">${time}</div><div style="word-break:break-all">${text.slice(0,200)}${text.length>200?'...':''}</div>`;
    div.onclick = async () => { await window.api.clipCopy(text); showStatus('已复制到剪贴板', true); };
    el.appendChild(div);
  });
}
$('btnClearClip').onclick = async () => { await window.api.clipClear(); refreshClip(); showStatus('已清空', true); };
window.api.onClipUpdate(() => refreshClip());

// 快捷输入
async function refreshQuick() {
  const list = await window.api.quickList();
  const el = $('quickList');
  el.innerHTML = '';
  if (!list.length) { el.innerHTML = '<div style="color:#999;font-size:12px;padding:8px">暂无快捷输入，添加常用文本</div>'; return; }
  list.forEach((text, i) => {
    const div = document.createElement('div');
    div.style.cssText = 'padding:8px;border:1px solid var(--border);border-radius:6px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;gap:8px;';
    div.innerHTML = `<span style="font-size:12px;word-break:break-all;flex:1">${text}</span>`;
    const del = document.createElement('button');
    del.className = 'btn-gray'; del.style.cssText = 'padding:2px 8px;font-size:11px'; del.textContent = '删';
    del.onclick = async () => { await window.api.quickDel(i); refreshQuick(); };
    div.appendChild(del);
    div.onclick = async () => { await window.api.clipCopy(text); showStatus('已复制', true); };
    el.appendChild(div);
  });
}
$('btnAddQuick').onclick = async () => {
  const v = $('quickInput').value.trim();
  if (!v) return;
  await window.api.quickAdd(v);
  $('quickInput').value = '';
  refreshQuick();
};
$('quickInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnAddQuick').click(); });
refreshQuick();

// 点单元格就地编辑：直接在该格文字上改（contenteditable，不出输入框），Enter/失焦保存，Esc 取消
function startEdit(td, idx, field) {
  if (td.getAttribute('contenteditable') === 'true') return;
  const oldVal = field === 'amount' ? parseFloat(td.textContent) : (td.textContent || '').trim();
  td.setAttribute('contenteditable', 'true');
  td.focus();
  const range = document.createRange();
  range.selectNodeContents(td);
  const sel = window.getSelection();
  sel.removeAllRanges(); sel.addRange(range);
  let done = false;
  const commit = async () => {
    if (done) return; done = true;
    td.removeAttribute('contenteditable');
    let v = (td.textContent || '').replace(/\n/g, '').trim();
    if (field === 'amount') v = parseFloat(v);
    if (field === 'amount' && isNaN(v)) { refreshNotes(); return; }
    if (v === oldVal) return; // 未改动则不保存
    await window.api.notesUpdate(idx, { [field]: v });
    refreshNotes();
  };
  td.onkeydown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { done = true; td.removeAttribute('contenteditable'); refreshNotes(); }
  };
  td.onblur = commit;
}
// 记事板
async function refreshNotes() {
  const list = await window.api.notesList();
  const byMonth = {};
  let total = 0;
  list.forEach(n => {
    const m = (n.date || '').slice(0,7);
    if (!byMonth[m]) byMonth[m] = { sum:0, items:[] };
    byMonth[m].sum += Number(n.amount)||0;
    byMonth[m].items.push(n);
    total += Number(n.amount)||0;
  });
  const sumEl = $('noteSummary');
  let html = `<div style="font-size:13px;margin-bottom:8px">总计：<b style="color:var(--accent)">${total.toFixed(2)}</b></div>`;
  Object.keys(byMonth).sort().reverse().forEach(m => {
    html += `<div style="font-size:12px;color:var(--text-sub);margin:4px 0">${m} 月小计：<b>${byMonth[m].sum.toFixed(2)}</b></div>`;
  });
  sumEl.innerHTML = html;
  const el = $('noteList');
  el.innerHTML = '';
  if (!list.length) { el.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#999;padding:12px;border:none">暂无记录</td></tr>'; return; }
  const indexed = list.map((n, i) => ({ n, i })).sort((a,b) => (b.n.date||'').localeCompare(a.n.date||''));
  let lastDate = null;
  indexed.forEach(({ n, i }) => {
    const d = n.date || '无日期';
    if (d !== lastDate) {
      // 日期作分类分隔：小字号 + 下划线，与下方数据分开
      const htr = document.createElement('tr');
      htr.innerHTML = `<td colspan="3" style="font-size:10px;color:var(--text-sub);padding:10px 0 3px;border-bottom:1px solid var(--border);font-weight:400">${d}</td>`;
      el.appendChild(htr);
      lastDate = d;
    }
    // 数据行：无边框更清爽；金额/事件可点击就地编辑
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="cell-amount" title="点击修改" style="white-space:nowrap;width:110px;border:none;color:var(--accent);font-weight:500;cursor:text">${Number(n.amount).toFixed(2)}</td><td class="cell-desc" title="点击修改" style="word-break:break-all;border:none;cursor:text">${n.desc||''}</td><td style="text-align:right;white-space:nowrap;width:40px;border:none"><button class="delBtn" style="padding:2px 4px;font-size:14px;color:#9b2c2c;background:none;border:none;cursor:pointer">×</button></td>`;
    tr.querySelector('.delBtn').onclick = async () => { await window.api.notesDel(i); refreshNotes(); };
    tr.querySelector('.cell-amount').onclick = (e) => startEdit(e.target, i, 'amount');
    tr.querySelector('.cell-desc').onclick = (e) => startEdit(e.target, i, 'desc');
    el.appendChild(tr);
  });
}
$('btnAddNote').onclick = async () => {
  const amount = parseFloat($('noteAmount').value);
  const date = $('noteDate').value;
  const desc = $('noteDesc').value.trim();
  if (isNaN(amount) || !date) { showStatus('请填写数值和时间', false); return; }
  await window.api.notesAdd({ amount, date, desc, time: new Date().toLocaleString() });
  $('noteAmount').value = ''; $('noteDesc').value = '';
  refreshNotes();
  showStatus('已添加', true);
};
refreshNotes();

// 记事板 JSON 导出/导入
$('btnNotesExport').onclick = async () => {
  const r = await window.api.notesExport();
  showStatus(r.ok ? ('已导出到 ' + r.path) : '已取消导出', r.ok);
};
$('btnNotesImport').onclick = async () => {
  try {
    const r = await window.api.notesPickImport();
    if (!r || !r.ok) { showStatus('已取消导入', false); return; }
    openImportModal(r.list, r.existing || []);
  } catch (e) { showStatus('导入失败：' + e.message, false); }
};
function openImportModal(incoming, existing) {
  if (!incoming || !incoming.length) { showStatus('文件为空，没有可导入的记录', false); return; }
  const keyOf = (n) => [n.amount, n.date, n.desc].join('||');
  const existKeys = new Set((existing || []).map(keyOf));
  let dupCount = 0;
  const listEl = $('importList'); listEl.innerHTML = '';
  const grouped = {};
  incoming.forEach((n, idx) => {
    const d = n.date || '无日期';
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push({ n, idx });
  });
  Object.keys(grouped).sort().reverse().forEach(d => {
    const head = document.createElement('div');
    head.textContent = d;
    head.style.cssText = 'font-weight:600;font-size:12px;color:var(--text-sub);margin:10px 0 4px;padding-bottom:2px;border-bottom:1px solid var(--border)';
    listEl.appendChild(head);
    grouped[d].forEach(({ n, idx }) => {
      const isDup = existKeys.has(keyOf(n));
      if (isDup) dupCount++;
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 4px;font-size:13px;cursor:pointer';
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = !isDup; cb.disabled = isDup;
      cb.dataset.idx = idx;
      const text = document.createElement('span');
      text.style.cssText = 'flex:1;color:var(--text)';
      text.textContent = `${n.amount!=null?('¥'+n.amount):''}  ${n.desc||''}${n.time?'  ('+n.time+')':''}`;
      if (isDup) { text.style.opacity = '0.55'; const tag = document.createElement('span'); tag.textContent='重复'; tag.style.cssText='color:#e53e3e;font-size:11px;margin-left:6px'; text.appendChild(tag); }
      row.appendChild(cb); row.appendChild(text);
      listEl.appendChild(row);
    });
  });
  $('importDupHint').textContent = `共 ${incoming.length} 条，其中 ${dupCount} 条重复已自动取消勾选`;
  window._importData = incoming;
  $('importModal').style.display = 'flex';
}
$('btnImportCancel').onclick = () => { $('importModal').style.display = 'none'; window._importData = null; };
$('btnImportConfirm').onclick = async () => {
  const incoming = window._importData || [];
  const chosen = [...document.querySelectorAll('#importList input[type=checkbox]:checked')].map(cb => incoming[Number(cb.dataset.idx)]);
  $('importModal').style.display = 'none'; window._importData = null;
  const r = await window.api.notesAppend(chosen);
  refreshNotes();
  showStatus(r.ok ? `已导入 ${r.added} 条` : '导入失败', r.ok);
};
window.addEventListener('dragover', (e) => { e.preventDefault(); });
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (!f) return;
  if (!/\.json$/i.test(f.name)) { showStatus('只能拖入 .json 文件', false); return; }
  try {
    const text = await f.text();
    const arr = JSON.parse(text);
    if (!Array.isArray(arr)) throw new Error('文件不是记录数组');
    const existing = await window.api.notesList();
    openImportModal(arr, existing);
  } catch (err) { showStatus('导入失败：' + err.message, false); }
});

// 图标运行：奔跑速度倍率 + 三项开关
(function(){
  const input = $('catSpeedScale'), val = $('catSpeedScaleVal');
  // 按滑块当前位置填充轨道已选部分（主题色）
  const paint = () => {
    const min = +input.min || 0, max = +input.max || 100;
    const pct = Math.max(0, Math.min(100, ((+input.value - min) / (max - min)) * 100));
    input.style.background = `linear-gradient(to right, var(--accent) 0%, var(--accent) ${pct}%, var(--border) ${pct}%, var(--border) 100%)`;
  };
  window.api.getConfig().then(c => {
    const v = (c.catSpeedScale != null) ? c.catSpeedScale : 1;
    input.value = v; val.textContent = v.toFixed(1) + 'x'; paint();
  });
  input.oninput = () => { val.textContent = Number(input.value).toFixed(1) + 'x'; paint(); };
  input.onchange = async () => {
    const c = await window.api.getConfig();
    c.catSpeedScale = Number(input.value);
    await window.api.setConfig(c);
    showStatus(`奔跑速度 ${Number(input.value).toFixed(1)}x，即时生效`, true);
  };
  ['catUseCpu','catUseMem','catUseDisk'].forEach((id) => {
    const el = $(id);
    window.api.getConfig().then(c => { el.checked = (c[id] !== false); });
    el.onchange = async () => {
      const c = await window.api.getConfig();
      c[id] = el.checked;
      await window.api.setConfig(c);
      showStatus((el.checked ? '已开启' : '已关闭') + id.replace('catUse',''), true);
    };
  });
})();

// 整理桌面
async function loadOrganizeSetting() {
  const cfg = await window.api.getConfig();
  $('autoOrganize').checked = !!cfg.autoOrganize;
  $('moveFiles').checked = !!cfg.moveFiles;
  $('arrangeMode').value = cfg.arrangeMode || 'name';
  $('dirShortcut').value = cfg.dirShortcut || '';
  $('dirFolder').value = cfg.dirFolder || '';
  $('dirFile').value = cfg.dirFile || '';
}
$('autoOrganize').onchange = async () => {
  const cfg = await window.api.getConfig();
  cfg.autoOrganize = $('autoOrganize').checked;
  await window.api.setConfig(cfg);
  showStatus(cfg.autoOrganize ? '已开启自动整理' : '已关闭自动整理', true);
};
$('moveFiles').onchange = async () => {
  const cfg = await window.api.getConfig();
  cfg.moveFiles = $('moveFiles').checked;
  await window.api.setConfig(cfg);
};
$('arrangeMode').onchange = async () => {
  const cfg = await window.api.getConfig();
  cfg.arrangeMode = $('arrangeMode').value;
  await window.api.setConfig(cfg);
};
['dirShortcut','dirFolder','dirFile'].forEach(id => {
  $(id).onchange = async () => {
    const cfg = await window.api.getConfig();
    cfg[id] = $(id).value;
    await window.api.setConfig(cfg);
  };
});
$('btnOrganize').onclick = async () => {
  const r = await window.api.organizeRun({
    arrangeMode:$('arrangeMode').value, moveFiles:$('moveFiles').checked,
    dirShortcut:$('dirShortcut').value, dirFolder:$('dirFolder').value, dirFile:$('dirFile').value
  });
  if (r.ok) showStatus(`整理完成：软件${r.moved.shortcuts}、文件夹${r.moved.folders}、文件${r.moved.files}`, true);
  else showStatus('整理失败: ' + r.error, false);
};
loadOrganizeSetting();

// 窗口缩到很窄时只留置顶按钮
function checkMini() {
  if (window.innerWidth < 130) document.body.classList.add('mini');
  else document.body.classList.remove('mini');
}
window.addEventListener('resize', checkMini);
checkMini();
// 启动时已置顶状态，且为左下角小点
$('btnPin').classList.add('pinned');
$('btnPin').textContent = '已置顶';
// 接收主进程置顶状态同步
window.api.onPinChanged && window.api.onPinChanged((pinned) => {
  $('btnPin').classList.toggle('pinned', pinned);
  $('btnPin').textContent = pinned ? '已置顶' : '置顶';
});
// 从后台调出来时去掉 mini 隐藏模式
window.api.onExitMini && window.api.onExitMini(() => document.body.classList.remove('mini'));
document.body.classList.add('mini');

refreshTasks();
refreshLaunchList();
refreshClip();
