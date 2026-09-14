const { app, BrowserWindow, protocol, Menu, Tray, globalShortcut, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const APP_ID = 'com.quicknote.pro';
const HOTKEY = 'Ctrl+Alt+N';
const DEFAULT_SRC = 'C:/Users/Administrator/Downloads/快速记录pro.html';

// app:// 注册为安全上下文 —— 这是根治 file:// 下剪贴板权限弹窗的关键
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, bypassCSP: true } }
]);

if (process.platform === 'win32') app.setAppUserModelId(APP_ID);

// 调试端口：设 QUICKNOTE_DEBUG_PORT=9333 后可用 CDP 连入排查（不设则完全不开启）
if (process.env.QUICKNOTE_DEBUG_PORT) {
  try { app.commandLine.appendSwitch('remote-debugging-port', String(process.env.QUICKNOTE_DEBUG_PORT)); } catch (e) {}
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); return; }

let win = null;
let tray = null;
let realQuit = false;
let balloonShown = false;

// ── HTML 来源：打包后优先 resources/assets（asar 外，可直接覆盖更新），否则直连真源 ──
function resolveHtml() {
  const cands = [];
  if (process.env.QUICKNOTE_SRC) cands.push(process.env.QUICKNOTE_SRC);
  if (app.isPackaged) {
    cands.push(path.join(process.resourcesPath, 'assets', 'index.html'));
  } else {
    cands.push(DEFAULT_SRC);
    cands.push(path.join(__dirname, 'assets', 'index.html'));
  }
  cands.push(path.join(process.resourcesPath || '', 'assets', 'index.html'));
  cands.push(path.join(__dirname, 'assets', 'index.html'));
  cands.push(DEFAULT_SRC);
  for (const c of cands) {
    try { if (c && fs.existsSync(c)) return c; } catch (e) {}
  }
  return null;
}

const HTML_FILE = resolveHtml();
const HTML_DIR = HTML_FILE ? path.dirname(HTML_FILE) : __dirname;

function resolveIcon() {
  const cands = [
    path.join(process.resourcesPath || '', 'assets', 'icon.ico'),
    path.join(__dirname, 'assets', 'icon.ico')
  ];
  for (const c of cands) { try { if (fs.existsSync(c)) return c; } catch (e) {} }
  return null;
}
const ICON = resolveIcon();

// ── 窗口尺寸记忆 ──
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');
function loadState() {
  try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch (e) { return {}; }
}
function saveState() {
  if (!win || win.isDestroyed()) return;
  try {
    const b = win.getBounds();
    fs.writeFileSync(stateFile(), JSON.stringify({ ...b, maximized: win.isMaximized() }));
  } catch (e) {}
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf'
};

function serve() {
  protocol.handle('app', async (req) => {
    try {
      const u = new URL(req.url);
      let rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
      if (!rel) rel = 'index.html';
      // 入口直接映射到真源文件（真源文件名未必叫 index.html），其余走静态目录
      const target = rel === 'index.html' ? HTML_FILE : path.join(HTML_DIR, rel);
      const resolved = path.resolve(target);
      const base = path.resolve(HTML_DIR).toLowerCase();
      if (resolved.toLowerCase().indexOf(base) !== 0) return new Response('forbidden', { status: 403 });
      if (!fs.existsSync(resolved)) return new Response('not found', { status: 404 });
      const mime = MIME[path.extname(resolved).toLowerCase()] || 'application/octet-stream';
      return new Response(fs.readFileSync(resolved), { headers: { 'Content-Type': mime } });
    } catch (e) {
      return new Response('error', { status: 500 });
    }
  });
}

function createWindow() {
  const st = loadState();
  win = new BrowserWindow({
    x: typeof st.x === 'number' ? st.x : undefined,
    y: typeof st.y === 'number' ? st.y : undefined,
    width: st.width || 1000,
    height: st.height || 720,
    minWidth: 360,
    minHeight: 420,
    icon: ICON || undefined,
    title: '快速记录 Pro',
    autoHideMenuBar: true,
    backgroundColor: '#20232a',
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, spellcheck: false, backgroundThrottling: false }
  });
  if (st.maximized) win.maximize();

  win.loadURL('app://local/index.html').catch(() => {
    if (HTML_FILE) win.loadFile(HTML_FILE);
  });

  win.once('ready-to-show', () => { win.show(); win.focus(); });

  win.on('close', (e) => {
    if (realQuit) { saveState(); return; }
    e.preventDefault();
    win.hide();
    if (tray && !balloonShown) {
      balloonShown = true;
      tray.displayBalloon({ title: '快速记录 Pro', content: '已隐藏到系统托盘，按 ' + HOTKEY + ' 或点托盘图标唤起' });
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url && /^https?:/.test(url)) { shell.openExternal(url); }
    return { action: 'deny' };
  });

  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const k = (input.key || '').toLowerCase();
    if (k === 'f12') { win.webContents.toggleDevTools(); e.preventDefault(); }
    else if (k === 'f5' || (input.control && k === 'r')) { win.webContents.reload(); e.preventDefault(); }
  });
}

function toggleWindow() {
  if (!win || win.isDestroyed()) return;
  if (win.isVisible() && win.isFocused()) { win.hide(); }
  else { win.show(); win.focus(); }
}

function firstRunHint() {
  // 开发模式与打包后各用一份标记，避免开发时把「首次运行」提示提前消耗掉
  const flag = path.join(app.getPath('userData'), app.isPackaged ? '.initialized' : '.initialized-dev');
  if (fs.existsSync(flag)) return;
  try { fs.writeFileSync(flag, '1'); } catch (e) {}
  setTimeout(() => {
    if (tray) {
      tray.displayBalloon({
        title: '快速记录 Pro',
        content: '数据存于 %APPDATA%\\' + app.getName() + '。首次使用请在浏览器导出备份 JSON，再到「更多 → 恢复」导入。'
      });
    }
  }, 3000);
}

// ── 开机自启：绿色目录被挪位置后自动修正注册表路径（否则自启会指向旧路径失效） ──
const autoFile = () => path.join(app.getPath('userData'), '.autostart.json');
function readAuto() { try { return JSON.parse(fs.readFileSync(autoFile(), 'utf8')); } catch (e) { return null; } }
function applyAuto(on) {
  try {
    app.setLoginItemSettings({ openAtLogin: !!on, args: [] });
    fs.writeFileSync(autoFile(), JSON.stringify({ on: !!on, path: process.execPath }));
  } catch (e) {}
}
function syncAuto() {
  if (!app.isPackaged) return;
  const pref = readAuto();
  if (!pref) { applyAuto(true); return; }
  if (!pref.on) return;
  const cur = app.getLoginItemSettings();
  if (!cur.openAtLogin || cur.path !== process.execPath) applyAuto(true);
}

function createTray() {
  if (!ICON) return;
  tray = new Tray(ICON);
  tray.setToolTip('快速记录 Pro（' + HOTKEY + ' 唤起）');
  const ctx = Menu.buildFromTemplate([
    { label: '显示 / 隐藏', click: () => toggleWindow() },
    { type: 'separator' },
    {
      label: '开机自启', type: 'checkbox', checked: !!app.getLoginItemSettings().openAtLogin,
      click: (item) => applyAuto(item.checked)
    },
    { type: 'separator' },
    { label: '打开数据目录', click: () => shell.openPath(app.getPath('userData')) },
    { label: '退出', click: () => { realQuit = true; app.quit(); } }
  ]);
  tray.setContextMenu(ctx);
  tray.on('click', () => toggleWindow());
  tray.on('double-click', () => toggleWindow());
}

app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });

app.whenReady().then(() => {
  if (!HTML_FILE) {
    dialog.showErrorBox('未找到页面文件', '请把 快速记录pro.html 放到 assets/index.html，或设置环境变量 QUICKNOTE_SRC 指向它。');
    app.quit();
    return;
  }
  serve();
  createWindow();
  createTray();
  firstRunHint();

  const ok = globalShortcut.register(HOTKEY, () => toggleWindow());
  if (!ok) console.warn('[quicknote] 全局热键注册失败（可能被占用）:', HOTKEY);

  // 仅打包后的正式版会写注册表（开发模式会把 electron.exe 写进去，必须跳过）
  syncAuto();
});

app.on('window-all-closed', (e) => { e.preventDefault(); });
app.on('before-quit', () => { realQuit = true; saveState(); });
app.on('will-quit', () => { globalShortcut.unregisterAll(); });
