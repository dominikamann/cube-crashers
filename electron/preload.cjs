// Bridge for the few things the game needs from the desktop app.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cubeCrashers', {
  saveRunLog: json => ipcRenderer.invoke('save-run-log', json),
});
