// src/main/store.js
// Simple JSON-file preferences store (replaces electron-store)

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const settingsPath = path.join(app.getPath('userData'), 'settings.json');

const store = {
  get(key, defaultValue) {
    try {
      const data = fs.readFileSync(settingsPath, 'utf-8');
      const settings = JSON.parse(data);
      return settings[key] !== undefined ? settings[key] : defaultValue;
    } catch {
      return defaultValue;
    }
  },
  set(key, value) {
    let settings = {};
    try {
      const data = fs.readFileSync(settingsPath, 'utf-8');
      settings = JSON.parse(data);
    } catch {}
    settings[key] = value;
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  },
};

module.exports = store;
