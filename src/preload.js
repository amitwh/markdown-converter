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
 * @version 2.2.0
 */

const { contextBridge, ipcRenderer } = require('electron');

// Define allowed IPC channels for security
const ALLOWED_SEND_CHANNELS = [
  // File operations
  'save-file',
  'save-current-file',
  'set-current-file',
  'save-recent-files',
  'clear-recent-files',
  'renderer-ready',

  // Theme
  'get-theme',

  // Print
  'do-print',

  // Export
  'export-with-options',
  'export-spreadsheet',

  // Batch conversion
  'batch-convert',
  'select-folder',

  // Universal converter
  'universal-convert',
  'universal-convert-batch',

  // Image converter
  'image-convert',
  'image-batch-convert',
  'image-resize',
  'image-compress',
  'image-rotate',

  // Audio converter
  'audio-convert',
  'audio-batch-convert',
  'audio-extract',
  'audio-trim',
  'audio-merge',

  // Video converter
  'video-convert',
  'video-batch-convert',
  'video-compress',
  'video-trim',
  'video-frames',
  'video-gif',

  // Header/Footer
  'get-header-footer-settings',
  'save-header-footer-settings',
  'browse-header-footer-logo',
  'save-header-footer-logo',
  'clear-header-footer-logo',

  // Page settings
  'get-page-settings',
  'update-page-settings',

  // Template settings
  'set-custom-start-page',

  // PDF operations
  'process-pdf-operation',
  'get-pdf-page-count',
  'select-pdf-folder',

  // ASCII generator (separate window)
  'open-ascii-generator',

  // Table generator (separate window)
  'open-table-generator',

  // Insert generated content
  'insert-generated-content'
];

const ALLOWED_RECEIVE_CHANNELS = [
  // File operations
  'file-new',
  'file-opened',
  'file-save',
  'get-content-for-save',
  'get-content-for-spreadsheet',
  'recent-files-cleared',

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

  // Print
  'print-preview',
  'print-preview-styled',

  // Export dialogs
  'show-export-dialog',
  'show-batch-dialog',
  'show-universal-converter-dialog',
  'show-table-generator',
  'show-pdf-editor-dialog',

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

  // Folder selection
  'folder-selected',
  'pdf-folder-selected',

  // Header/Footer
  'header-footer-settings-data',
  'header-footer-logo-selected',
  'header-footer-logo-saved',

  // Page settings
  'page-settings-data',

  // PDF operations
  'pdf-page-count',
  'pdf-operation-complete',
  'pdf-operation-error',

  // ASCII Art Generator
  'show-ascii-generator-window',
  'show-ascii-generator',

  // Table Generator
  'show-table-generator-window',

  // Header/Footer dialog
  'open-header-footer-dialog',
  'header-footer-logo-cleared',

  // PDF operation progress
  'pdf-operation-progress',

  // Insert content from generator windows
  'insert-content'
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
    rendererReady: () => ipcRenderer.send('renderer-ready')
  },

  // Theme Operations
  theme: {
    get: () => ipcRenderer.send('get-theme')
  },

  // Print Operations
  print: {
    doPrint: (options) => ipcRenderer.send('do-print', options)
  },

  // Export Operations
  export: {
    withOptions: (format, options) => ipcRenderer.send('export-with-options', { format, options }),
    spreadsheet: (content, format) => ipcRenderer.send('export-spreadsheet', { content, format })
  },

  // Batch Conversion
  batch: {
    convert: (inputFolder, outputFolder, format, options) => {
      ipcRenderer.send('batch-convert', { inputFolder, outputFolder, format, options });
    },
    selectFolder: (type) => ipcRenderer.send('select-folder', type)
  },

  // Universal Converter
  converter: {
    convert: (tool, fromFormat, toFormat, filePath) => {
      ipcRenderer.send('universal-convert', { tool, fromFormat, toFormat, filePath });
    },
    convertBatch: (tool, fromFormat, toFormat, inputFolder, outputFolder) => {
      ipcRenderer.send('universal-convert-batch', { tool, fromFormat, toFormat, inputFolder, outputFolder });
    }
  },

  // Header/Footer Operations
  headerFooter: {
    getSettings: () => ipcRenderer.send('get-header-footer-settings'),
    saveSettings: (settings) => ipcRenderer.send('save-header-footer-settings', settings),
    browseLogo: (position) => ipcRenderer.send('browse-header-footer-logo', position),
    saveLogo: (position, filePath) => ipcRenderer.send('save-header-footer-logo', { position, filePath }),
    clearLogo: (position) => ipcRenderer.send('clear-header-footer-logo', position)
  },

  // Page Settings
  page: {
    getSettings: () => ipcRenderer.send('get-page-settings'),
    updateSettings: (settings) => ipcRenderer.send('update-page-settings', settings),
    setCustomStartPage: (pageNumber) => ipcRenderer.send('set-custom-start-page', pageNumber)
  },

  // PDF Operations
  pdf: {
    processOperation: (data) => ipcRenderer.send('process-pdf-operation', data),
    getPageCount: (filePath) => ipcRenderer.send('get-pdf-page-count', filePath),
    selectFolder: (inputId) => ipcRenderer.send('select-pdf-folder', inputId)
  },

  // Image Converter Operations
  image: {
    convert: (data) => ipcRenderer.send('image-convert', data),
    batchConvert: (data) => ipcRenderer.send('image-batch-convert', data),
    resize: (data) => ipcRenderer.send('image-resize', data),
    compress: (data) => ipcRenderer.send('image-compress', data),
    rotate: (data) => ipcRenderer.send('image-rotate', data)
  },

  // Audio Converter Operations
  audio: {
    convert: (data) => ipcRenderer.send('audio-convert', data),
    batchConvert: (data) => ipcRenderer.send('audio-batch-convert', data),
    extract: (data) => ipcRenderer.send('audio-extract', data),
    trim: (data) => ipcRenderer.send('audio-trim', data),
    merge: (data) => ipcRenderer.send('audio-merge', data)
  },

  // Video Converter Operations
  video: {
    convert: (data) => ipcRenderer.send('video-convert', data),
    batchConvert: (data) => ipcRenderer.send('video-batch-convert', data),
    compress: (data) => ipcRenderer.send('video-compress', data),
    trim: (data) => ipcRenderer.send('video-trim', data),
    extractFrames: (data) => ipcRenderer.send('video-frames', data),
    toGif: (data) => ipcRenderer.send('video-gif', data)
  },

  // Generator Windows
  generators: {
    openAscii: () => ipcRenderer.send('open-ascii-generator'),
    openTable: () => ipcRenderer.send('open-table-generator')
  }
});

// Log successful preload initialization
console.log('[Preload] Secure IPC bridge initialized');
console.log('[Preload] Allowed send channels:', ALLOWED_SEND_CHANNELS.length);
console.log('[Preload] Allowed receive channels:', ALLOWED_RECEIVE_CHANNELS.length);
