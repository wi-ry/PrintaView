const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('printaViewApi', {
  getDownloadsPath: () => ipcRenderer.invoke('downloads:getPath'),
  scanItems: (payload) => ipcRenderer.invoke('items:scan', payload),
  setHidden: (payload) => ipcRenderer.invoke('items:setHidden', payload),
  openItem: (payload) => ipcRenderer.invoke('items:open', payload),
  browseFolders: () => ipcRenderer.invoke('folder:browse')
});
