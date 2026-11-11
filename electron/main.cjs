// Electron main process. Phase 2 will start the built-in LAN server from here.
const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

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

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

// run logs stay on this machine, in the app's user data folder
ipcMain.handle('save-run-log', (_event, json) => {
  if (typeof json !== 'string' || json.length > 1_000_000) return;
  JSON.parse(json);
  const dir = path.join(app.getPath('userData'), 'runs');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `run-${new Date().toISOString().replace(/[:.]/g, '-')}.json`), json);
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
