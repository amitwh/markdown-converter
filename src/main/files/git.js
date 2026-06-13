// src/main/files/git.js
// Git IPC handlers — thin wrapper over GitOperations
const { ipcMain } = require('electron');
const GitOperations = require('../GitOperations');

function register(currentFileRef) {
  ipcMain.handle('git-status', async (_event, rootPath) => {
    const dir =
      rootPath ||
      (currentFileRef.current ? require('path').dirname(currentFileRef.current) : process.cwd());
    return GitOperations.getStatus(dir);
  });

  ipcMain.handle('git-stage', async (_event, { rootPath, files }) => {
    const dir =
      rootPath ||
      (currentFileRef.current ? require('path').dirname(currentFileRef.current) : process.cwd());
    return GitOperations.stage(dir, files);
  });

  ipcMain.handle('git-commit', async (_event, { rootPath, message }) => {
    const dir =
      rootPath ||
      (currentFileRef.current ? require('path').dirname(currentFileRef.current) : process.cwd());
    return GitOperations.commit(dir, message);
  });

  ipcMain.handle('git-log', async (_event, rootPath) => {
    const dir =
      rootPath ||
      (currentFileRef.current ? require('path').dirname(currentFileRef.current) : process.cwd());
    return GitOperations.log(dir);
  });

  ipcMain.handle('git-diff', async (_event, filePath) => {
    const dir = filePath
      ? require('path').dirname(filePath)
      : currentFileRef.current
        ? require('path').dirname(currentFileRef.current)
        : process.cwd();
    return GitOperations.diff(dir, filePath);
  });
}

module.exports = { register };
