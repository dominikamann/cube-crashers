// Automatic updates from the GitHub releases of this project.
// Windows: download in the background, install on restart. macOS: the same (the app is signed and notarized).
// When an update cannot be installed by itself, the player gets a link to the download instead.
// What happens is written to updater.log in the app's data folder, so a failed update can be looked into.
const fs = require('fs');
const path = require('path');
const { app, shell } = require('electron');

const RELEASES_URL = 'https://github.com/dominikamann/cube-crashers/releases/latest';
// look for a new version every three hours while the game is open
const CHECK_EVERY_MS = 3 * 60 * 60 * 1000;
// the log is kept short: past this size it starts again
const LOG_MAX_BYTES = 200 * 1024;

/** one line in updater.log, with the time and the version that is running */
function log(line) {
  try {
    const file = path.join(app.getPath('userData'), 'updater.log');
    if (fs.existsSync(file) && fs.statSync(file).size > LOG_MAX_BYTES) fs.writeFileSync(file, '');
    fs.appendFileSync(file, `${new Date().toISOString()} [${app.getVersion()}] ${line}\n`);
  } catch {
    // (no log is no reason to stop the game)
  }
}

function startUpdater(emit) {
  if (!app.isPackaged) return { install() {}, openDownload() {} };
  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = { info: m => log(`info ${m}`), warn: m => log(`warn ${m}`), error: m => log(`error ${m}`), debug: () => {} };
  const current = app.getVersion();
  let available = null;
  // a version that is downloaded and waits for the restart: a later failed check does not take that back
  let ready = null;
  let lastPct = -1;

  autoUpdater.on('update-available', info => {
    available = info.version;
    log(`available ${info.version}`);
    emit({ type: 'available', version: info.version, current });
  });
  autoUpdater.on('update-not-available', () => log('up to date'));
  autoUpdater.on('download-progress', p => {
    const pct = Math.round(p.percent);
    if (Math.floor(pct / 25) !== Math.floor(lastPct / 25)) log(`downloading ${pct}%`);
    lastPct = pct;
    emit({ type: 'progress', percent: pct, current });
  });
  autoUpdater.on('update-downloaded', info => {
    ready = info.version;
    log(`downloaded ${info.version}, installs on restart`);
    emit({ type: 'ready', version: info.version, current });
  });
  autoUpdater.on('error', err => {
    log(`failed: ${err && err.message ? err.message.split('\n')[0] : err}`);
    if (ready) return;
    // the update cannot be installed by itself: offer the download page
    if (available) emit({ type: 'manual', version: available, current });
  });

  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 3000);
  setInterval(check, CHECK_EVERY_MS);

  return {
    install: () => {
      log(`restart to install ${ready}`);
      autoUpdater.quitAndInstall();
    },
    openDownload: () => shell.openExternal(RELEASES_URL),
  };
}

module.exports = { startUpdater };
