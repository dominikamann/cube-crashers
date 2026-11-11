// Automatic updates from the GitHub releases of this project.
// Windows: download in the background, install on restart. macOS: the same once the app is signed;
// an unsigned Mac app cannot replace itself, so there the player gets a link to the download instead.
const { app, shell } = require('electron');

const RELEASES_URL = 'https://github.com/dominikamann/cube-crashers/releases/latest';
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

function startUpdater(emit) {
  if (!app.isPackaged) return { install() {}, openDownload() {} };
  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  let available = null;

  autoUpdater.on('update-available', info => {
    available = info.version;
    emit({ type: 'available', version: info.version });
  });
  autoUpdater.on('download-progress', p => emit({ type: 'progress', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', info => emit({ type: 'ready', version: info.version }));
  autoUpdater.on('error', () => {
    // e.g. an unsigned Mac build: the update cannot be installed automatically, so offer the download page
    if (available) emit({ type: 'manual', version: available });
  });

  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 3000);
  setInterval(check, CHECK_EVERY_MS);

  return {
    install: () => autoUpdater.quitAndInstall(),
    openDownload: () => shell.openExternal(RELEASES_URL),
  };
}

module.exports = { startUpdater };
