const { ipcMain } = require('electron');
const { resolveFeedUrl } = require('../updater/feed-config');

function register({ updater, getMainWindow, getChannel }) {
  ipcMain.handle('updater:check', async () => {
    const channel = getChannel();
    const version = require('electron').app.getVersion();
    const platform = process.platform;
    const feed = resolveFeedUrl(channel, version, platform);
    updater.autoUpdater.setFeedURL({ url: feed.replace(/\/latest-[^/]+\.yml$/, '') });
    await updater.check();
    return { state: updater.state };
  });

  ipcMain.handle('updater:install', () => {
    updater.install();
  });

  ipcMain.handle('updater:get-state', () => {
    return { state: updater.state };
  });

  // Forward status events to renderer
  updater.on('status', (payload) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('updater:status', payload);
    }
  });
}

module.exports = { register };
