const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  checkUpdate: () => ipcRenderer.send('check-update'),
  retry: () => ipcRenderer.send('retry-load'),
  onUpdateStatus: (cb) => ipcRenderer.on('update-status', (_, msg) => cb(msg)),
  onUpdateProgress: (cb) => ipcRenderer.on('update-progress', (_, pct) => cb(pct)),
});
