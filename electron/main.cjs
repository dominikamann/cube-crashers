// Electron main process: the game window, run logs, and the built-in LAN server.
const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const lan = require('./lan.cjs');

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: '#9fd8ef',
    title: 'Cube Crashers',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });
  // the window only ever shows the game: no navigation, no pop-ups (e.g. a file dropped on the window)
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  win.on('closed', () => {
    stopLan();
    win = null;
  });
}

/** IPC only from our own game window */
function fromGame(event) {
  return win && event.sender === win.webContents;
}

// run logs stay on this machine, in the app's user data folder
ipcMain.handle('save-run-log', (event, json) => {
  if (!fromGame(event) || typeof json !== 'string' || json.length > 1_000_000) return;
  JSON.parse(json);
  const dir = path.join(app.getPath('userData'), 'runs');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `run-${new Date().toISOString().replace(/[:.]/g, '-')}.json`), json);
});

// ---------- LAN ----------

let hosting = null;
let beacon = null;
let client = null;
let discovery = null;

const emit = event => win?.webContents.send('lan:event', event);

function stopLan() {
  beacon?.stop();
  hosting?.stop();
  client?.close();
  beacon = hosting = client = null;
}

ipcMain.handle('lan:host', async (event, name) => {
  if (!fromGame(event)) return;
  stopLan();
  hosting = await lan.startHost({
    port: lan.GAME_PORT,
    onMessage: (from, data) => emit({ type: 'message', from, data }),
    onPeer: (peer, joined) => emit({ type: 'peer', peer, joined }),
  });
  const shown = String(name || 'Cube Crashers').slice(0, 16);
  beacon = lan.startBeacon({ info: () => ({ name: shown, players: hosting ? hosting.players() : 1, gamePort: hosting ? hosting.port : lan.GAME_PORT }) });
});

ipcMain.handle('lan:join', async (event, address) => {
  if (!fromGame(event) || typeof address !== 'string' || address.length > 64) return;
  stopLan();
  client = await lan.connect(address, {
    onMessage: (from, data) => emit({ type: 'message', from, data }),
    onClose: () => {
      client = null;
      emit({ type: 'closed' });
    },
  });
});

ipcMain.on('lan:send', (event, to, data) => {
  if (!fromGame(event) || typeof data !== 'string') return;
  if (hosting) hosting.send(to, data);
  else client?.send(data);
});

ipcMain.handle('lan:discover', event => {
  if (!fromGame(event)) return;
  discovery?.stop();
  discovery = lan.startDiscovery({ onGames: games => emit({ type: 'games', games }) });
});

ipcMain.handle('lan:stopDiscovery', () => {
  discovery?.stop();
  discovery = null;
});

ipcMain.handle('lan:close', () => stopLan());

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  stopLan();
  discovery?.stop();
  app.quit();
});
