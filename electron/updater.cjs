// Automatic updates from the GitHub releases of this project.
// The new version downloads in the background and installs on the next restart (Windows: silently, into the
// same folder; macOS: the app is signed and notarized). Whatever goes wrong is tried again before the player is
// bothered: a failed download starts afresh, an install that did not take is tried once more. Only then does
// the player get a link straight to the right file. What happens is written to updater.log in the app's data
// folder, so a failed update can be looked into.
const fs = require('fs');
const path = require('path');
const { app, shell } = require('electron');

const REPO = 'https://github.com/dominikamann/cube-crashers';
const RELEASES_URL = `${REPO}/releases/latest`;
// look for a new version every three hours while the game is open
const CHECK_EVERY_MS = 3 * 60 * 60 * 1000;
// after a failure: look again this soon, this many times, before the player gets the download link
const RETRY_MS = 30 * 1000;
const RETRIES = 2;
// an install that did not take is tried this many times in all
const INSTALL_TRIES = 2;
// the log is kept short: past this size it starts again
const LOG_MAX_BYTES = 200 * 1024;

const dataFile = name => path.join(app.getPath('userData'), name);

/** one line in updater.log, with the time and the version that is running */
function log(line) {
  try {
    const file = dataFile('updater.log');
    if (fs.existsSync(file) && fs.statSync(file).size > LOG_MAX_BYTES) fs.writeFileSync(file, '');
    fs.appendFileSync(file, `${new Date().toISOString()} [${app.getVersion()}] ${line}\n`);
  } catch {
    // (no log is no reason to stop the game)
  }
}

/** a.b.c against x.y.z: below 0, 0 or above 0 */
function compareVersions(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0), pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}

/** the file of release `version` for this computer, as the release names it (see artifactName in electron-builder.yml) */
function assetFor(version, platform, arch) {
  if (platform === 'win32') return `CubeCrashers-${version}-win-x64.exe`;
  if (platform === 'darwin') return `CubeCrashers-${version}-mac-${arch === 'arm64' ? 'arm64' : 'x64'}.dmg`;
  return null;
}

/** where to get release `version` by hand: the file itself, or the release page where there is none for this system */
function downloadUrl(version, platform, arch) {
  const file = version ? assetFor(version, platform, arch) : null;
  return file ? `${REPO}/releases/download/v${version}/${file}` : RELEASES_URL;
}

/** the update that was installed on the last restart, and how often that was tried (null: none) */
function readPending() {
  try {
    return JSON.parse(fs.readFileSync(dataFile('update-pending.json'), 'utf8'));
  } catch {
    return null;
  }
}
function writePending(p) {
  try {
    if (p) fs.writeFileSync(dataFile('update-pending.json'), JSON.stringify(p));
    else fs.rmSync(dataFile('update-pending.json'), { force: true });
  } catch {
    // (it only helps to notice an install that did not take)
  }
}

/** the folder the updater downloads into (see updaterCacheDirName in app-update.yml): emptied after a failure */
function clearDownloads() {
  try {
    const yml = fs.readFileSync(path.join(process.resourcesPath, 'app-update.yml'), 'utf8');
    const name = /updaterCacheDirName:\s*(\S+)/.exec(yml)?.[1];
    if (!name) return;
    const base = process.platform === 'win32' ? process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local') : process.platform === 'darwin' ? path.join(app.getPath('home'), 'Library', 'Caches') : app.getPath('cache');
    fs.rmSync(path.join(base, name, 'pending'), { recursive: true, force: true });
    log('cleared the downloads');
  } catch (err) {
    log(`could not clear the downloads: ${err.message}`);
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
  let failures = 0;
  let lastPct = -1;

  // the last restart was to install an update: did it take?
  const pending = readPending();
  let installTries = 0;
  if (pending && compareVersions(current, pending.version) >= 0) {
    log(`updated to ${current}`);
    writePending(null);
  } else if (pending) {
    installTries = pending.tries || 1;
    log(`the install of ${pending.version} did not take (tried ${installTries} time${installTries > 1 ? 's' : ''})`);
    clearDownloads();
  }
  const manual = () => {
    const version = available || pending?.version;
    if (!version) return;
    log(`offering the download of ${version}`);
    emit({ type: 'manual', version, current });
  };

  autoUpdater.on('update-available', info => {
    available = info.version;
    log(`available ${info.version}`);
    // (installed twice and still the old version: no third try, the player installs it by hand)
    if (installTries >= INSTALL_TRIES && pending && info.version === pending.version) {
      autoUpdater.autoInstallOnAppQuit = false;
      return manual();
    }
    emit({ type: 'available', version: info.version, current });
  });
  autoUpdater.on('update-not-available', () => {
    log('up to date');
    failures = 0;
  });
  autoUpdater.on('download-progress', p => {
    const pct = Math.round(p.percent);
    if (Math.floor(pct / 25) !== Math.floor(lastPct / 25)) log(`downloading ${pct}%`);
    lastPct = pct;
    emit({ type: 'progress', percent: pct, current });
  });
  autoUpdater.on('update-downloaded', info => {
    if (installTries >= INSTALL_TRIES && pending && info.version === pending.version) return;
    ready = info.version;
    failures = 0;
    log(`downloaded ${info.version}, installs on restart`);
    // (written now: also a restart without the button installs it, see autoInstallOnAppQuit)
    writePending({ version: info.version, tries: installTries + 1 });
    emit({ type: 'ready', version: info.version, current });
  });
  autoUpdater.on('error', err => {
    log(`failed: ${err && err.message ? err.message.split('\n')[0] : err}`);
    if (ready) return;
    failures++;
    // a broken or half download is thrown away and fetched again; only after a few tries does the player hear of it
    clearDownloads();
    if (failures <= RETRIES) {
      log(`trying again in ${RETRY_MS / 1000} s (${failures} of ${RETRIES})`);
      setTimeout(check, RETRY_MS);
      return;
    }
    manual();
  });

  function check() {
    autoUpdater.checkForUpdates().catch(() => {});
  }
  setTimeout(check, 3000);
  setInterval(() => {
    failures = 0;
    check();
  }, CHECK_EVERY_MS);

  return {
    install: () => {
      if (!ready) return;
      log(`restart to install ${ready}`);
      // Windows: the installer runs without asking (into the folder the game is in) and starts the game after
      setImmediate(() => autoUpdater.quitAndInstall(true, true));
    },
    openDownload: () => {
      const url = downloadUrl(available || pending?.version, process.platform, process.arch);
      log(`opening ${url}`);
      shell.openExternal(url);
    },
  };
}

module.exports = { startUpdater, compareVersions, assetFor, downloadUrl };
