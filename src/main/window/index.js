// src/main/window/index.js
// Main window creation

const { BrowserWindow } = require('electron');
const path = require('path');
const state = require('./state');
const menu = require('../menu');

function createMainWindow() {
  const bounds = state.load();
  const win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      spellcheck: true
    },
    icon: path.join(__dirname, '../../assets/icon.png')
  });

  win.loadFile(path.join(__dirname, '../../index.html'));

  // Show window only after content is ready — avoids blank flash
  win.once('ready-to-show', () => {
    win.show();
  });

  menu.register(win);

  win.on('closed', () => {
    state.save(win);
  });

  // Spell check context menu
  win.webContents.on('context-menu', (event, params) => {
    const { Menu, MenuItem } = require('electron');
    const ctxMenu = new Menu();

    // Add spell check suggestions
    if (params.misspelledWord) {
      for (const suggestion of params.dictionarySuggestions) {
        ctxMenu.append(new MenuItem({
          label: suggestion,
          click: () => win.webContents.replaceMisspelling(suggestion)
        }));
      }
      if (params.dictionarySuggestions.length > 0) {
        ctxMenu.append(new MenuItem({ type: 'separator' }));
      }
      ctxMenu.append(new MenuItem({
        label: 'Add to Dictionary',
        click: () => win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
      }));
      ctxMenu.append(new MenuItem({ type: 'separator' }));
    }

    // Standard context menu items
    ctxMenu.append(new MenuItem({ role: 'cut' }));
    ctxMenu.append(new MenuItem({ role: 'copy' }));
    ctxMenu.append(new MenuItem({ role: 'paste' }));
    ctxMenu.append(new MenuItem({ role: 'selectAll' }));

    ctxMenu.popup();
  });

  // Wait for the page to fully load before sending file data
  win.webContents.on('did-finish-load', () => {
    console.log('Window finished loading');
    // Don't open file here - wait for renderer-ready signal
    // The renderer will send renderer-ready when TabManager is initialized
  });

  return win;
}

module.exports = { createMainWindow };
