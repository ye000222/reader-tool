const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktopApi', {
  fetchArticle: (url) => ipcRenderer.invoke('article:fetch', url),
  exportData: (payload) => ipcRenderer.invoke('data:export', payload),
  importData: () => ipcRenderer.invoke('data:import'),
  encryptSecret: (plain) => ipcRenderer.invoke('secrets:encrypt', plain),
  decryptSecret: (cipher) => ipcRenderer.invoke('secrets:decrypt', cipher),
})
