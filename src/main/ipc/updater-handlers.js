const { ipcMain } = require('electron');
const { feedConfigFor } = require('../updater/feed-config');

function register({ updater, getMainWindow, getChannel }) {
  ipcMain.handle('updater:check', async () => {
    const channel = getChannel();
    updater.autoUpdater.setFeedURL(feedConfigFor(channel));
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
