// src/main/files/index.js
// File ops facade — registers all file-related IPC handlers
const { ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { register: registerGit } = require('./git');
const { register: registerBinary } = require('./binary');

function register({
  validatePath,
  resolveWritablePath,
  isPathAccessible,
  currentFileRef,
  mainWindow,
}) {
  // pick-folder
  ipcMain.handle('pick-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // pick-file
  ipcMain.handle('pick-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // read-file
  ipcMain.handle('read-file', async (event, filePath) => {
    const validation = validatePath(filePath);
    if (!validation.valid || !isPathAccessible(validation.resolved)) {
      throw new Error(validation.error || 'Invalid file path');
    }
    return fs.readFileSync(validation.resolved, 'utf-8');
  });

  // write-file
  ipcMain.handle('write-file', async (event, payload) => {
    const validation = resolveWritablePath(payload?.path);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid file path');
    }
    fs.mkdirSync(path.dirname(validation.resolved), { recursive: true });
    fs.writeFileSync(validation.resolved, payload?.content ?? '', 'utf-8');
    return { path: validation.resolved };
  });

  // delete-file
  ipcMain.handle('delete-file', async (event, filePath) => {
    const validation = validatePath(filePath);
    if (!validation.valid || !isPathAccessible(validation.resolved)) {
      throw new Error(validation.error || 'Invalid file path');
    }
    fs.rmSync(validation.resolved, { recursive: true, force: false });
    return true;
  });

  // ensure-directory
  ipcMain.handle('ensure-directory', async (event, dirPath) => {
    const validation = resolveWritablePath(dirPath);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid directory path');
    }
    fs.mkdirSync(validation.resolved, { recursive: true });
    return validation.resolved;
  });

  // path-exists
  ipcMain.handle('path-exists', async (event, filePath) => {
    const validation = resolveWritablePath(filePath);
    return validation.valid ? fs.existsSync(validation.resolved) : false;
  });

  // is-directory
  ipcMain.handle('is-directory', async (event, filePath) => {
    const validation = validatePath(filePath);
    if (!validation.valid || !isPathAccessible(validation.resolved)) {
      return false;
    }
    return fs.statSync(validation.resolved).isDirectory();
  });

  // copy-path
  ipcMain.handle('copy-path', async (event, payload) => {
    const sourceValidation = validatePath(payload?.source);
    const destinationValidation = resolveWritablePath(payload?.destination);

    if (!sourceValidation.valid || !isPathAccessible(sourceValidation.resolved)) {
      throw new Error(sourceValidation.error || 'Invalid source path');
    }
    if (!destinationValidation.valid) {
      throw new Error(destinationValidation.error || 'Invalid destination path');
    }

    fs.mkdirSync(path.dirname(destinationValidation.resolved), { recursive: true });
    fs.cpSync(sourceValidation.resolved, destinationValidation.resolved, { recursive: true });
    return { source: sourceValidation.resolved, destination: destinationValidation.resolved };
  });

  // move-path
  ipcMain.handle('move-path', async (event, payload) => {
    const sourceValidation = validatePath(payload?.source);
    const destinationValidation = resolveWritablePath(payload?.destination);

    if (!sourceValidation.valid || !isPathAccessible(sourceValidation.resolved)) {
      throw new Error(sourceValidation.error || 'Invalid source path');
    }
    if (!destinationValidation.valid) {
      throw new Error(destinationValidation.error || 'Invalid destination path');
    }

    fs.mkdirSync(path.dirname(destinationValidation.resolved), { recursive: true });

    try {
      fs.renameSync(sourceValidation.resolved, destinationValidation.resolved);
    } catch (error) {
      if (error.code !== 'EXDEV') {
        throw error;
      }
      fs.cpSync(sourceValidation.resolved, destinationValidation.resolved, { recursive: true });
      fs.rmSync(sourceValidation.resolved, { recursive: true, force: false });
    }

    return { source: sourceValidation.resolved, destination: destinationValidation.resolved };
  });

  // open-file-path
  ipcMain.on('open-file-path', (event, filePath) => {
    try {
      const validation = validatePath(filePath);
      if (!validation.valid) {
        console.error('[SECURITY] Invalid file path:', validation.error);
        return;
      }

      if (!isPathAccessible(validation.resolved)) {
        return;
      }

      const stat = fs.statSync(validation.resolved);
      if (stat.size > 50 * 1024 * 1024) return;
      const content = fs.readFileSync(validation.resolved, 'utf-8');
      // Emit set-current-file back to main process so it updates its currentFile variable
      mainWindow.webContents.send('set-current-file', validation.resolved);
      mainWindow.webContents.send('file-opened', { path: validation.resolved, content });
    } catch (err) {
      console.error('open-file-path error:', err);
    }
  });

  // Register sub-modules
  registerGit(currentFileRef);
  registerBinary();
}

module.exports = { register };
