// Jarvis App: janela com um dock de botoes + a pagina do seu Jarvis.
// Electron 32 de proposito: e a ultima versao que roda no macOS Catalina (10.15).
const { net, app, BrowserWindow, WebContentsView, Menu, ipcMain, shell, dialog, screen, globalShortcut, safeStorage, systemPreferences } = require('electron');
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
  const base = process.platform === 'darwin' ? path.join(home, 'Library/Application Support/Google/Chrome')
    : process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/User Data')
    : path.join(home, '.config/google-chrome');
  let profs = []; try { profs = fs.readdirSync(base).filter(n => n === 'Default' || /^Profile \d+$/.test(n)); } catch (e) {}
  const files = profs.map(n => path.join(base, n, 'Bookmarks'));
  const out = [];
  const walkB = n => { if (!n || out.length >= 400) return; if (n.type === 'url' && isHttp(n.url)) out.push({ label: String(n.name || n.url).slice(0, 60), url: n.url }); (n.children || []).forEach(walkB); };
  for (const f of files) { try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); Object.values(j.roots || {}).forEach(walkB); } catch (e) {} }
  return out;
}
const BTN_JS = `(function(){if(!window.__setAtalhos||document.getElementById('jv-hide'))return;var b=document.createElement('button');b.id='jv-hide';b.textContent='esconder abas';
b.style.cssText='position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:60;padding:8px 16px;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:rgba(10,14,22,.8);color:#e9edf4;font:12px system-ui;cursor:pointer';
var h=false;b.onclick=function(){h=!h;b.textContent=h?'mostrar abas':'esconder abas';console.log(h?'__JARVIS__hide':'__JARVIS__show')};document.body.appendChild(b);
var c=document.createElement('button');c.textContent='conversar com o Jarvis';c.style.cssText=b.style.cssText;c.style.left='calc(50% + 100px)';b.style.left='calc(50% - 100px)';c.onclick=function(){console.log('__JARVIS__chat')};c.id='jv-chat';document.body.appendChild(c)})()`;
let injected = 0;
function injectShortcuts() {
  if (!view || view.webContents.isDestroyed()) return;
  const list = chromeBookmarks();
  const code = '(function(){' + BTN_JS + ';if(window.__setAtalhos){window.__setAtalhos(' + JSON.stringify(list) + ');return 1}return 0})()';
  try { view.webContents.mainFrame.framesInSubtree.forEach(f => f.executeJavaScript(code).then(r => { if (r) injected++; }).catch(() => {})); } catch (e) {}
}
// esconder/mostrar as outras janelas (Jarvis fica na frente so quando voce quer)
function hideOthers() {
  if (process.platform === 'darwin') execFile('osascript', ['-e', 'tell application "System Events" to set visible of (every process whose visible is true and background only is false and name is not "Jarvis" and name is not "Electron") to false']);
  else if (process.platform === 'win32') execFile('powershell', ['-NoProfile', '-Command', '(New-Object -ComObject Shell.Application).MinimizeAll()']);
  if (win) win.show();
}
function showOthers() {
  if (process.platform === 'darwin') execFile('osascript', ['-e', 'tell application "System Events" to set visible of (every process whose background only is false) to true']);
  else if (process.platform === 'win32') execFile('powershell', ['-NoProfile', '-Command', '(New-Object -ComObject Shell.Application).UndoMinimizeALL()']);
}
function showJarvis() {
  if (view) { win.contentView.removeChildView(view); view = null; }
  view = new WebContentsView({ webPreferences: { partition: 'persist:jarvis', sandbox: true, contextIsolation: true } });
  win.contentView.addChildView(view);
  layout();
  view.webContents.setWindowOpenHandler(({ url }) => { if (isHttp(url)) shell.openExternal(url); return { action: 'deny' }; });
  // mesma pagina da web (mesmo codigo, tudo funciona) quando ha link; senao a copia local do vault
  const lp = localPage();
  view.webContents.on('did-frame-finish-load', () => { [1500, 5000, 12000, 25000].forEach(t => setTimeout(() => { if (!injected) injectShortcuts(); }, t)); });
  injected = 0;
  view.webContents.on('console-message', (_e, _l, msg) => { if (msg === '__JARVIS__hide') hideOthers(); else if (msg === '__JARVIS__show') showOthers(); else if (msg === '__JARVIS__chat') openChat(); });
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
// ---- chat do Jarvis (cerebro gratis: Gemini). A chave fica so aqui, a pagina nunca ve ----
let chatWin = null, history = [];
let gemList = null, gemOk = '';
async function pickModels(key) {
  if (gemList) return gemList;
  const r = await net.fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key } });
  const j = await r.json(); if (!r.ok) throw new Error((j.error && j.error.message || r.status).toString().slice(0, 200));
  const ver = n => { const m = /gemini-(\d+(?:\.\d+)?)/.exec(n); return m ? parseFloat(m[1]) : 0; };
  const l = (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent') && /flash/.test(m.name) && !/lite|image|tts|live|audio|robotics|computer|embed|thinking|exp/.test(m.name))
    .map(m => m.name.replace('models/', '')).sort((a, b) => ver(b) - ver(a) || (/preview/.test(a) ? 1 : 0) - (/preview/.test(b) ? 1 : 0));
  if (!l.length) throw new Error('nenhum modelo flash liberado pra essa chave');
  gemList = l; return l;
}
const getKey = () => { try { if (cfg.geminiKey && safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(Buffer.from(cfg.geminiKey, 'base64')); } catch (e) {} return sessionKey; };
let sessionKey = '';
ipcMain.handle('chat-has-key', () => !!getKey());
ipcMain.handle('chat-set-key', (_e, k) => { if (typeof k !== 'string' || k.length < 20) return false; sessionKey = k;
  try { if (safeStorage.isEncryptionAvailable()) { cfg.geminiKey = safeStorage.encryptString(k).toString('base64'); saveCfg(cfg); } } catch (e) {} return true; });
const TOOLS = [{ functionDeclarations: [
  { name: 'abrir_sites', description: 'Abre sites (https) no Chrome do usuario.', parameters: { type: 'OBJECT', properties: { urls: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['urls'] } },
  { name: 'abrir_atalho', description: 'Abre um atalho da lista do usuario pelo nome (ex: Instagram, GitHub).', parameters: { type: 'OBJECT', properties: { nome: { type: 'STRING' } }, required: ['nome'] } },
  { name: 'buscar_notas', description: 'Busca nas notas do vault do usuario por palavra e devolve trechos.', parameters: { type: 'OBJECT', properties: { termo: { type: 'STRING' } }, required: ['termo'] } }
] }];
function runTool(name, a) {
  if (name === 'abrir_sites') { const l = (a.urls || []).filter(isHttp).slice(0, 8); openUrls(l, 'chrome'); return { aberto: l }; }
  if (name === 'abrir_atalho') { const n = String(a.nome || '').toLowerCase(); const s = shortcuts().concat(chromeBookmarks()).find(x => String(x.label).toLowerCase().includes(n)); if (!s) return { erro: 'atalho nao encontrado' }; openUrls([s.url], 'chrome'); return { aberto: s.url }; }
  if (name === 'buscar_notas') { if (!cfg.vault) return { erro: 'vault nao escolhido' }; const out = []; walk(cfg.vault, cfg.vault, out); const t = String(a.termo || '').toLowerCase(); const hit = [];
    for (const rel of out) { if (hit.length >= 5) break; try { const tx = fs.readFileSync(path.join(cfg.vault, rel), 'utf8'); const ix = tx.toLowerCase().indexOf(t); if (ix >= 0 || rel.toLowerCase().includes(t)) hit.push({ nota: rel, trecho: tx.slice(Math.max(0, ix - 100), ix + 400) }); } catch (e) {} } return { resultados: hit }; }
  return { erro: 'ferramenta desconhecida' };
}
const SYS = 'Voce e o Jarvis, assistente pessoal do Felipe (18 anos, Rio de Janeiro). Responda em portugues do Brasil, frases curtas, palavras simples, direto, sem enfeite. Use as ferramentas para abrir sites e buscar notas quando ele pedir. Se nao souber, diga que nao sabe. Nao invente que fez algo que nao fez. Se a mensagem for um audio, ouca e responda ao que foi dito. Voce NAO consegue postar, clicar em paginas nem editar arquivos; diga isso se pedirem.';
ipcMain.handle('chat-send', async (_e, input) => {
  const key = getKey(); if (!key) throw new Error('sem chave');
  const isAudio = input && typeof input === 'object' && input.audio;
  const part = isAudio ? { inlineData: { mimeType: String(input.audio.mime || 'audio/webm'), data: String(input.audio.data || '') } } : { text: String(input).slice(0, 4000) };
  if (isAudio && part.inlineData.data.length > 6e6) throw new Error('audio muito grande');
  history.push({ role: 'user', parts: [part] }); history = history.slice(-30);
  const models = await pickModels(key);
  try {
    for (let n = 0; n < 5; n++) {
      let r = null, j = null, lastErr = '';
      const order = gemOk ? [gemOk].concat(models.filter(m => m !== gemOk)) : models;
      for (const m of order.slice(0, 6)) {
        try {
          r = await net.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, signal: AbortSignal.timeout(12000),
            body: JSON.stringify({ systemInstruction: { parts: [{ text: SYS }] }, contents: history, tools: TOOLS }) });
          j = await r.json();
        } catch (e) { r = null; lastErr = m + ': sem resposta em 12s'; if (m === gemOk) gemOk = ''; continue; }
        if (r.status === 404 || r.status === 429 || r.status >= 500) { lastErr = m + ': ' + r.status; if (m === gemOk) gemOk = ''; continue; }
        gemOk = m; break;
      }
      if (!r) throw new Error('nenhum modelo respondeu (' + lastErr + ')');
      if (!r.ok) throw new Error((j.error && j.error.message || r.status).toString().slice(0, 200));
      const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
      history.push({ role: 'model', parts: parts.length ? parts : [{ text: '' }] });
      const calls = parts.filter(p => p.functionCall);
      if (!calls.length) return parts.map(p => p.text || '').join('').trim() || '(sem resposta)';
      history.push({ role: 'user', parts: calls.map(p => ({ functionResponse: { name: p.functionCall.name, response: runTool(p.functionCall.name, p.functionCall.args || {}) } })) });
    }
    return 'Parei apos varias tentativas. Tente de novo.';
  } catch (e) { history.pop(); throw e; }
  finally { for (const h of history) h.parts = h.parts.map(p => p.inlineData ? { text: '(mensagem de voz)' } : p); }
});
function openChat() {
  if (chatWin && !chatWin.isDestroyed()) { chatWin.show(); chatWin.focus(); return; }
  chatWin = new BrowserWindow({ width: 440, height: 720, x: 40, y: 60, title: 'Jarvis', backgroundColor: '#06080c', alwaysOnTop: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true } });
  chatWin.setMenuBarVisibility(false); chatWin.loadFile('chat.html');
  if (process.platform === 'darwin') { try { systemPreferences.askForMediaAccess('microphone'); } catch (e) {} }
}
ipcMain.on('open-chat', () => openChat());
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
      { label: 'Esconder minhas abas  (Cmd+Alt+H)', click: () => hideOthers() },
      { label: 'Recarregar atalhos do Chrome', click: () => { injected = 0; injectShortcuts(); } },
      { role: 'togglefullscreen' }, { type: 'separator' }, { role: 'quit' } ] },
    { role: 'editMenu' } ]));
  createWindow();
  setTimeout(checkUpdate, 6000);
  // Cmd/Ctrl+Alt+J: esconde ou mostra o Jarvis
  globalShortcut.register('CommandOrControl+Alt+J', () => { if (!win) return; if (win.isVisible() && win.isFocused()) win.hide(); else { win.show(); win.focus(); } });
  globalShortcut.register('CommandOrControl+Alt+K', () => openChat());
  globalShortcut.register('CommandOrControl+Alt+H', () => { hideOthers(); });
});
// aviso de versao nova (Mac sem assinatura nao atualiza sozinho: o app avisa e abre a pagina de download)
async function checkUpdate() {
  try {
    const r = await require('electron').net.fetch('https://api.github.com/repos/felipetdreux-eng/jarvis-app/releases/latest', { headers: { 'User-Agent': 'jarvis-app' } });
    if (!r.ok) return;
    const j = await r.json(); const latest = String(j.tag_name || '').replace(/^v/, '');
    const nv = s => s.split('.').map(Number); const a = nv(latest), b = nv(app.getVersion());
    const newer = a.length === 3 && !a.some(isNaN) && (a[0] - b[0] || a[1] - b[1] || a[2] - b[2]) > 0;
    if (!newer || cfg.skipVersion === latest) return;
    const x = await dialog.showMessageBox(win, { type: 'info', buttons: ['Baixar', 'Depois', 'Pular esta'], defaultId: 0, message: 'Jarvis ' + latest + ' disponivel', detail: 'Voce tem a ' + app.getVersion() + '. A pagina do Jarvis ja atualiza sozinha; so mudancas do app precisam de download.' });
    if (x.response === 0) shell.openExternal(j.html_url);
    else if (x.response === 2) { cfg.skipVersion = latest; saveCfg(cfg); }
  } catch (e) {}
}
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
