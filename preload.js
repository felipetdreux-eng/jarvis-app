const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('jarvis', {
  buttons: () => ipcRenderer.invoke('buttons'),
  launch: i => ipcRenderer.send('launch', i),
  setUrl: u => ipcRenderer.send('set-url', u),
  menu: w => ipcRenderer.send('menu', w),
  onSetup: f => ipcRenderer.on('setup', (_e, on) => f(on))
});
