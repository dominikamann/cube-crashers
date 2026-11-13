// Electron main process: the game window, run logs, and the built-in LAN server.
const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const EXTERNAL_LINKS = ['https://www.amannlabs.eu', 'mailto:hello@amannlabs.eu', 'https://github.com/sponsors/dominikamann'];
const lan = require('./lan.cjs');
const { startUpdater } = require('./updater.cjs');

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
      // a LAN host keeps the game running for everyone even when its window is minimised
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);

  // minimised or hidden: the game goes on (a LAN host keeps hosting) but stays silent
  for (const event of ['minimize', 'hide']) win.on(event, () => win.webContents.setAudioMuted(true));
  for (const event of ['restore', 'show']) win.on(event, () => win.webContents.setAudioMuted(false));

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });
  // the window only ever shows the game: no navigation, no pop-ups (e.g. a file dropped on the window);
  // the credits links open in the system browser (or the mail program)
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (EXTERNAL_LINKS.includes(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

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
let info = { players: 1, open: true };

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
  info = { players: 1, open: true };
  // callbacks of an older server must not reach a newer session
  let self = null;
  self = await lan.startHost({
    port: lan.GAME_PORT,
    onMessage: (from, data) => hosting === self && emit({ type: 'message', from, data }),
    onPeer: (peer, joined) => hosting === self && emit({ type: 'peer', peer, joined }),
  });
  hosting = self;
  const shown = String(name || 'Cube Crashers').slice(0, 16);
  beacon = lan.startBeacon({ info: () => ({ name: shown, players: info.players, open: info.open, gamePort: self.port }) });
});

/** host or host:port (name, IPv4 or [IPv6]), as long as the online list allows */
const ADDRESS = /^[A-Za-z0-9.:[\]-]{1,260}$/;

ipcMain.handle('lan:join', async (event, address) => {
  if (!fromGame(event) || typeof address !== 'string' || !ADDRESS.test(address)) throw new Error('bad address');
  stopLan();
  let self = null;
  self = await lan.connect(address, {
    onMessage: (from, data) => client === self && emit({ type: 'message', from, data }),
    onClose: () => {
      if (client !== self) return;
      client = null;
      emit({ type: 'closed' });
    },
  });
  client = self;
});

ipcMain.on('lan:send', (event, to, data) => {
  if (!fromGame(event) || typeof data !== 'string') return;
  if (hosting) hosting.send(to, data);
  else client?.send(data);
});

ipcMain.on('lan:kick', (event, peer) => {
  if (fromGame(event) && Number.isInteger(peer)) hosting?.kick(peer);
});

ipcMain.on('lan:info', (event, next) => {
  if (!fromGame(event) || typeof next !== 'object' || next === null) return;
  info = { players: Math.min(10, Math.max(1, Number(next.players) || 1)), open: next.open !== false };
});

ipcMain.handle('lan:discover', event => {
  if (!fromGame(event)) return;
  discovery?.stop();
  discovery = lan.startDiscovery({ onGames: games => emit({ type: 'games', games }) });
});

// ---------- online server list ----------

// the shared list lives on GitHub, so a new server needs no new release of the game
const SERVER_LIST_URL = 'https://raw.githubusercontent.com/dominikamann/cube-crashers/main/servers.json';

ipcMain.handle('lan:serverList', async event => {
  if (!fromGame(event)) return null;
  try {
    const res = await fetch(SERVER_LIST_URL, { signal: AbortSignal.timeout(5000), cache: 'no-store' });
    if (!res.ok) return null;
    const text = await res.text();
    return text.length < 200_000 ? JSON.parse(text) : null;
  } catch {
    return null;
  }
});

ipcMain.handle('lan:probe', (event, address) => {
  if (!fromGame(event) || typeof address !== 'string' || !ADDRESS.test(address)) return null;
  return lan.probe(address);
});

ipcMain.handle('lan:stopDiscovery', event => {
  if (!fromGame(event)) return;
  discovery?.stop();
  discovery = null;
});

ipcMain.handle('lan:close', event => {
  if (fromGame(event)) stopLan();
});

// ---------- updates ----------

let updater = null;
let lastUpdate = null;
ipcMain.handle('update:state', event => (fromGame(event) ? lastUpdate : null));
ipcMain.on('update:install', event => fromGame(event) && updater?.install());
ipcMain.on('update:download', event => fromGame(event) && updater?.openDownload());

app.whenReady().then(() => {
  createWindow();
  updater = startUpdater(e => {
    lastUpdate = e;
    win?.webContents.send('update:event', e);
  });
});
app.on('window-all-closed', () => {
  stopLan();
  discovery?.stop();
  app.quit();
});
