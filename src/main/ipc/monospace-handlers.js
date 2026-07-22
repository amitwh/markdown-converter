'use strict';

const { ipcMain } = require('electron');
const store = require('../store');
const { safeMonospaceSettings, DEFAULT_SETTINGS } = require('../settings/monospaceSettings');

function readCurrent() {
  return {
    monospaceFont: store.get('monospaceFont', DEFAULT_SETTINGS.monospaceFont),
    monospaceLigatures: store.get('monospaceLigatures', DEFAULT_SETTINGS.monospaceLigatures),
  };
}

function register() {
  ipcMain.handle('get-monospace-settings', () => readCurrent());

  ipcMain.handle('set-monospace-settings', (_event, partial) => {
    const safe = safeMonospaceSettings(partial || {});
    if (Object.prototype.hasOwnProperty.call(partial || {}, 'monospaceFont')) {
      store.set('monospaceFont', safe.monospaceFont);
    }
    if (Object.prototype.hasOwnProperty.call(partial || {}, 'monospaceLigatures')) {
      store.set('monospaceLigatures', safe.monospaceLigatures);
    }
    return readCurrent();
  });
}

module.exports = { register, readCurrent };
