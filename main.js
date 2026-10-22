const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage, clipboard, screen, desktopCapturer, nativeTheme, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec, execSync, spawn } = require('child_process');

// 单实例锁
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
else {
  app.on('second-instance', () => { if (mainWindow) showMainWindow(true); });
}

let mainWindow, tray, shotWindow, clipPickerWindow;
let forceQuit = false;
const desktopPath = path.join(app.getPath('home'), 'Desktop');

// 配置文件：写到用户目录（Program Files 下无写权限），首启从打包默认值复制
const DATA_DIR = app.getPath('userData');
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch(e) {}
function dataFile(name) {
  const p = path.join(DATA_DIR, name);
  if (!fs.existsSync(p)) {
    try { fs.copyFileSync(path.join(__dirname, name), p); } catch(e) {}
  }
  return p;
}
const configFile = dataFile('config.json');
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(configFile, 'utf8')); }
  catch (e) { return {}; }
}
function saveConfig(cfg) { fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2), 'utf8'); }

// 记事板
const noteFile = dataFile('notes.json');
function loadNotes() { try { return JSON.parse(fs.readFileSync(noteFile, 'utf8')); } catch(e) { return []; } }
function saveNotes(list) { fs.writeFileSync(noteFile, JSON.stringify(list, null, 2), 'utf8'); }

// 快捷输入
const quickFile = dataFile('quick_input.json');
function loadQuick() { try { return JSON.parse(fs.readFileSync(quickFile, 'utf8')); } catch(e) { return []; } }
function saveQuick(list) { fs.writeFileSync(quickFile, JSON.stringify(list, null, 2), 'utf8'); }

// 剪贴板历史
const clipFile = dataFile('clip_history.json');
let lastClipText = '';
function loadClip() { try { return JSON.parse(fs.readFileSync(clipFile, 'utf8')); } catch(e) { return []; } }
function saveClip(list) { fs.writeFileSync(clipFile, JSON.stringify(list, null, 2), 'utf8'); }

// 快捷启动
const launchFile = dataFile('launch_list.json');
function loadLaunch() { try { return JSON.parse(fs.readFileSync(launchFile, 'utf8')); } catch(e) { return []; } }
function saveLaunch(list) { fs.writeFileSync(launchFile, JSON.stringify(list, null, 2), 'utf8'); }

// 按所选方式真正排序桌面图标：让桌面图标列表获得焦点 -> 调出「排序方式」菜单 -> 选中目标项后确定。
// 仅整理桌面时触发，不影响其他功能。注意：若此刻有其它置顶窗口遮挡桌面，排序可能被抢焦点而不生效。
function arrangeDesktop(arrangeMode) {
  const sub = ({ name:0, size:1, type:2, date:3 }[arrangeMode] || 0);
  const psScript = `Add-Type -TypeDefinition 'using System;using System.Text;using System.Runtime.InteropServices;public class S{[DllImport("user32.dll",CharSet=CharSet.Unicode)]public static extern int GetClassName(IntPtr h,StringBuilder s,int n);[DllImport("user32.dll")]public static extern bool EnumWindows(EW cb,IntPtr l);[DllImport("user32.dll")]public static extern bool EnumChildWindows(IntPtr p,EW cb,IntPtr l);[DllImport("user32.dll")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);[DllImport("kernel32.dll")]public static extern uint GetCurrentThreadId();[DllImport("user32.dll")]public static extern bool AttachThreadInput(uint a,uint b,bool f);[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);[DllImport("user32.dll")]public static extern void keybd_event(byte v,byte s,uint f,UIntPtr e);public delegate bool EW(IntPtr h,IntPtr l);public static IntPtr lv=IntPtr.Zero;static string C(IntPtr h){var s=new StringBuilder(256);GetClassName(h,s,256);return s.ToString();}public static bool Find(){EnumWindows((h,l)=>{if(C(h)!="WorkerW")return true;EnumChildWindows(h,(c,l2)=>{if(C(c)=="SHELLDLL_DefView")EnumChildWindows(c,(k,l3)=>{if(C(k)=="SysListView32")lv=k;return true;},IntPtr.Zero);return true;},IntPtr.Zero);return true;},IntPtr.Zero);return lv!=IntPtr.Zero;}public static bool Focus(){uint p;uint t=GetWindowThreadProcessId(lv,out p);uint m=GetCurrentThreadId();AttachThreadInput(m,t,true);bool ok=SetForegroundWindow(lv);AttachThreadInput(m,t,false);return ok;}public static void Key(byte v){keybd_event(v,0,0,UIntPtr.Zero);keybd_event(v,0,2,UIntPtr.Zero);}}'
if(![S]::Find()){exit}
if(![S]::Focus()){exit}
[S]::Key(0x5D)
Start-Sleep -Milliseconds 500
[S]::Key(0x28); Start-Sleep -Milliseconds 150
[S]::Key(0x27); Start-Sleep -Milliseconds 400
for($i=0;$i -lt ${sub};$i++){ [S]::Key(0x28); Start-Sleep -Milliseconds 120 }
[S]::Key(0x0D)
Start-Sleep -Milliseconds 300`;
  const psFile = path.join(__dirname, '_organize.ps1');
  fs.writeFileSync(psFile, psScript, 'utf8');
  require('child_process').exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psFile}"`, () => { try { fs.unlinkSync(psFile); } catch(e){} });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 600, height: 500, minWidth: 200, minHeight: 200,
    frame: false, transparent: false, alwaysOnTop: true, paintWhenInitiallyHidden: true,
    show: false,
    backgroundColor: '#ffffff',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  });
  mainWindow.loadFile('index.html');
  // 不再自动打开调试面板；如需调试，在 DevTools 里按 F12 或取消下面注释手动打开
  // mainWindow.webContents.openDevTools({ mode: 'bottom' });

  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'cat_0.png')));
  tray.setToolTip('定时开关机');
  refreshTrayMenu();
  tray.on('click', () => { mainWindow.isVisible() ? mainWindow.hide() : showMainWindow(); });
  tray.on('mouse-move', () => showFlyout());
  tray.on('mouse-leave', () => { flyoutSuppressed = false; scheduleHideFlyout(); });
  tray.on('right-click', () => { flyoutSuppressed = true; if (flyoutWindow && flyoutWindow.isVisible()) flyoutWindow.hide(); });

  mainWindow.on('close', (e) => {
    if (!forceQuit) { e.preventDefault(); mainWindow.hide(); }
  });

  mainWindow.webContents.once('did-finish-load', () => {
    setTimeout(() => {
      mainWindow.hide();
      const cfg = loadConfig();
      if (cfg.autoOrganize) {
        try {
          if (cfg.moveFiles) {
            const entries = fs.readdirSync(desktopPath, { withFileTypes: true });
            const folders = [], shortcuts = [], files = [];
            entries.forEach(e => {
              if (e.name.startsWith('.') || e.name === 'desktop.ini') return;
              if (['软件','文件夹','文件'].includes(e.name)) return;
              const full = path.join(desktopPath, e.name);
              const stat = fs.statSync(full);
              if (e.isDirectory()) folders.push(e.name);
              else if (e.name.toLowerCase().endsWith('.lnk')) shortcuts.push(e.name);
              else files.push(e.name);
            });
            const moveInto = (arr, sub) => {
              if (!arr.length) return;
              const dir = path.join(desktopPath, sub);
              if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive:true });
              arr.forEach(name => {
                const src = path.join(desktopPath, name);
                const dst = path.join(dir, name);
                try { if (!fs.existsSync(dst)) fs.renameSync(src, dst); } catch(e) {}
              });
            };
            moveInto(shortcuts, '软件'); moveInto(folders, '文件夹'); moveInto(files, '文件');
          }
          arrangeDesktop(cfg.arrangeMode);
        } catch(e) {}
      }
    }, 300);
  });
}

// 开机自启动：托盘右键菜单使用（对应 IPC 的 autostart:get / autostart:set）
const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
function isAutostartOn() {
  try { return execSync('reg query "' + RUN_KEY + '" /v OnOffScheduler').toString().includes('OnOffScheduler'); }
  catch(e) { return false; }
}
function setAutostart(enable) {
  try {
    if (enable) execSync('reg add "' + RUN_KEY + '" /v OnOffScheduler /t REG_SZ /d "\\"' + process.execPath + '\\"" /f');
    else execSync('reg delete "' + RUN_KEY + '" /v OnOffScheduler /f 2>nul');
  } catch(e) {}
}

function refreshTrayMenu() {
  const cfg = loadConfig();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示窗口', click: () => showMainWindow() },
    { type: 'checkbox', label: '开机自动启动', checked: isAutostartOn(), click: (it) => { setAutostart(it.checked); } },
    { label: '图标常驻任务栏', click: () => exec('start ms-settings:taskbar') },
    { type: 'separator' },
    { label: '退出', click: () => { forceQuit = true; app.quit(); } }
  ]));
}

function showMainWindow(center) {
  if (!mainWindow) return;
  if (center) {
    const displays = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const { width, height } = displays.workAreaSize;
    mainWindow.setPosition(Math.round((width - 600) / 2), Math.round((height - 500) / 2));
  }
  mainWindow.setAlwaysOnTop(true);
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('pin:changed', true);
  // 强制重新计算布局
  const [w, h] = mainWindow.getSize();
  mainWindow.setSize(w + 1, h);
  setTimeout(() => mainWindow.setSize(w, h), 50);
}

// 截图
function doScreenshot() {
  mainWindow.hide();
  setTimeout(async () => {
    try {
      const disp = screen.getPrimaryDisplay();
      const scale = disp.scaleFactor || 1;
      const sources = await desktopCapturer.getSources({ 
        types: ['screen'], 
        thumbnailSize: { width: Math.round(disp.size.width * scale), height: Math.round(disp.size.height * scale) }
      });
      openShotWindow(sources[0].thumbnail.toDataURL());
    } catch(e) {
      console.error('截图失败:', e);
    }
  }, 300);
}

function openShotWindow(imageDataUrl) {
  if (shotWindow) { shotWindow.focus(); return; }
  shotWindow = new BrowserWindow({
    fullscreen: true, frame: false, transparent: true, alwaysOnTop: true, resizable: false, skipTaskbar: true,
    webPreferences: { preload: path.join(__dirname, 'shot-preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  shotWindow.setMenuBarVisibility(false);
  shotWindow.loadFile('shot.html');
  if (imageDataUrl) shotWindow.webContents.once('did-finish-load', () => shotWindow.webContents.send('shot-image', imageDataUrl));
  shotWindow.on('closed', () => { shotWindow = null; });
}

// 休眠
function doHibernate() { exec('shutdown /h'); }

// 注册快捷键
function registerShortcuts() {
  const cfg = loadConfig();
  globalShortcut.unregisterAll();
  if (cfg.shotKey && !cfg.shotDisabled) { globalShortcut.register(cfg.shotKey, () => doScreenshot()); }
  if (!cfg.hibDisabled) { globalShortcut.register(cfg.hibKey || 'Alt+W', () => doHibernate()); }
  if (!cfg.shutdownDisabled) { globalShortcut.register(cfg.shutdownKey || 'Alt+S', () => exec('shutdown /s /t 0')); }
  if (!cfg.openDisabled) { globalShortcut.register(cfg.openKey || 'Alt+E', () => showMainWindow(true)); }
  if (!cfg.hideDisabled) { globalShortcut.register(cfg.hideKey || 'Alt+2', () => mainWindow.hide()); }
  if (!cfg.clipDisabled) { globalShortcut.register(cfg.clipKey || 'Alt+1', () => openClipPicker()); }
  if (!cfg.cmdDisabled) { globalShortcut.register(cfg.cmdKey || 'Alt+R', () => exec('start cmd')); }
  if (!cfg.launchAllDisabled) { globalShortcut.register(cfg.launchAllKey || 'Alt+A', () => { const l = loadLaunch(); l.forEach(item => { try { exec(`"${item.path}"`); } catch(e){} }); }); }
  if (!cfg.desktopDisabled) { globalShortcut.register(cfg.desktopKey || 'Alt+I', () => { try { require('child_process').exec('powershell -NoProfile -Command "(New-Object -ComObject Shell.Application).MinimizeAll()"'); } catch(e){} }); }
}

// 剪贴板浮层
function openClipPicker() {
  if (clipPickerWindow) return;
  const cursor = screen.getCursorScreenPoint();
  clipPickerWindow = new BrowserWindow({
    width: 360, height: 300, frame: false, transparent: true, backgroundColor: '#00000000', alwaysOnTop: true,
    resizable: false, skipTaskbar: true, x: cursor.x - 180, y: cursor.y - 150,
    focusable: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'clip-preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  clipPickerWindow.loadFile('clip.html');
  clipPickerWindow.once('ready-to-show', () => {
    clipPickerWindow.showInactive();
    clipPickerWindow.focusOnWebView();
    setTimeout(() => {
      if (clipPickerWindow && !clipPickerWindow.isDestroyed()) {
        clipPickerWindow.focus();
        clipPickerWindow.moveTop();
      }
    }, 50);
  });
  clipPickerWindow.on('closed', () => { clipPickerWindow = null; });
}

// ============ 会跑的猫：采样 + 动画 + 悬停浮窗 ============
// 对齐 RustCat：每 1s 采样 CPU(5 点平均)+内存，帧间隔=500/max(1,负载/5)，
// 负载越高切换越快；悬停托盘弹出 CPU/内存/磁盘浮窗。
let flyoutWindow = null;
let catFrame = 0;
let animTimer = null;
let hideFlyoutTimer = null;
let flyoutSuppressed = false;
let appTheme = (loadConfig().theme === 'dark') ? 'dark' : '';
let lastSnapshot = { cpu: 0, mem: 0, disk: 0 };

function cpuTimes() {
  const c = os.cpus();
  let total = 0, idle = 0;
  c.forEach(t => { total += t.times.user + t.times.nice + t.times.sys + t.times.idle + t.times.irq; idle += t.times.idle; });
  return { total, idle };
}
let prevCpu = cpuTimes();
function sampleCpuPct() {
  const cur = cpuTimes();
  const dt = cur.total - prevCpu.total, di = cur.idle - prevCpu.idle;
  prevCpu = cur;
  if (dt <= 0) return 0;
  return Math.max(0, Math.min(100, (1 - di / dt) * 100));
}
function memPct() { return os.totalmem() ? (1 - os.freemem() / os.totalmem()) * 100 : 0; }
function diskPct() {
  try {
    const s = fs.statfsSync(app.getPath('home'));
    if (s && s.blocks) return Math.max(0, Math.min(100, (1 - s.bavail / s.blocks) * 100));
  } catch(e) {}
  return 0;
}
function currentFramePath() {
  return path.join(__dirname, appTheme === 'dark' ? `cat_white_${catFrame}.png` : `cat_${catFrame}.png`);
}
function nextCatFrame() {
  catFrame = (catFrame + 1) % 5;
  try { tray.setImage(nativeImage.createFromPath(currentFramePath())); } catch(e) {}
}
function scheduleAnim(speedFactor) {
  if (animTimer) clearInterval(animTimer);
  animTimer = setInterval(nextCatFrame, Math.max(40, Math.round(600 / speedFactor)));
}
function pushSnapshot() {
  if (flyoutWindow && !flyoutWindow.isDestroyed() && flyoutWindow.isVisible()) {
    flyoutWindow.webContents.send('snapshot', lastSnapshot);
  }
}
function showFlyout() {
  if (flyoutSuppressed) return;
  if (!flyoutWindow || flyoutWindow.isDestroyed()) {
    flyoutWindow = new BrowserWindow({
      width: 210, height: 128, frame: false, transparent: true, resizable: false,
      alwaysOnTop: true, skipTaskbar: true, focusable: false, show: false,
      webPreferences: { preload: path.join(__dirname, 'flyout-preload.js'), contextIsolation: true, nodeIntegration: false }
    });
    flyoutWindow.loadFile('flyout.html');
    flyoutWindow.on('closed', () => { flyoutWindow = null; });
  }
  if (hideFlyoutTimer) { clearTimeout(hideFlyoutTimer); hideFlyoutTimer = null; }
  const tb = tray.getBounds();
  const wa = screen.getDisplayMatching(tb).workArea; // {x,y,width,height}
  const FW = 210, FH = 128;
  let x = Math.round(tb.x + tb.width / 2 - FW / 2);
  x = Math.max(wa.x + 4, Math.min(x, wa.x + wa.width - FW - 4));
  let y = tb.y - FH - 8;
  if (y < wa.y) y = tb.y + tb.height + 8;
  const maxY = wa.y + wa.height - FH - 4;
  if (y > maxY) y = maxY;
  if (y < wa.y + 4) y = wa.y + 4;
  if (!Number.isFinite(x) || !Number.isFinite(y)) { x = wa.x; y = wa.y; }
  flyoutWindow.setPosition(x, y);
  flyoutWindow.setAlwaysOnTop(true, 'pop-up-menu');
  if (!flyoutWindow.isVisible()) flyoutWindow.showInactive();
  pushSnapshot();
}
function scheduleHideFlyout() {
  if (hideFlyoutTimer) clearTimeout(hideFlyoutTimer);
  hideFlyoutTimer = setTimeout(() => { if (flyoutWindow && flyoutWindow.isVisible()) flyoutWindow.hide(); }, 250);
}
function startCatRunner() {
  prevCpu = cpuTimes();
  const win = [];
  setInterval(() => {
    const cfg = loadConfig();
    const cpu = sampleCpuPct();
    win.push(cpu); if (win.length > 5) win.shift();
    const cpuAvg = win.reduce((a,b)=>a+b,0) / win.length;
    const mem = memPct();
    const disk = diskPct();
    lastSnapshot = { cpu: Math.round(cpuAvg), mem: Math.round(mem), disk: Math.round(disk) };
    const cands = [];
    if (cfg.catUseCpu  !== false) cands.push(cpuAvg);
    if (cfg.catUseMem  !== false) cands.push(mem);
    if (cfg.catUseDisk !== false) cands.push(disk);
    const load = cands.length ? Math.max(...cands) : 0;
    const scale = Number(cfg.catSpeedScale) > 0 ? Number(cfg.catSpeedScale) : 1;
    scheduleAnim((1 + load / 8) * scale);
    pushSnapshot();
  }, 1000);
  try { tray.setImage(nativeImage.createFromPath(currentFramePath())); } catch(e) {}
}

// ============ IPC ============
ipcMain.handle('config:get', () => loadConfig());
ipcMain.handle('config:set', (_, cfg) => { saveConfig(cfg); return {ok:true}; });
ipcMain.handle('theme:set', (_, t) => {
  appTheme = (t === 'dark') ? 'dark' : '';
  const cfg = loadConfig(); cfg.theme = appTheme; saveConfig(cfg);
  try { tray.setImage(nativeImage.createFromPath(currentFramePath())); } catch(e) {}
  return {ok:true};
});
ipcMain.handle('shortcuts:refresh', () => { registerShortcuts(); return {ok:true}; });
ipcMain.handle('shortcuts:suspend', () => { globalShortcut.unregisterAll(); return {ok:true}; });
ipcMain.handle('window:minimize', () => mainWindow.minimize());
ipcMain.handle('window:close', () => mainWindow.hide());
ipcMain.handle('window:toggleTop', () => { const v = !mainWindow.isAlwaysOnTop(); mainWindow.setAlwaysOnTop(v); mainWindow.webContents.send('pin:changed', v); return {ok:true, onTop:v}; });
ipcMain.handle('capture:shot', () => { doScreenshot(); return {ok:true}; });
ipcMain.handle('shutdown:now', () => exec('shutdown /s /t 0'));
ipcMain.handle('restart:now', () => exec('shutdown /r /t 0'));
ipcMain.handle('shutdown:abort', () => exec('shutdown /a'));
ipcMain.handle('hibernate:now', () => doHibernate());
ipcMain.handle('wake:schedule', async (_, { date, time }) => {
  const [y, m, d] = date.split('-');
  const [hh, mm] = time.split(':');
  try { execSync(`schtasks /delete /tn "OnOffScheduler_Wake" /f`); } catch(e) {}
  execSync(`schtasks /create /tn "OnOffScheduler_Wake" /tr "powercfg /wakeorresume" /sc once /st ${hh}:${mm} /sd ${m}/${d}/${y} /f`);
  return {ok:true};
});
ipcMain.handle('wake:cancel', () => { try { execSync(`schtasks /delete /tn "OnOffScheduler_Wake" /f`); return {ok:true}; } catch(e) { return {ok:false, error:e.message}; } });
ipcMain.handle('custom:runNow', (_, cmd) => { try { exec(cmd); return {ok:true}; } catch(e) { return {ok:false, error:e.message}; } });
ipcMain.handle('autostart:get', () => {
  const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  try {
    const out = execSync(`reg query "${key}" /v OnOffScheduler`).toString();
    return {ok:true, enabled: out.includes('OnOffScheduler')};
  } catch(e) { return {ok:true, enabled:false}; }
});
ipcMain.handle('autostart:set', (_, enable) => {
  const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  const exe = process.execPath;
  if (enable) execSync(`reg add "${key}" /v OnOffScheduler /t REG_SZ /d "\\"${exe}\\"" /f`);
  else execSync(`reg delete "${key}" /v OnOffScheduler /f 2>nul`);
  return {ok:true};
});
ipcMain.handle('launch:remove', (_, name) => { const l = loadLaunch(); const i = l.findIndex(x => x.name === name); if (i>=0) l.splice(i,1); saveLaunch(l); return {ok:true, list:l}; });
ipcMain.handle('launch:runAll', () => { const l = loadLaunch(); l.forEach(item => { try { exec(`"${item.path}"`); } catch(e){} }); return {ok:true}; });
ipcMain.handle('clip:clear', () => { saveClip([]); return {ok:true, list:[]}; });
ipcMain.handle('clip:copy', (_, text) => { clipboard.writeText(text); return {ok:true}; });
ipcMain.handle('custom:schedule', async (_, { name, cmd, date, time }) => {
  try { execSync(`schtasks /delete /tn "OnOffScheduler_Custom_${name}" /f`); } catch(e) {}
  const [y, m, d] = date.split('-');
  const [hh, mm] = time.split(':');
  execSync(`schtasks /create /tn "OnOffScheduler_Custom_${name}" /tr "${cmd}" /sc once /st ${hh}:${mm} /sd ${m}/${d}/${y} /f`);
  return {ok:true};
});
ipcMain.handle('video:downloadOnline', (_, {url, dir}) => {
  return new Promise((resolve) => {
    const ytdlp = 'C:\\Users\\801\\Desktop\\app\\bin\\yt-dlp.exe';
    const ffmpeg = 'C:\\Users\\801\\Desktop\\app\\bin\\ffmpeg.exe';
    const outDir = dir || path.join(app.getPath('home'), 'Desktop');
    const args = ['-f', 'bestvideo[vcodec^=avc1]+bestaudio/best', '--merge-output-format', 'mp4', '--ffmpeg-location', path.dirname(ffmpeg), '-o', path.join(outDir, '%(title)s.%(ext)s'), url];
    const p = spawn(ytdlp, args, { cwd: outDir });
    let out = '';
    p.stdout.on('data', d => out += d.toString());
    p.stderr.on('data', d => out += d.toString());
    p.on('close', code => resolve({ok: code===0, output: out}));
  });
});

ipcMain.handle('shutdown:schedule', async (_, { date, time, once }) => {
  const [y, m, d] = date.split('-');
  const [hh, mm] = time.split(':');
  const sd = `${m}/${d}/${y}`;
  try { execSync(`schtasks /delete /tn "OnOffScheduler_Shutdown" /f`); } catch(e) {}
  const sc = once ? 'once' : 'daily';
  execSync(`schtasks /create /tn "OnOffScheduler_Shutdown" /tr "shutdown /s /t 0" /sc ${sc} /st ${hh}:${mm} /sd ${sd} /f`);
  return {ok:true};
});

ipcMain.handle('shutdown:cancel', () => {
  try { execSync(`schtasks /delete /tn "OnOffScheduler_Shutdown" /f`); return {ok:true}; }
  catch(e) { return {ok:false, error:e.message}; }
});

ipcMain.handle('tasks:list', () => {
  return new Promise((resolve) => {
    const psScript = `
$tasks = Get-ScheduledTask | Where-Object { $_.TaskName -match 'OnOff|shutdown|reboot|restart|suspend|sleep|hibernate' }
$results = @()
foreach ($task in $tasks) {
  $cmdLine = ''
  try { $cmdLine = ($task.Actions | Select-Object -First 1).Execute } catch {}
  $op = 'other'
  if ($cmdLine -match 'shutdown.*/s|poweroff') { $op = 'shutdown' }
  elseif ($cmdLine -match 'shutdown.*/r|reboot') { $op = 'reboot' }
  elseif ($cmdLine -match 'shutdown.*/l') { $op = 'logout' }
  elseif ($cmdLine -match 'shutdown.*/h') { $op = 'hibernate' }
  $nextRun = ''
  try { $info = Get-ScheduledTaskInfo -TaskName $task.TaskName; if ($info.NextRunTime -and $info.NextRunTime -gt (Get-Date)) { $nextRun = $info.NextRunTime.ToString('yyyy-MM-dd HH:mm') } } catch {}
  $results += [PSCustomObject]@{ Name=$task.TaskName; NextRun=$nextRun; State=$task.State.ToString(); Op=$op; Cmd=$cmdLine.Trim() }
}
$results | ConvertTo-Json
`;
    const psFile = path.join(__dirname, '_tmp.ps1');
    fs.writeFileSync(psFile, psScript, 'utf8');
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psFile}"`, { maxBuffer: 1024*1024*10 }, (err, stdout) => {
      try { fs.unlinkSync(psFile); } catch(e) {}
      if (err || !stdout.trim()) return resolve([]);
      try {
        const data = JSON.parse(stdout);
        const arr = Array.isArray(data) ? data : [data];
        resolve(arr.map(t => ({ name: t.Name, nextRun: t.NextRun||'', status: t.State||'', op: t.Op||'', cmd: t.Cmd||'' })));
      } catch(e) { resolve([]); }
    });
  });
});

ipcMain.handle('task:delete', (_, name) => {
  try { execSync(`schtasks /delete /tn "${name}" /f`); return {ok:true}; }
  catch(e) { return {ok:false, error:e.message}; }
});

ipcMain.handle('custom:run', (_, cmd) => {
  try { exec(cmd); return {ok:true}; }
  catch(e) { return {ok:false, error:e.message}; }
});

ipcMain.handle('launch:list', () => loadLaunch());
ipcMain.handle('launch:add', (_, item) => { const l = loadLaunch(); l.push(item); saveLaunch(l); return {ok:true, list:l}; });
ipcMain.handle('launch:del', (_, i) => { const l = loadLaunch(); l.splice(i,1); saveLaunch(l); return {ok:true, list:l}; });
ipcMain.handle('launch:run', (_, p) => { try { exec(`"${p}"`); return {ok:true}; } catch(e) { return {ok:false, error:e.message}; } });

ipcMain.handle('video:download', (_, {url, dir}) => {
  return new Promise((resolve) => {
    const ytdlp = 'C:\\Users\\801\\Desktop\\app\\bin\\yt-dlp.exe';
    const ffmpeg = 'C:\\Users\\801\\Desktop\\app\\bin\\ffmpeg.exe';
    const outDir = dir || path.join(app.getPath('home'), 'Desktop');
    const args = ['-f', 'bestvideo[vcodec^=avc1]+bestaudio/best', '--merge-output-format', 'mp4', '--ffmpeg-location', path.dirname(ffmpeg), '-o', path.join(outDir, '%(title)s.%(ext)s'), url];
    const p = spawn(ytdlp, args, { cwd: outDir });
    let out = '';
    p.stdout.on('data', d => out += d.toString());
    p.stderr.on('data', d => out += d.toString());
    p.on('close', code => resolve({ok: code===0, output: out}));
  });
});

ipcMain.handle('clip:list', () => loadClip());
ipcMain.handle('clip:add', (_, text) => {
  let l = loadClip();
  l = l.filter(x => x !== text);
  l.unshift(text);
  if (l.length > 50) l = l.slice(0, 50);
  saveClip(l);
  return {ok:true, list:l};
});
ipcMain.handle('clip:del', (_, i) => { const l = loadClip(); l.splice(i,1); saveClip(l); return {ok:true, list:l}; });
ipcMain.handle('clip:paste', (_, text) => {
  if (text) clipboard.writeText(text);
  if (clipPickerWindow) { try { clipPickerWindow.close(); } catch(e){} }
  // 用 wscript 快速发送 Ctrl+V（启动远快于 powershell）
  try {
    const vbsPath = path.join(app.getPath('userData'), '_paste.vbs');
    if (!fs.existsSync(vbsPath)) {
      fs.writeFileSync(vbsPath, 'Set sh = CreateObject("WScript.Shell")\nWScript.Sleep 30\nsh.SendKeys "^v"\n');
    }
    exec('wscript.exe "' + vbsPath + '"');
  } catch(e) {}
  return {ok:true};
});

ipcMain.handle('quick:list', () => loadQuick());
ipcMain.handle('quick:add', (_, t) => { const l = loadQuick(); l.push(t); saveQuick(l); return {ok:true, list:l}; });
ipcMain.handle('quick:del', (_, i) => { const l = loadQuick(); l.splice(i,1); saveQuick(l); return {ok:true, list:l}; });

ipcMain.handle('notes:list', () => loadNotes());
ipcMain.handle('notes:add', (_, item) => { const l = loadNotes(); l.unshift(item); saveNotes(l); return {ok:true, list:l}; });
ipcMain.handle('notes:del', (_, i) => { const l = loadNotes(); l.splice(i,1); saveNotes(l); return {ok:true, list:l}; });
ipcMain.handle('notes:update', (_, i, item) => { const l = loadNotes(); if (i>=0 && i<l.length) l[i] = Object.assign({}, l[i], item); saveNotes(l); return {ok:true, list:l}; });
ipcMain.handle('notes:export', async () => {
  const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath: 'notes.json', filters: [{ name: 'JSON 文件', extensions: ['json'] }] });
  if (canceled || !filePath) return { ok: false };
  fs.writeFileSync(filePath, JSON.stringify(loadNotes(), null, 2), 'utf8');
  return { ok: true, path: filePath };
});
ipcMain.handle('notes:pickImport', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'JSON 文件', extensions: ['json'] }] });
  if (canceled || !filePaths || !filePaths[0]) return { ok: false };
  const arr = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
  if (!Array.isArray(arr)) throw new Error('文件不是记录数组');
  return { ok: true, list: arr, existing: loadNotes() };
});
ipcMain.handle('notes:append', (_, arr) => {
  if (!Array.isArray(arr)) return { ok: false };
  const exist = loadNotes();
  const keyOf = (n) => [n.amount, n.date, n.desc].join('||');
  const existKeys = new Set(exist.map(keyOf));
  let added = 0;
  for (const n of arr) {
    if (!existKeys.has(keyOf(n))) { exist.unshift(n); existKeys.add(keyOf(n)); added++; }
  }
  saveNotes(exist);
  return { ok: true, added, list: exist };
});

ipcMain.handle('organize:run', (_, {arrangeMode, moveFiles, dirShortcut, dirFolder, dirFile}) => {
  try {
    let moved = {folders:0, shortcuts:0, files:0};
    if (moveFiles) {
      const entries = fs.readdirSync(desktopPath, { withFileTypes: true });
      const folders = [], shortcuts = [], files = [];
      entries.forEach(e => {
        if (e.name.startsWith('.') || e.name === 'desktop.ini') return;
        if ([dirShortcut, dirFolder, dirFile].filter(Boolean).includes(e.name)) return;
        if (e.isDirectory()) folders.push(e.name);
        else if (e.name.toLowerCase().endsWith('.lnk')) shortcuts.push(e.name);
        else files.push(e.name);
      });
      const moveInto = (arr, sub) => {
        if (!arr.length || !sub) return;
        const dir = path.join(desktopPath, sub);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive:true });
        arr.forEach(name => {
          const src = path.join(desktopPath, name);
          const dst = path.join(dir, name);
          try { if (!fs.existsSync(dst)) fs.renameSync(src, dst); } catch(e) {}
        });
      };
      if (dirShortcut) { moveInto(shortcuts, dirShortcut); moved.shortcuts = shortcuts.length; }
      if (dirFolder) { moveInto(folders, dirFolder); moved.folders = folders.length; }
      if (dirFile) { moveInto(files, dirFile); moved.files = files.length; }
    }
    // 按所选方式排序桌面图标（让桌面获焦调排序菜单）
    arrangeDesktop(arrangeMode);
    return { ok:true, moved };
  } catch(e) { return { ok:false, error:e.message }; }
});

ipcMain.handle('shot:save', (_, dataUrl) => {
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  const file = path.join(desktopPath, `截图_${Date.now()}.png`);
  fs.writeFileSync(file, Buffer.from(base64, 'base64'));
  clipboard.writeImage(nativeImage.createFromDataURL(dataUrl));
  return {ok:true, file};
});
ipcMain.handle('shot:cancel', () => { if (shotWindow) shotWindow.close(); return {ok:true}; });

app.whenReady().then(() => {
  createWindow();
  registerShortcuts();
  startCatRunner();
  // 监听剪贴板变化
  setInterval(() => {
    const text = clipboard.readText();
    if (text && text !== lastClipText) {
      lastClipText = text;
      let l = loadClip();
      l = l.filter(x => x !== text);
      l.unshift(text);
      if (l.length > 50) l = l.slice(0, 50);
      saveClip(l);
    }
  }, 1000);
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('will-quit', () => { globalShortcut.unregisterAll(); });
