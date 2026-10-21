const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('onSnapshot', (cb) => ipcRenderer.on('snapshot', (_, data) => cb(data)));
