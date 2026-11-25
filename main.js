// Jarvis App: janela com um dock de botoes + a pagina do seu Jarvis.
// Electron 32 de proposito: e a ultima versao que roda no macOS Catalina (10.15).
const { app, BrowserWindow, WebContentsView, Menu, ipcMain, shell, dialog, screen } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const dockW = () => (cfg && cfg.dock === true ? 76 : 0); // dock so se cfg.dock=true; padrao: pagina inteira, igual a web
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
  const D = dockW(); view.setBounds({ x: D, y: 0, width: Math.max(0, w - D), height: h });
}

// Pagina local: <vault>/Horizonte/parede.html (a mesma do navegador, roda sem internet)
function localPage() { if (!cfg || !cfg.vault) return null; const p = path.join(cfg.vault, 'Horizonte', 'parede.html'); return fs.existsSync(p) ? p : null; }
// ---- favoritos do Chrome (lidos do disco, so no seu computador) ----
function chromeBookmarks() {
  const home = app.getPath('home');
  const files = process.platform === 'darwin' ? [path.join(home, 'Library/Application Support/Google/Chrome/Default/Bookmarks')]
    : process.platform === 'win32' ? [path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/User Data/Default/Bookmarks')]
    : [path.join(home, '.config/google-chrome/Default/Bookmarks')];
  const out = [];
  const walkB = n => { if (!n || out.length >= 400) return; if (n.type === 'url' && isHttp(n.url)) out.push({ label: String(n.name || n.url).slice(0, 60), url: n.url }); (n.children || []).forEach(walkB); };
  for (const f of files) { try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); Object.values(j.roots || {}).forEach(walkB); } catch (e) {} }
  return out;
}
function injectShortcuts() {
  if (!view || view.webContents.isDestroyed()) return;
  const list = chromeBookmarks(); if (!list.length) return;
  const code = 'window.__setAtalhos&&window.__setAtalhos(' + JSON.stringify(list) + ')';
  try { view.webContents.mainFrame.framesInSubtree.forEach(f => f.executeJavaScript(code).catch(() => {})); } catch (e) {}
}
function showJarvis() {
  if (view) { win.contentView.removeChildView(view); view = null; }
  view = new WebContentsView({ webPreferences: { partition: 'persist:jarvis', sandbox: true, contextIsolation: true } });
  win.contentView.addChildView(view);
  layout();
  view.webContents.setWindowOpenHandler(({ url }) => { if (isHttp(url)) shell.openExternal(url); return { action: 'deny' }; });
  // mesma pagina da web (mesmo codigo, tudo funciona) quando ha link; senao a copia local do vault
  const lp = localPage();
  view.webContents.on('did-frame-finish-load', () => { [1500, 5000].forEach(t => setTimeout(injectShortcuts, t)); });
  if (cfg.url) view.webContents.loadURL(cfg.url); else if (lp) view.webContents.loadFile(lp);
}

function createWindow() {
  // Modo area de trabalho: janela sem borda do tamanho da tela, nivel normal.
  // Quando voce abre o Chrome ele vem por cima e o Jarvis fica atras, como fundo.
  const d = screen.getPrimaryDisplay().workArea;
  const desk = !cfg || cfg.desktop !== false;
  win = new BrowserWindow(Object.assign({ width: 1280, height: 800, backgroundColor: '#05070b', title: 'Jarvis' },
    desk ? { x: d.x, y: d.y, width: d.width, height: d.height, frame: false, resizable: false, movable: false, hasShadow: false, skipTaskbar: false } : {},
    { webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true } }));
  win.on('resize', layout);
  win.loadFile('shell.html');
  win.webContents.once('did-finish-load', () => { win.webContents.send('dock', dockW() > 0); if (cfg && (cfg.url || localPage())) showJarvis(); else showSetup(); });
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
// Janelinha de perguntas: Chrome em modo app (pequeno), usa o login do seu Chrome
function ask(which) {
  const url = which === 'usage' ? (isHttp(cfg && cfg.usageUrl) ? cfg.usageUrl : 'https://claude.ai/settings/usage') : (isHttp(cfg && cfg.askUrl) ? cfg.askUrl : 'https://claude.ai/new');
  const a = ['--app=' + url, '--window-size=440,720', '--window-position=40,60'];
  if (process.platform === 'darwin') execFile('open', ['-na', 'Google Chrome', '--args', ...a], err => { if (err) shell.openExternal(url); });
  else if (process.platform === 'win32') execFile('cmd', ['/c', 'start', '', 'chrome', ...a], err => { if (err) shell.openExternal(url); });
  else shell.openExternal(url);
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
// ---- notas (vault do Obsidian) lidas direto da pasta, so leitura ----
function walk(root, dir, out) {
  let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const e of ents) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(root, p, out);
    else if (e.name.toLowerCase().endsWith('.md') && out.length < 5000) out.push(path.relative(root, p));
  }
}
const inVault = rel => { if (!cfg || !cfg.vault || typeof rel !== 'string') return null; const root = path.resolve(cfg.vault); const p = path.resolve(root, rel); return p.startsWith(root + path.sep) && p.toLowerCase().endsWith('.md') ? p : null; };
ipcMain.handle('vault-info', () => ({ vault: cfg && cfg.vault ? path.basename(cfg.vault) : '' }));
ipcMain.handle('vault-pick', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'], title: 'Escolha a pasta do vault do Obsidian' });
  if (r.canceled || !r.filePaths[0]) return false;
  cfg = Object.assign(cfg || defaults(), { vault: r.filePaths[0] }); saveCfg(cfg);
  if (localPage()) { showJarvis(); win.webContents.send('setup', false); }
  return true;
});
ipcMain.handle('vault-list', () => { if (!cfg || !cfg.vault) return []; const out = []; walk(cfg.vault, cfg.vault, out); return out.sort(); });
ipcMain.handle('vault-read', (_e, rel) => { const p = inVault(rel); try { return p ? fs.readFileSync(p, 'utf8').slice(0, 200000) : ''; } catch (e) { return ''; } });
const shortcuts = () => (cfg && Array.isArray(cfg.shortcuts) ? cfg.shortcuts : defaults().shortcuts || []).filter(s => s && isHttp(s.url));
ipcMain.handle('shortcuts', () => shortcuts().map(s => ({ label: String(s.label || s.url), host: new URL(s.url).host })));
ipcMain.on('open-shortcut', (_e, i) => { const s = shortcuts()[i]; if (Number.isInteger(i) && s) openUrls([s.url], 'chrome'); });
ipcMain.on('ask', (_e, w) => ask(w === 'usage' ? 'usage' : ''));
ipcMain.on('mode', (_e, notes) => { if (view) view.setVisible(!notes); });
ipcMain.on('menu', (_e, what) => {
  if (what === 'edit') { if (!fs.existsSync(cfgPath())) saveCfg(cfg || defaults()); shell.openPath(cfgPath()); }
  if (what === 'url') showSetup();
  if (what === 'reload' && view) view.webContents.reload();
  if (what === 'full') win.setFullScreen(!win.isFullScreen());
  if (what === 'obsidian') { /* abre o app Obsidian de verdade */ launch({ type: 'app', target: 'Obsidian' }); }
});

app.whenReady().then(() => {
  cfg = loadCfg();
  if (!cfg) cfg = defaults();
  if (!cfg.v || cfg.v < 2) { const d = defaults(); cfg.url = d.url; delete cfg.vault; cfg.v = d.v; saveCfg(cfg); } // v0.8: volta pro link padrao (mesma pagina da web)
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Jarvis', submenu: [
      { label: 'Trocar endereco do Jarvis', click: () => showSetup() },
      { label: 'Editar botoes (abre config.json)', click: () => { if (!fs.existsSync(cfgPath())) saveCfg(cfg); shell.openPath(cfgPath()); } },
      { label: 'Recarregar', accelerator: 'CmdOrCtrl+R', click: () => view && view.webContents.reload() },
      { label: 'Mostrar/esconder dock', click: () => { cfg.dock = !(cfg.dock === true); saveCfg(cfg); win.webContents.send('dock', dockW() > 0); layout(); } },
      { role: 'togglefullscreen' }, { type: 'separator' }, { role: 'quit' } ] },
    { role: 'editMenu' } ]));
  createWindow();
});
app.on('window-all-closed', () => app.quit());
