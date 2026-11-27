const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('jarvis', {
  buttons: () => ipcRenderer.invoke('buttons'),
  launch: i => ipcRenderer.send('launch', i),
  setUrl: u => ipcRenderer.send('set-url', u),
  menu: w => ipcRenderer.send('menu', w),
  vault: { info: () => ipcRenderer.invoke('vault-info'), pick: () => ipcRenderer.invoke('vault-pick'), list: () => ipcRenderer.invoke('vault-list'), read: r => ipcRenderer.invoke('vault-read', r) },
  shortcuts: () => ipcRenderer.invoke('shortcuts'),
  openShortcut: i => ipcRenderer.send('open-shortcut', i),
  ask: w => ipcRenderer.send('ask', w),
  chatHasKey: () => ipcRenderer.invoke('chat-has-key'),
  chatSetKey: k => ipcRenderer.invoke('chat-set-key', k),
  chatSend: t => ipcRenderer.invoke('chat-send', t),
  mode: n => ipcRenderer.send('mode', n),
  onDock: f => ipcRenderer.on('dock', (_e, on) => f(on)),
  onSetup: f => ipcRenderer.on('setup', (_e, on) => f(on))
});
