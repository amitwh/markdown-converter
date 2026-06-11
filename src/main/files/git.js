// src/main/files/git.js
// Git IPC handlers — thin wrapper over GitOperations
const { ipcMain } = require('electron');
const GitOperations = require('../GitOperations');

function register(currentFileRef) {
  ipcMain.handle('git-status', async () => {
    const dir = currentFileRef.current
      ? require('path').dirname(currentFileRef.current)
      : process.cwd();
    return GitOperations.getStatus(dir);
  });

  ipcMain.handle('git-stage', async (_event, { files }) => {
    const dir = currentFileRef.current
      ? require('path').dirname(currentFileRef.current)
      : process.cwd();
    return GitOperations.stage(dir, files);
  });

  ipcMain.handle('git-commit', async (_event, { message }) => {
    const dir = currentFileRef.current
      ? require('path').dirname(currentFileRef.current)
      : process.cwd();
    return GitOperations.commit(dir, message);
  });

  ipcMain.handle('git-log', async () => {
    const dir = currentFileRef.current
      ? require('path').dirname(currentFileRef.current)
      : process.cwd();
    return GitOperations.log(dir);
  });
}

module.exports = { register };
