const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('clipApi', {
  list: () => ipcRenderer.invoke('clip:list'),
  quickList: () => ipcRenderer.invoke('quick:list'),
  copy: (t) => ipcRenderer.invoke('clip:copy', t),
  paste: (t) => ipcRenderer.invoke('clip:paste', t)
});
