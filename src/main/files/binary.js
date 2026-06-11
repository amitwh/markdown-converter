// src/main/files/binary.js
// Binary file write handler (used by Word .docx export)
const { ipcMain } = require('electron');
const fs = require('fs').promises;

function register() {
  ipcMain.handle('write-buffer', async (_event, { path: filePath, buffer }) => {
    await fs.writeFile(filePath, Buffer.from(buffer));
    return { ok: true };
  });
}

module.exports = { register };
