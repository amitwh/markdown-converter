// src/main/window/index.js
// Main window creation

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const state = require('./state');
const menu = require('../menu');

function createMainWindow() {
  const bounds = state.load();
  const isDev = !!process.env.VITE_DEV_SERVER_URL;
  const win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    show: true,
    title: `Markdown Converter${isDev ? ' — React Dev' : ''}`,
    webPreferences: {
      // The preload script exposes `window.electronAPI` — the only IPC
      // bridge the renderer uses. Without this, every renderer call returns
      // CHANNEL_MISSING and file/folder/save all silently no-op.
      preload: path.join(__dirname, '../../preload.js'),
      // contextIsolation MUST be true for the preload's contextBridge
      // exposeInMainWorld call to succeed. Without it, the preload throws
      // on load and the renderer never gets the IPC bridge.
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
    icon: path.join(__dirname, '../../../assets/icon.png'),
  });

  // Dev (Vite): load the running dev server so .tsx is transformed on the fly.
  // Production (running from dist/ directly): load the built renderer at the
  //   relative path from this file.
  // Production (packaged installer build): the renderer ships under
  //   process.resourcesPath/renderer (configured via build.extraResources in
  //   package.json) — not inside the asar.
  // VITE_DEV_SERVER_URL is set by `npm run dev` via cross-env.
  // app.isPackaged is set by electron-builder for installer builds.
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (!app.isPackaged && devServerUrl) {
    console.log('[WINDOW] Dev mode — loading', devServerUrl);
    win.loadURL(devServerUrl);
  } else {
    const rendererIndex = app.isPackaged
      ? path.join(process.resourcesPath, 'renderer', 'index.html')
      : path.join(__dirname, '../../../dist/renderer/index.html');

    if (app.isPackaged) {
      try {
        fs.accessSync(rendererIndex);
      } catch {
        console.error(
          '[WINDOW] Renderer not found at',
          rendererIndex,
          '— did you run `npm run build:renderer` before packaging?'
        );
      }
    }

    console.log('[WINDOW] Production mode — loading', rendererIndex);
    win.loadFile(rendererIndex);
  }

  // Show window only after content is ready — avoids blank flash
  win.once('ready-to-show', () => {
    win.show();
  });

  menu.register(win);

  // Use 'close' (fires before destruction) — 'closed' fires after the
  // BrowserWindow object is destroyed, so getBounds() would throw.
  win.on('close', () => {
    if (!win.isDestroyed()) state.save(win);
  });

  // Spell check context menu
  win.webContents.on('context-menu', (event, params) => {
    const { Menu, MenuItem } = require('electron');
    const ctxMenu = new Menu();

    // Add spell check suggestions
    if (params.misspelledWord) {
      for (const suggestion of params.dictionarySuggestions) {
        ctxMenu.append(
          new MenuItem({
            label: suggestion,
            click: () => win.webContents.replaceMisspelling(suggestion),
          })
        );
      }
      if (params.dictionarySuggestions.length > 0) {
        ctxMenu.append(new MenuItem({ type: 'separator' }));
      }
      ctxMenu.append(
        new MenuItem({
          label: 'Add to Dictionary',
          click: () =>
            win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
        })
      );
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
