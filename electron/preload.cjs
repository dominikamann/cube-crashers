// Bridge for the few things the game needs from the desktop app.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cubeCrashers', {
  saveRunLog: json => ipcRenderer.invoke('save-run-log', json),
  updates: {
    state: () => ipcRenderer.invoke('update:state'),
    install: () => ipcRenderer.send('update:install'),
    download: () => ipcRenderer.send('update:download'),
    on: cb => {
      const listener = (_event, e) => cb(e);
      ipcRenderer.on('update:event', listener);
      return () => ipcRenderer.removeListener('update:event', listener);
    },
  },
  lan: {
    host: name => ipcRenderer.invoke('lan:host', name),
    join: address => ipcRenderer.invoke('lan:join', address),
    discover: () => ipcRenderer.invoke('lan:discover'),
    probe: address => ipcRenderer.invoke('lan:probe', address),
    serverList: () => ipcRenderer.invoke('lan:serverList'),
    stopDiscovery: () => ipcRenderer.invoke('lan:stopDiscovery'),
    send: (to, data) => ipcRenderer.send('lan:send', to, data),
    kick: peer => ipcRenderer.send('lan:kick', peer),
    setInfo: info => ipcRenderer.send('lan:info', info),
    close: () => ipcRenderer.invoke('lan:close'),
    on: cb => {
      const listener = (_event, e) => cb(e);
      ipcRenderer.on('lan:event', listener);
      return () => ipcRenderer.removeListener('lan:event', listener);
    },
  },
});
