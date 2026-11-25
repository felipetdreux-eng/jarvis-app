// Jarvis App: janela com um dock de botoes + a pagina do seu Jarvis.
// Electron 32 de proposito: e a ultima versao que roda no macOS Catalina (10.15).
const { app, BrowserWindow, WebContentsView, Menu, ipcMain, shell } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const DOCK = 76; // largura do dock em pixels
let win, view, cfg;
const cfgPath = () => path.join(app.getPath('userData'), 'config.json');

function loadCfg() {
  try { return JSON.parse(fs.readFileSync(cfgPath(), 'utf8')); } catch (e) { return null; }
}
function saveCfg(c) {
  fs.mkdirSync(path.dirname(cfgPath()), { recursive: true });
  fs.writeFileSync(cfgPath(), JSON.stringify(c, null, 2));
}
function defaults() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'config.example.json'), 'utf8'));
}
const isHttp = u => { try { const p = new URL(u).protocol; return p === 'https:' || p === 'http:'; } catch (e) { return false; } };

function layout() {
  if (!win || !view) return;
  const [w, h] = win.getContentSize();
  view.setBounds({ x: DOCK, y: 0, width: Math.max(0, w - DOCK), height: h });
}

function showJarvis() {
  if (view) { win.contentView.removeChildView(view); view = null; }
  view = new WebContentsView({ webPreferences: { partition: 'persist:jarvis', sandbox: true, contextIsolation: true } });
  win.contentView.addChildView(view);
  layout();
  view.webContents.setWindowOpenHandler(({ url }) => { if (isHttp(url)) shell.openExternal(url); return { action: 'deny' }; });
  view.webContents.loadURL(cfg.url);
}

function createWindow() {
  win = new BrowserWindow({ width: 1280, height: 800, backgroundColor: '#05070b', title: 'Jarvis',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true } });
  win.on('resize', layout);
  win.loadFile('shell.html');
  win.webContents.once('did-finish-load', () => { if (cfg && cfg.url) showJarvis(); else showSetup(); });
}
function showSetup() { if (view) { win.contentView.removeChildView(view); view = null; } win.webContents.send('setup', true); }

// ---- lancamento: o site NUNCA manda comando, so o numero do botao ----
function openUrls(urls, browser) {
  const list = (urls || []).filter(isHttp);
  if (!list.length) return;
  if (process.platform === 'darwin') {
    const args = browser === 'default' ? list : ['-a', 'Google Chrome', ...list];
    execFile('open', args, err => { if (err) list.forEach(u => shell.openExternal(u)); });
  } else if (process.platform === 'win32' && browser !== 'default') {
    execFile('cmd', ['/c', 'start', '', 'chrome', ...list], err => { if (err) list.forEach(u => shell.openExternal(u)); });
  } else list.forEach(u => shell.openExternal(u));
}
function launch(item) {
  if (!item) return;
  if (item.type === 'urls') openUrls(item.urls, item.browser);
  else if (item.type === 'app') {
    if (process.platform === 'darwin') execFile('open', ['-a', String(item.target)]);
    else if (process.platform === 'win32') execFile('cmd', ['/c', 'start', '', String(item.target)]);
  } else if (item.type === 'path') shell.openPath(String(item.target));
}

ipcMain.handle('buttons', () => (cfg && cfg.buttons || []).map(b => ({ label: String(b.label || '?'), hint: String(b.hint || '') })));
ipcMain.on('launch', (_e, i) => { const b = cfg && cfg.buttons; if (Number.isInteger(i) && b && b[i]) launch(b[i]); });
ipcMain.on('set-url', (_e, u) => { if (!isHttp(u)) return; cfg = Object.assign(cfg || defaults(), { url: u }); saveCfg(cfg); showJarvis(); win.webContents.send('setup', false); });
ipcMain.on('menu', (_e, what) => {
  if (what === 'edit') { if (!fs.existsSync(cfgPath())) saveCfg(cfg || defaults()); shell.openPath(cfgPath()); }
  if (what === 'url') showSetup();
  if (what === 'reload' && view) view.webContents.reload();
  if (what === 'full') win.setFullScreen(!win.isFullScreen());
});

app.whenReady().then(() => {
  cfg = loadCfg();
  if (!cfg) { cfg = defaults(); cfg.url = ''; }
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Jarvis', submenu: [
      { label: 'Trocar endereco do Jarvis', click: () => showSetup() },
      { label: 'Editar botoes (abre config.json)', click: () => { if (!fs.existsSync(cfgPath())) saveCfg(cfg); shell.openPath(cfgPath()); } },
      { label: 'Recarregar', accelerator: 'CmdOrCtrl+R', click: () => view && view.webContents.reload() },
      { role: 'togglefullscreen' }, { type: 'separator' }, { role: 'quit' } ] },
    { role: 'editMenu' } ]));
  createWindow();
});
app.on('window-all-closed', () => app.quit());
