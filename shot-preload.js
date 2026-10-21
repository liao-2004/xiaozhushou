const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('shotApi', {
  onImage: (cb) => ipcRenderer.on('shot-image', (e, data) => cb(data)),
  save: (d) => ipcRenderer.invoke('shot:save', d),
  cancel: () => ipcRenderer.invoke('shot:cancel')
});
