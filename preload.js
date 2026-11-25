const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('jarvis', {
  buttons: () => ipcRenderer.invoke('buttons'),
  launch: i => ipcRenderer.send('launch', i),
  setUrl: u => ipcRenderer.send('set-url', u),
  menu: w => ipcRenderer.send('menu', w),
  vault: { info: () => ipcRenderer.invoke('vault-info'), pick: () => ipcRenderer.invoke('vault-pick'), list: () => ipcRenderer.invoke('vault-list'), read: r => ipcRenderer.invoke('vault-read', r) },
  mode: n => ipcRenderer.send('mode', n),
  onSetup: f => ipcRenderer.on('setup', (_e, on) => f(on))
});
