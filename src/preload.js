const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('printaViewApi', {
  getDownloadsPath: () => ipcRenderer.invoke('downloads:getPath'),
  scanItems: (payload) => ipcRenderer.invoke('items:scan', payload),
  setHidden: (payload) => ipcRenderer.invoke('items:setHidden', payload),
  setFavorite: (payload) => ipcRenderer.invoke('items:setFavorite', payload),
  openItem: (payload) => ipcRenderer.invoke('items:open', payload),
  revealItem: (payload) => ipcRenderer.invoke('items:reveal', payload),
  getPdfCache: (payload) => ipcRenderer.invoke('pdfcache:get', payload),
  setPdfCache: (payload) => ipcRenderer.invoke('pdfcache:set', payload),
  browseFolders: () => ipcRenderer.invoke('folder:browse'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (payload) => ipcRenderer.invoke('settings:save', payload),
  getHiddenItems: () => ipcRenderer.invoke('hidden:getItems'),
  clearAllHidden: () => ipcRenderer.invoke('hidden:clearAll'),
  openSettings: () => ipcRenderer.send('settings:open')
});
