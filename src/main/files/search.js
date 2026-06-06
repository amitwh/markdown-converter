// src/main/files/search.js
// File search + basic list ops
const fs = require('fs');
const path = require('path');

async function listDirectory(dirPath) {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries.map((dirent) => {
      const fullPath = path.join(dirPath, dirent.name);
      let size;
      let modifiedAt;
      if (!dirent.isDirectory()) {
        try {
          const stat = fs.statSync(fullPath);
          size = stat.size;
          modifiedAt = stat.mtime.toISOString();
        } catch {
          // ignore stat errors
        }
      }
      return {
        name: dirent.name,
        path: fullPath,
        isDirectory: dirent.isDirectory(),
        size,
        modifiedAt,
      };
    });
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = { listDirectory };