const { ipcMain, shell } = require('electron');

function register({ crash, getMainWindow }) {
  ipcMain.handle('crash:read', () => {
    return crash.list();
  });

  ipcMain.on('crash:open-dir', () => {
    shell.openPath(crash.path());
  });

  ipcMain.handle('crash:delete', (_event, filename) => {
    if (
      typeof filename === 'string' &&
      /^\d+(-\d+)?-(uncaughtException|unhandledRejection)\.json$/.test(filename)
    ) {
      crash.delete(filename);
      return true;
    }
    return false;
  });
}

module.exports = { register };
