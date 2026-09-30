/**
 * Preload Script for PanConverter
 *
 * This script creates a secure bridge between the main process and renderer process.
 * It exposes only specific IPC channels, preventing direct Node.js access in the renderer.
 *
 * Security Benefits:
 * - No direct access to Node.js APIs (fs, path, child_process, etc.)
 * - All IPC channels are explicitly whitelisted
 * - Prevents XSS from escalating to full system access
 *
 * @version 4.4.1
 */

const { contextBridge, ipcRenderer, webUtils } = require('electron');

// Define allowed IPC channels for security
const ALLOWED_SEND_CHANNELS = [
  // File operations
  'save-file',
  'save-current-file',
  'set-current-file',
  'save-recent-files',
  'clear-recent-files',
  'renderer-ready',
  'select-custom-css',

  // Theme
  'get-theme',

  // Print
  'do-print',
  'do-print-with-options',

  // Export
  'export-with-options',
  'export-spreadsheet',

  // Plugin export formats
  'plugin-export-formats-registered',
  'plugin-export-format-result',

  // AI Assistant plugin (completions proxied through main; keys stay there)
  'ai-assistant:complete',
  'ai-assistant:status',

  // Inline AI assist confirm helpers
  'ai-assistant:confirm-info',

  // v4.13.0 — Inline AI assist streaming (Cmd+K in editor)
  'ai-assist-stream:start',
  'ai-assist-stream:cancel',

  // v4.13.0 — auto-update (electron-updater)
  'updates:check',
  'updates:install',

  // Batch conversion
  'batch-convert',
  'select-folder',

  // Universal converter
  'universal-convert',
  'universal-convert-batch',

  // Image converter
  'process-image-operation',
  'select-image-folder',
  'batch-image-operation',

  // Audio converter
  'process-audio-operation',
  'batch-audio-operation',

  // Video converter
  'process-video-operation',
  'batch-video-operation',

  // Header/Footer
  'get-header-footer-settings',
  'save-header-footer-settings',
  'browse-header-footer-logo',
  'save-header-footer-logo',
  'clear-header-footer-logo',

  // Word template settings
  'get-word-template-settings',
  'save-word-template-settings',
  'browse-word-template',
  'clear-word-template',

  // Export presets (invoke channels — gated by this same array)
  'get-export-presets',
  'save-export-preset',
  'delete-export-preset',

  // Page settings
  'get-page-settings',
  'update-page-settings',

  // PDF operations
  'process-pdf-operation',
  'get-pdf-page-count',
  'get-pdf-form-fields',
  'get-pdf-capabilities',
  'select-pdf-folder',
  'batch-pdf-operation',

  // ASCII generator (separate window)
  'open-ascii-generator',

  // Flowchart generator (standalone window — v4.9.6)
  'open-flowchart-generator',

  // Flowchart generator: dialog-based file save (v4.12.0)
  'save-text-file',

  // ASCII art generator (standalone window — invoke channels)
  'ascii:generate',
  'ascii:list-fonts',
  'ascii:get-font-meta',
  'ascii:save',
  'ascii:copy',
  'ascii:last-font',

  // Table generator (separate window)
  'open-table-generator',

  // Insert generated content
  'insert-generated-content',

  // Image paste/drop
  'save-pasted-image',

  // Templates
  'load-template',

  // File Explorer
  'list-directory',
  'read-file',
  'write-file',
  'delete-file',
  'ensure-directory',
  'path-exists',
  'is-directory',
  'copy-path',
  'move-path',

  // Git
  'git-status',
  'git-stage',
  'git-commit',
  'git-log',
  'git-branches',
  'git-checkout',
  'git-push',
  'git-pull',

  // Snippets
  'get-snippets',
  'save-snippet',
  'delete-snippet',

  // Code execution (REPL)
  'execute-code',

  // File open by path
  'open-file-path',

  // PDF editor from toolbar
  'show-pdf-editor-from-toolbar',

  // Menu triggers
  'menu-open',
  'export',

  // Git diff
  'git-diff',

  // Plugin settings
  'plugin-settings:get',
  'plugin-settings:set',

  // Monospace font settings
  'get-monospace-settings',
  'set-monospace-settings',

  // Vim keybinding mode
  'get-vim-mode',
  'set-vim-mode',

  // PlantUML local rendering (optional CLI)
  'plantuml:available',
  'plantuml:render',

  // MarkItDown import (optional Python CLI)
  'markitdown:available',
  'markitdown:convert',

  // Quick Note scratchpad
  'quick-note:save',

  // Quick-switcher (Cmd+P workspace file picker)
  'quick-switcher:list-files',
  'recent-files:get',

  // Document version history
  'version-history:list',
  'version-history:read',
  'version-history:save',
  'version-history:delete',

  // Autosave + crash-recovery buffer
  'autosave:write',
  'autosave:read',
  'autosave:clear',
  'autosave:list',

  // Daily notes (one file per local date)
  'daily-notes:open-today',
  'daily-notes:list',

  // Daily-note template gallery
  'daily-templates:list',
  'daily-templates:save',
  'daily-templates:delete',
  'daily-templates:apply',

  // Workspace content search (tag/wikilink-aware)
  'workspace-search:query',

  // Doc-aware Q&A (chunk-level ranking over the workspace)
  'doc-qa:ask',

  // Smart-paste: URL → page title
  'url-title:fetch',
];

const ALLOWED_RECEIVE_CHANNELS = [
  // File operations
  'file-new',
  'file-opened',
  'file-save',
  'get-content-for-save',
  'get-content-for-spreadsheet',
  'recent-files-cleared',
  'load-custom-css',
  'clear-custom-css',

  // UI toggles
  'toggle-preview',
  'toggle-find',

  // Theme
  'theme-changed',
  'theme-data',

  // Edit operations
  'undo',
  'redo',

  // Font
  'adjust-font-size',
  'monospace-setting-change',

  // Print
  'print-preview',
  'print-preview-styled',

  // Export dialogs
  'show-export-dialog',
  'show-batch-dialog',
  'show-universal-converter-dialog',
  'show-table-generator',
  'show-pdf-editor-dialog',
  'show-document-compare',

  // Converter dialogs
  'show-image-converter',
  'show-audio-converter',
  'show-video-converter',

  // PDF viewer
  'open-pdf-viewer',

  // Conversion status
  'conversion-status',
  'conversion-complete',
  'batch-progress',
  'image-conversion-complete',
  'audio-conversion-complete',
  'video-conversion-complete',

  // Batch media operations (Image/Audio/Video Tools dialog batch mode)
  'media-batch-progress',
  'media-batch-complete',

  // Folder selection
  'folder-selected',
  'pdf-folder-selected',
  'image-folder-selected',

  // Header/Footer
  'header-footer-settings-data',
  'header-footer-logo-selected',
  'header-footer-logo-saved',

  // Word template settings
  'word-template-settings-data',
  'word-template-browsed',
  'open-word-template-dialog',

  // Page settings
  'page-settings-data',

  // PDF operations
  'pdf-page-count',
  'pdf-form-fields',
  'pdf-operation-complete',
  'pdf-operation-error',
  'pdf-batch-complete',

  // Table Generator
  'show-table-generator-window',

  // Header/Footer dialog
  'open-header-footer-dialog',
  'header-footer-logo-cleared',

  // PDF operation progress
  'pdf-operation-progress',

  // Insert content from generator windows
  'insert-content',

  // Batch converter
  'show-batch-converter',

  // v4 menu-triggered events
  'load-template-menu',
  'toggle-command-palette',
  'toggle-sidebar-panel',
  'toggle-bottom-panel',

  // v4.13.0 — quick-switcher overlay trigger
  'show-quick-switcher',

  // v4.13.0 — auto-update status events from main
  'updates:status',

  // Plugin export formats
  'run-plugin-export-format',
];

/**
 * Secure API exposed to renderer process
 * Access via window.electronAPI in renderer
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // ============================================
  // SEND METHODS (Renderer -> Main)
  // ============================================

  /**
   * Send a message to the main process
   * @param {string} channel - IPC channel name
   * @param {any} data - Data to send
   */
  send: (channel, data) => {
    if (ALLOWED_SEND_CHANNELS.includes(channel)) {
      ipcRenderer.send(channel, data);
    } else {
      console.warn(`[Preload] Blocked send to unauthorized channel: ${channel}`);
    }
  },

  /**
   * Invoke a main process handler and get a response
   * @param {string} channel - IPC channel name
   * @param {any} data - Data to send
   * @returns {Promise<any>} Response from main process
   */
  invoke: async (channel, data) => {
    if (ALLOWED_SEND_CHANNELS.includes(channel)) {
      return await ipcRenderer.invoke(channel, data);
    } else {
      console.warn(`[Preload] Blocked invoke to unauthorized channel: ${channel}`);
      return null;
    }
  },

  // ============================================
  // RECEIVE METHODS (Main -> Renderer)
  // ============================================

  /**
   * Register a listener for messages from main process
   * @param {string} channel - IPC channel name
   * @param {Function} callback - Function to call with received data
   * @returns {Function} Cleanup function to remove listener
   */
  on: (channel, callback) => {
    if (ALLOWED_RECEIVE_CHANNELS.includes(channel)) {
      const subscription = (event, ...args) => callback(...args);
      ipcRenderer.on(channel, subscription);

      // Return cleanup function
      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    } else {
      console.warn(`[Preload] Blocked listener for unauthorized channel: ${channel}`);
      return () => {}; // No-op cleanup
    }
  },

  /**
   * Register a one-time listener for messages from main process
   * @param {string} channel - IPC channel name
   * @param {Function} callback - Function to call with received data
   */
  once: (channel, callback) => {
    if (ALLOWED_RECEIVE_CHANNELS.includes(channel)) {
      ipcRenderer.once(channel, (event, ...args) => callback(...args));
    } else {
      console.warn(`[Preload] Blocked once listener for unauthorized channel: ${channel}`);
    }
  },

  /**
   * Remove all listeners for a channel
   * @param {string} channel - IPC channel name
   */
  removeAllListeners: (channel) => {
    if (ALLOWED_RECEIVE_CHANNELS.includes(channel)) {
      ipcRenderer.removeAllListeners(channel);
    }
  },

  // ============================================
  // CONVENIENCE METHODS
  // ============================================

  // File Operations
  file: {
    save: (filePath, content) => ipcRenderer.send('save-file', { path: filePath, content }),
    saveCurrent: (content) => ipcRenderer.send('save-current-file', content),
    setCurrent: (filePath) => ipcRenderer.send('set-current-file', filePath),
    saveRecent: (recentFiles) => ipcRenderer.send('save-recent-files', recentFiles),
    clearRecent: () => ipcRenderer.send('clear-recent-files'),
    rendererReady: () => ipcRenderer.send('renderer-ready'),
    read: (filePath) => ipcRenderer.invoke('read-file', filePath),
    write: (filePath, content) => ipcRenderer.invoke('write-file', { path: filePath, content }),
    delete: (filePath) => ipcRenderer.invoke('delete-file', filePath),
    ensureDir: (dirPath) => ipcRenderer.invoke('ensure-directory', dirPath),
    exists: (filePath) => ipcRenderer.invoke('path-exists', filePath),
    isDirectory: (filePath) => ipcRenderer.invoke('is-directory', filePath),
    copy: (source, destination) => ipcRenderer.invoke('copy-path', { source, destination }),
    move: (source, destination) => ipcRenderer.invoke('move-path', { source, destination }),
  },

  // Theme Operations
  theme: {
    get: () => ipcRenderer.send('get-theme'),
  },

  // Print Operations
  print: {
    doPrint: (options) => ipcRenderer.send('do-print', options),
  },

  // Export Operations
  export: {
    withOptions: (format, options) => ipcRenderer.send('export-with-options', { format, options }),
    spreadsheet: (content, format) => ipcRenderer.send('export-spreadsheet', { content, format }),
  },

  // Batch Conversion
  batch: {
    convert: (inputFolder, outputFolder, format, options) => {
      ipcRenderer.send('batch-convert', { inputFolder, outputFolder, format, options });
    },
    selectFolder: (type) => ipcRenderer.send('select-folder', type),
  },

  // Universal Converter
  converter: {
    convert: (tool, fromFormat, toFormat, filePath) => {
      ipcRenderer.send('universal-convert', { tool, fromFormat, toFormat, filePath });
    },
    convertBatch: (tool, fromFormat, toFormat, inputFolder, outputFolder) => {
      ipcRenderer.send('universal-convert-batch', {
        tool,
        fromFormat,
        toFormat,
        inputFolder,
        outputFolder,
      });
    },
  },

  // Header/Footer Operations
  headerFooter: {
    getSettings: () => ipcRenderer.send('get-header-footer-settings'),
    saveSettings: (settings) => ipcRenderer.send('save-header-footer-settings', settings),
    browseLogo: (position) => ipcRenderer.send('browse-header-footer-logo', position),
    saveLogo: (position, filePath) =>
      ipcRenderer.send('save-header-footer-logo', { position, filePath }),
    clearLogo: (position) => ipcRenderer.send('clear-header-footer-logo', position),
  },

  // Page Settings
  page: {
    getSettings: () => ipcRenderer.send('get-page-settings'),
    updateSettings: (settings) => ipcRenderer.send('update-page-settings', settings),
  },

  /**
   * Resolve a File object chosen via `<input type="file">` to its absolute
   * path. `File.path` was removed in Electron 32; `webUtils.getPathForFile`
   * is its replacement. Falls back to `file.path` on older Electron where
   * webUtils is unavailable.
   * @param {File} file - File object from a file input's files list
   * @returns {string | undefined} Absolute filesystem path when resolvable
   */
  getFilePath: (file) => {
    if (webUtils && typeof webUtils.getPathForFile === 'function') {
      return webUtils.getPathForFile(file);
    }
    return file && file.path;
  },

  // PDF Operations
  pdf: {
    processOperation: (data) => ipcRenderer.send('process-pdf-operation', data),
    getPageCount: (filePath) => ipcRenderer.send('get-pdf-page-count', filePath),
    selectFolder: (inputId) => ipcRenderer.send('select-pdf-folder', inputId),
  },

  // Generator Windows
  generators: {
    openAscii: () => ipcRenderer.send('open-ascii-generator'),
    openFlowchart: () => ipcRenderer.send('open-flowchart-generator'),
    openTable: () => ipcRenderer.send('open-table-generator'),
    ascii: {
      listFonts: () => ipcRenderer.invoke('ascii:list-fonts'),
      getFontMeta: (id) => ipcRenderer.invoke('ascii:get-font-meta', id),
      generate: (args) => ipcRenderer.invoke('ascii:generate', args),
      copy: (text) => ipcRenderer.invoke('ascii:copy', text),
      save: (args) => ipcRenderer.invoke('ascii:save', args),
      lastFont: (font) => ipcRenderer.invoke('ascii:last-font', { font }),
    },
  },

  // v4.9.6 — Flowchart Generator standalone window's IO bridge. Reuses the
  // existing thin text-file IPC handlers (get-user-data-path, read-text-file,
  // write-text-file) which sandbox writes to <userData>. Insert at cursor
  // sends the Mermaid-fenced source through the existing 'insert-content'
  // channel which the renderer.js sidebar panel also uses.
  //
  // v4.12.0 — `saveFile` opens a system Save dialog and writes the content
  // to a user-chosen path. Bypasses the userData sandbox (user can save
  // anywhere) — the dialog enforces the destination.
  flowchart: {
    getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
    readFile: (p) => ipcRenderer.invoke('read-text-file', p),
    writeFile: (p, content) => ipcRenderer.invoke('write-text-file', { path: p, content }),
    saveFile: (content, defaultName) =>
      ipcRenderer.invoke('save-text-file', { content, defaultName }),
    insertAtCursor: (text) => ipcRenderer.send('insert-content', text),
  },

  // v4.13.0 — Quick-switcher workspace file listing for the Cmd+P overlay.
  // Returns [{ path, name }] sorted by directory walk order. The renderer's
  // fuzzy matcher (src/quick-switcher/fuzzy-matcher.js) does the ranking.
  quickSwitcher: {
    listFiles: (dir, options) => ipcRenderer.invoke('quick-switcher:list-files', { dir, options }),
    getRecentFiles: () => ipcRenderer.invoke('recent-files:get'),
  },

  // v4.13.0 — Inline AI assist streaming (Cmd+K on selected text).
  // Caller passes {requestId, request}; main streams chunks via
  // onChunk/Done/Error listeners. Callers MUST register listeners before
  // calling start(), because the first chunk can fire on the next tick.
  aiAssist: {
    start: (requestId, request) =>
      ipcRenderer.send('ai-assist-stream:start', { requestId, request }),
    cancel: (requestId) => ipcRenderer.send('ai-assist-stream:cancel', { requestId }),
    onChunk: (cb) => ipcRenderer.on('ai-assist-stream:chunk', (_e, p) => cb(p)),
    onDone: (cb) => ipcRenderer.on('ai-assist-stream:done', (_e, p) => cb(p)),
    onError: (cb) => ipcRenderer.on('ai-assist-stream:error', (_e, p) => cb(p)),
  },

  // v4.13.0 — auto-update controls. Check-now asks main to poll
  // GitHub releases; install-now triggers quitAndInstall. Status events
  // arrive via the generic on('updates:status', cb).
  updates: {
    check: () => ipcRenderer.invoke('updates:check'),
    install: () => ipcRenderer.invoke('updates:install'),
    onStatus: (cb) => ipcRenderer.on('updates:status', (_e, p) => cb(p)),
  },

  // v4.13.0 — Inline AI first-use confirmation. Returns a small
  // user-safe payload (no keys) describing what the AI request will do,
  // for the renderer to surface in a confirm dialog.
  aiAssistant: {
    confirmInfo: () => ipcRenderer.invoke('ai-assistant:confirm-info'),
  },

  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
});

// Log successful preload initialization
console.log('[Preload] Secure IPC bridge initialized');
console.log('[Preload] Allowed send channels:', ALLOWED_SEND_CHANNELS.length);
console.log('[Preload] Allowed receive channels:', ALLOWED_RECEIVE_CHANNELS.length);
