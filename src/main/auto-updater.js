/**
 * Auto-updater wiring for electron-updater.
 *
 * Wraps electron-updater's autoUpdater so the main process has one place
 * to:
 *   - start a check on app launch
 *   - forward events to the renderer over 'updates:status' IPC
 *   - accept "install now" / "check now" requests from the renderer
 *
 * Safe to call in dev: when no app-update.yml is packaged (which is the
 * case for `npm start` / electron .), electron-updater surfaces an
 * "app-update.yml not found" error which we swallow and log. The renderer
 * still gets a `not-available` event so the UI can show "you're up to
 * date" instead of a spinning indicator that never resolves.
 *
 * @module auto-updater
 */

/**
 * @param {object} deps
 * @param {(channel:string, payload?:any) => void} deps.send - forwards
 *   status events to the BrowserWindow's webContents
 * @param {() => boolean} [deps.isDev] - dev gate (skip check in dev)
 */
function setupAutoUpdater({ send, isDev }) {
  // Lazy-load — electron-updater touches `app` at import time, which fails
  // in test environments where the app isn't bootstrapped.
  const { autoUpdater } = require('electron-updater');

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // Forward every event to the renderer with a typed payload.
  autoUpdater.on('checking-for-update', () => send('updates:status', { state: 'checking' }));
  autoUpdater.on('update-available', (info) =>
    send('updates:status', { state: 'available', version: info?.version })
  );
  autoUpdater.on('update-not-available', (info) =>
    send('updates:status', { state: 'not-available', version: info?.version })
  );
  autoUpdater.on('download-progress', (p) =>
    send('updates:status', { state: 'downloading', percent: Math.round(p.percent || 0) })
  );
  autoUpdater.on('update-downloaded', (info) =>
    send('updates:status', { state: 'downloaded', version: info?.version })
  );
  autoUpdater.on('error', (err) =>
    send('updates:status', {
      state: 'error',
      message: err && err.message ? err.message : 'Update check failed.',
    })
  );

  function check() {
    if (typeof isDev === 'function' && isDev()) return Promise.resolve(null);
    return autoUpdater.checkForUpdates().catch((err) => {
      // Dev runs surface "app-update.yml not found" — treat that as benign.
      const msg = err && err.message ? err.message : String(err);
      if (msg.includes('app-update.yml') || msg.includes('Cannot find')) {
        send('updates:status', { state: 'not-available' });
        return null;
      }
      send('updates:status', { state: 'error', message: msg });
      return null;
    });
  }

  function install() {
    autoUpdater.quitAndInstall();
  }

  return { check, install };
}

module.exports = { setupAutoUpdater };
