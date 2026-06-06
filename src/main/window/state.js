// src/main/window/state.js
// Window state persistence (size, position)

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const stateFile = path.join(app.getPath('userData'), 'window-state.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch {
    return { width: 1200, height: 800 };
  }
}

function save(win) {
  const bounds = win.getBounds();
  try {
    fs.writeFileSync(stateFile, JSON.stringify(bounds));
  } catch {
    /* ignore */
  }
}

module.exports = { load, save };
