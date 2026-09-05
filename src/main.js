const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const WordTemplateExporter = require('./wordTemplateExporter');
const PDFOperations = require('./main/PDFOperations');
const ImageOperations = require('./main/ImageOperations');
const AudioOperations = require('./main/AudioOperations');
const VideoOperations = require('./main/VideoOperations');
const { collectFilesByExtension } = require('./main/collectFilesByExtension');
const { runPDFBatchOperation } = require('./main/PDFBatchOperations');
const GitOperations = require('./main/GitOperations');
const PandocArgs = require('./main/PandocArgs');
const PdfFontHeader = require('./main/PdfFontHeader');
const MonospaceFontConfig = require('./main/MonospaceFontConfig');
const ExportCss = require('./main/ExportCss');
const ExportPresets = require('./main/ExportPresets');
const EpubFontEmbedder = require('./main/EpubFontEmbedder');
const DocxFontEmbedder = require('./main/DocxFontEmbedder');

// Add MiKTeX to PATH for LaTeX support
if (process.platform === 'win32') {
  const miktexPath = 'C:\\Program Files\\MiKTeX\\miktex\\bin\\x64';
  if (fs.existsSync(miktexPath)) {
    process.env.PATH = `${miktexPath};${process.env.PATH}`;
  }
}

// Returns path to pandoc: bundled binary when packaged, dev bin or system fallback otherwise.
function getPandocPath() {
  if (app.isPackaged) {
    const ext = process.platform === 'win32' ? '.exe' : '';
    return path.join(process.resourcesPath, 'bin', `pandoc${ext}`);
  }
  // Development: prefer locally-downloaded binary in bin/<platform>/
  const devBin = path.join(
    __dirname,
    '..',
    'bin',
    process.platform,
    process.platform === 'win32' ? 'pandoc.exe' : 'pandoc'
  );
  if (fs.existsSync(devBin)) return devBin;
  return 'pandoc';
}

// Returns path to ffmpeg: asar-unpacked bundled binary when packaged, system fallback otherwise.
function getFFmpegPath() {
  try {
    let ffmpegPath = require('ffmpeg-static');
    if (app.isPackaged) {
      // ffmpeg-static is in asarUnpack — rewrite the path to the unpacked location
      ffmpegPath = ffmpegPath.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
    }
    if (fs.existsSync(ffmpegPath)) return ffmpegPath;
  } catch {
    /* ffmpeg-static not available */
  }
  return process.platform === 'win32' ? 'ffmpeg' : 'ffmpeg';
}

// File size validation
const MAX_FILE_SIZE_MB = 50;
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;

// Sanitize error messages to strip absolute file paths
function sanitizeErrorMessage(message) {
  if (typeof message !== 'string') return String(message);
  // Strip absolute Windows paths, keeping only filename
  return message
    .replace(/[A-Z]:\\[^\s"']+\\([^\s"'\\]+)/gi, '$1')
    .replace(/\/[^\s"']+\/([^\s"'/]+)/g, '$1');
}

// Rate limiter for conversions
function createRateLimiter(minIntervalMs = 2000) {
  let lastCall = 0;
  return function canProceed() {
    const now = Date.now();
    if (now - lastCall < minIntervalMs) return false;
    lastCall = now;
    return true;
  };
}
const conversionLimiter = createRateLimiter(2000);

// ============================================
// Path Traversal Protection
// ============================================
/**
 * Validates that a file path is safe and doesn't attempt path traversal
 * @param {string} filePath - The path to validate
 * @returns {{ valid: boolean, resolved: string, error?: string }}
 */
function validatePath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return {
      valid: false,
      resolved: '',
      error: 'Invalid path',
    };
  }

  // Resolve to absolute path (handles .., ., symlinks)
  let resolved;
  try {
    resolved = path.resolve(filePath);
  } catch {
    return {
      valid: false,
      resolved: '',
      error: 'Invalid path format',
    };
  }

  // Normalize path separators
  resolved = path.normalize(resolved);

  // Check for null bytes (path injection)
  if (resolved.includes('\0')) {
    return {
      valid: false,
      resolved: '',
      error: 'Null byte in path',
    };
  }

  // Check if path exists
  if (!fs.existsSync(resolved)) {
    return {
      valid: false,
      resolved,
      error: 'Path does not exist',
    };
  }
  return {
    valid: true,
    resolved,
  };
}

/**
 * Resolves a path for operations where the target may not exist yet.
 * Validates string shape and blocks obviously sensitive locations.
 * @param {string} filePath
 * @returns {{ valid: boolean, resolved: string, error?: string }}
 */
function resolveWritablePath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return {
      valid: false,
      resolved: '',
      error: 'Invalid path',
    };
  }
  let resolved;
  try {
    resolved = path.normalize(path.resolve(filePath));
  } catch {
    return {
      valid: false,
      resolved: '',
      error: 'Invalid path format',
    };
  }
  if (resolved.includes('\0')) {
    return {
      valid: false,
      resolved: '',
      error: 'Null byte in path',
    };
  }
  if (!isPathAccessible(resolved)) {
    return {
      valid: false,
      resolved,
      error: 'Path is not accessible',
    };
  }
  return {
    valid: true,
    resolved,
  };
}

/**
 * Checks if a resolved path is within allowed directories
 * For an editor app, we allow access to all user-accessible paths
 * but log any suspicious access attempts
 * @param {string} resolvedPath - The resolved absolute path
 * @returns {boolean}
 */
function isPathAccessible(resolvedPath) {
  // Block access to sensitive system directories
  const blockedPaths = [
    '/etc/passwd',
    '/etc/shadow',
    '/root',
    'C:\\Windows\\System32',
    'C:\\Windows\\System',
    '/System',
    '/private/etc',
  ];
  const normalizedPath = resolvedPath.toLowerCase();
  for (const blocked of blockedPaths) {
    if (normalizedPath.startsWith(blocked.toLowerCase())) {
      console.warn('[SECURITY] Blocked access to sensitive path:', resolvedPath);
      return false;
    }
  }
  return true;
}

// Convert structured data formats to markdown code blocks
function convertDataToMarkdown(content, format) {
  switch (format) {
    case 'json':
      return '```json\n' + content + '\n```';
    case 'yaml':
    case 'yml':
      return '```yaml\n' + content + '\n```';
    case 'xml':
      return '```xml\n' + content + '\n```';
    case 'toml':
      return '```toml\n' + content + '\n```';
    default:
      return '```\n' + content + '\n```';
  }
}

/**
 * Run Pandoc with an explicit argument array via execFile.
 * Args must be built with the PandocArgs helpers (or plain Array.push) — never
 * assembled into a command string, so user-controlled values always reach the
 * process as single literal argv elements (SEC-1).
 * @param {string[]} args - Argument array (without the pandoc executable)
 * @param {Function} callback - Callback function (error, stdout, stderr)
 */
function runPandocArgs(args, callback) {
  execFile(
    getPandocPath(),
    args,
    {
      maxBuffer: 10 * 1024 * 1024,
    },
    callback
  );
}

// Simple storage implementation to replace electron-store
const settingsPath = path.join(app.getPath('userData'), 'settings.json');
const store = {
  get: (key, defaultValue) => {
    try {
      const data = fs.readFileSync(settingsPath, 'utf-8');
      const settings = JSON.parse(data);
      return settings[key] || defaultValue;
    } catch {
      return defaultValue;
    }
  },
  set: (key, value) => {
    let settings = {};
    try {
      const data = fs.readFileSync(settingsPath, 'utf-8');
      settings = JSON.parse(data);
    } catch {}
    settings[key] = value;
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    _cachedSettings = null;
  },
};

// Cached read of the on-disk settings.json with monospace defaults applied.
// Invalidated by store.set.
let _cachedSettings = null;
function readSettingsJsonCached() {
  if (_cachedSettings) return _cachedSettings;
  try {
    _cachedSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  } catch {
    _cachedSettings = {};
  }
  _cachedSettings.monospaceFont = _cachedSettings.monospaceFont || 'jetbrains-mono';
  _cachedSettings.monospaceLigatures = _cachedSettings.monospaceLigatures === true;
  return _cachedSettings;
}

// Build a monospace font header (.tex) for xelatex/lualatex from current settings.
// Returns null when the bundled font is unavailable — callers should fall back to defaults.
function buildMonospaceHeaderFile() {
  const s = readSettingsJsonCached();
  const familyKey = s.monospaceFont || 'jetbrains-mono';
  const monoFontPath = MonospaceFontConfig.getMonoFontTtfPath(familyKey, 400);
  const monoBoldPath = MonospaceFontConfig.getMonoFontTtfPath(familyKey, 700);
  const tex = PdfFontHeader.build({
    fontTtfPath: monoFontPath,
    boldTtfPath: monoBoldPath,
    ligatures: !!s.monospaceLigatures,
  });
  const headerFile = path.join(os.tmpdir(), `monospace-pdf-${Date.now()}-${process.pid}.tex`);
  fs.writeFileSync(headerFile, tex, 'utf-8');
  return headerFile;
}

// Build a self-contained CSS fragment for HTML/EPUB exports that embeds
// the active monospace font as a base64 data URI. Returns a string with a
// trailing newline suitable for either inline injection or a temp file.
function buildMonospaceExportCss() {
  const s = readSettingsJsonCached();
  const familyKey = s.monospaceFont || 'jetbrains-mono';
  const family = familyKey === 'fira-code' ? 'Fira Code' : 'JetBrains Mono';
  const monoFontPath = MonospaceFontConfig.getMonoFontTtfPath(familyKey, 400);
  return ExportCss.build({
    activeFontPath: monoFontPath,
    family,
    weight: 400,
    ligatures: !!s.monospaceLigatures,
  });
}

// Plugin settings IPC handlers
ipcMain.handle('plugin-settings:get', (_event, key) => {
  return store.get(key);
});
ipcMain.handle('plugin-settings:set', (_event, { key, value }) => {
  store.set(key, value);
});

// Monospace settings IPC — consumed by the renderer to apply CSS classes
// and to feed the PrintPreview overlay. Returns the full settings object so
// defaults are applied centrally here.
ipcMain.handle('get-monospace-settings', () => {
  const s = readSettingsJsonCached();
  return {
    monospaceFont: s.monospaceFont || 'jetbrains-mono',
    monospaceLigatures: s.monospaceLigatures === true,
  };
});
ipcMain.handle('set-monospace-settings', (_event, partial) => {
  const safe = partial && typeof partial === 'object' ? partial : {};
  if (safe.monospaceFont !== undefined) {
    store.set('monospaceFont', safe.monospaceFont);
  }
  if (safe.monospaceLigatures !== undefined) {
    store.set('monospaceLigatures', safe.monospaceLigatures === true);
  }
  return {
    monospaceFont: store.get('monospaceFont', 'jetbrains-mono'),
    monospaceLigatures: store.get('monospaceLigatures', true),
  };
});

// Vim keybinding mode — same read/toggle/persist flow as the monospace font
ipcMain.handle('get-vim-mode', () => store.get('vimMode', false) === true);
ipcMain.handle('set-vim-mode', (_event, enabled) => {
  store.set('vimMode', enabled === true);
  return enabled === true;
});
ipcMain.handle('get-app-version', () => app.getVersion());

// ============================================
// SECURITY: Permission Request Handler
// ============================================
// Restrict permissions to only those explicitly needed.
// Deny: camera, microphone, geolocation, notifications, etc.
// Allow: clipboard-read, clipboard-write (user expects these)
app.on('web-contents-created', (event, contents) => {
  contents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    const ALLOWED_PERMISSIONS = ['clipboard-read', 'clipboard-write'];
    if (ALLOWED_PERMISSIONS.includes(permission)) {
      callback(true);
    } else {
      // Deny all other permissions (camera, microphone, geolocation, etc.)
      console.warn(`[Security] Blocked permission request: ${permission}`);
      callback(false);
    }
  });

  // Disable file download dialogs for security
  // contents.session.setDownloadPath(userDownloadsPath);
});
let mainWindow;
let currentFile = null; // This will now represent the active tab's file
let pandocAvailable = null; // Cache pandoc availability check
let pandocVersionCache = null; // Cached parsed { major, minor } from `pandoc --version`
let wordTemplatePath = null; // Path to selected Word template
let templateStartPage = 3; // Which page to start inserting content (default: page 3)
let rendererReady = false; // Track if renderer is ready to receive file data
let pluginExportFormats = []; // Export formats registered by plugins: [{ id, label, extension }]

// Header & Footer Settings
let headerFooterSettings = {
  enabled: true,
  header: {
    left: '',
    center: '',
    right: '',
    logo: null, // Will store image file path
  },
  footer: {
    left: '',
    center: '$PAGE$ of $TOTAL$',
    right: '',
    logo: null,
  },
};

// Page Size Definitions (in twentieths of a point for Word, mm/inches for Pandoc)
const PAGE_SIZES = {
  a4: {
    name: 'A4',
    pandoc: 'a4',
    word: {
      width: 11906,
      height: 16838,
    },
    // 210×297mm
    dimensions: '210×297mm',
  },
  a3: {
    name: 'A3',
    pandoc: 'a3',
    word: {
      width: 16838,
      height: 23811,
    },
    // 297×420mm
    dimensions: '297×420mm',
  },
  a5: {
    name: 'A5',
    pandoc: 'a5',
    word: {
      width: 8391,
      height: 11906,
    },
    // 148×210mm
    dimensions: '148×210mm',
  },
  b4: {
    name: 'B4',
    pandoc: 'b4',
    word: {
      width: 14170,
      height: 20015,
    },
    // 250×353mm
    dimensions: '250×353mm',
  },
  b5: {
    name: 'B5',
    pandoc: 'b5',
    word: {
      width: 9979,
      height: 14170,
    },
    // 176×250mm
    dimensions: '176×250mm',
  },
  letter: {
    name: 'Letter',
    pandoc: 'letter',
    word: {
      width: 12240,
      height: 15840,
    },
    // 8.5×11in
    dimensions: '8.5×11in',
  },
  legal: {
    name: 'Legal',
    pandoc: 'legal',
    word: {
      width: 12240,
      height: 20160,
    },
    // 8.5×14in
    dimensions: '8.5×14in',
  },
  tabloid: {
    name: 'Tabloid',
    pandoc: 'tabloid',
    word: {
      width: 15840,
      height: 24480,
    },
    // 11×17in
    dimensions: '11×17in',
  },
};

// Default page settings
let pageSettings = {
  size: 'a4',
  orientation: 'portrait',
  customWidth: null,
  customHeight: null,
};

// Handle single instance lock for Windows file association
// When a file is double-clicked and the app is already running,
// Windows tries to start a second instance. We prevent this and
// pass the file to the existing instance instead.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  // Another instance is already running, quit this one
  app.quit();
} else {
  // This is the first instance, handle second-instance events
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, focus our window instead
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }

    // Deep link: markdownconverter://open?path=<encoded absolute path>
    // (Windows/Linux deliver protocol URLs through the command line)
    const deepLink = commandLine.find((arg) => arg.startsWith('markdownconverter://'));
    if (deepLink && handleDeepLink(deepLink)) return;

    // Check if a file was passed to the second instance
    // commandLine is an array like: ['PanConverter.exe', 'file.md']

    const startIndex = app.isPackaged ? 1 : 2;
    const fileArgs = commandLine.slice(startIndex);
    for (const arg of fileArgs) {
      if (arg.endsWith('.md') || arg.endsWith('.markdown')) {
        const resolvedPath = path.isAbsolute(arg) ? arg : path.resolve(workingDirectory, arg);
        if (fs.existsSync(resolvedPath)) {
          // Open the file in the existing instance
          if (rendererReady) {
            openFileFromPath(resolvedPath);
          } else {
            app.pendingFile = resolvedPath;
          }
          break;
        }
      }
    }
  });
}

// Check if pandoc is available (using execFile for consistency)
function checkPandocAvailability() {
  return new Promise((resolve) => {
    if (pandocAvailable !== null) {
      resolve(pandocAvailable);
      return;
    }
    execFile('pandoc', ['--version'], (error, stdout, _stderr) => {
      pandocAvailable = !error;
      if (!error) {
        const m = String(stdout).match(/pandoc\s+(\d+)\.(\d+)/);
        pandocVersionCache = m
          ? { major: Number(m[1]), minor: Number(m[2]) }
          : { major: 0, minor: 0 };
      } else {
        pandocVersionCache = { major: 0, minor: 0 };
      }
      resolve(pandocAvailable);
    });
  });
}

// Returns cached parsed pandoc version as { major, minor }.
// Falls back to {0,0} when pandoc is missing — callers must treat that as "unsupported".
function getPandocVersion() {
  return pandocVersionCache || { major: 0, minor: 0 };
}

// --epub-embed-font was added in Pandoc 2.11.
function pandocSupportsEpubEmbedFont() {
  const v = getPandocVersion();
  return v.major > 2 || (v.major === 2 && v.minor >= 11);
}
exports.pandocSupportsEpubEmbedFont = pandocSupportsEpubEmbedFont;
exports.getPandocVersion = getPandocVersion;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      spellcheck: true,
    },
    icon: path.join(__dirname, '../assets/icon.png'),
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Show window only after content is ready — avoids blank flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
  createMenu();
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Spell check context menu
  mainWindow.webContents.on('context-menu', (event, params) => {
    const { Menu, MenuItem } = require('electron');
    const menu = new Menu();

    // Add spell check suggestions
    if (params.misspelledWord) {
      for (const suggestion of params.dictionarySuggestions) {
        menu.append(
          new MenuItem({
            label: suggestion,
            click: () => mainWindow.webContents.replaceMisspelling(suggestion),
          })
        );
      }
      if (params.dictionarySuggestions.length > 0) {
        menu.append(
          new MenuItem({
            type: 'separator',
          })
        );
      }
      menu.append(
        new MenuItem({
          label: 'Add to Dictionary',
          click: () =>
            mainWindow.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
        })
      );
      menu.append(
        new MenuItem({
          type: 'separator',
        })
      );
    }

    // Standard context menu items
    menu.append(
      new MenuItem({
        role: 'cut',
      })
    );
    menu.append(
      new MenuItem({
        role: 'copy',
      })
    );
    menu.append(
      new MenuItem({
        role: 'paste',
      })
    );
    menu.append(
      new MenuItem({
        role: 'selectAll',
      })
    );
    menu.popup();
  });

  // Wait for the page to fully load before sending file data
  mainWindow.webContents.on('did-finish-load', () => {});
}
function buildRecentFilesMenu() {
  const recentFiles = getRecentFiles();
  if (recentFiles.length === 0) {
    return [
      {
        label: 'No recent files',
        enabled: false,
      },
    ];
  }
  const recentFileItems = recentFiles.map((filePath) => ({
    label: filePath.split(/[\\/]/).pop(),
    // Get filename only
    click: () => {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        if (stats.size > MAX_FILE_SIZE) {
          dialog.showErrorBox(
            'File Too Large',
            `File exceeds the ${MAX_FILE_SIZE_MB}MB size limit.`
          );
          return;
        }
        currentFile = filePath;
        const content = fs.readFileSync(filePath, 'utf-8');
        mainWindow.webContents.send('file-opened', {
          path: filePath,
          content,
        });
      } else {
        dialog.showErrorBox(
          'File Not Found',
          sanitizeErrorMessage(`The file "${filePath}" could not be found.`)
        );
      }
    },
    toolTip: filePath, // Show full path in tooltip
  }));
  return [
    ...recentFileItems,
    {
      type: 'separator',
    },
    {
      label: 'Clear Recent Files',
      click: () => {
        try {
          clearRecentFilesOnDisk();
          mainWindow.webContents.send('recent-files-cleared');
        } catch (error) {
          console.error('Error clearing recent files:', error);
        }
      },
    },
  ];
}
function getRecentFiles() {
  try {
    const recentFiles = JSON.parse(
      fs.readFileSync(path.join(app.getPath('userData'), 'recent-files.json'), 'utf-8')
    );
    return recentFiles.filter((file) => fs.existsSync(file));
  } catch {
    return [];
  }
}
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow.webContents.send('file-new'),
        },
        {
          label: 'Open',
          accelerator: 'CmdOrCtrl+O',
          click: openFile,
        },
        {
          label: 'Open PDF',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: openPdfFile,
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow.webContents.send('file-save'),
        },
        {
          label: 'Save As',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: saveAsFile,
        },
        {
          type: 'separator',
        },
        {
          label: 'Print',
          submenu: [
            {
              label: 'Print Preview',
              accelerator: 'CmdOrCtrl+P',
              click: () => mainWindow.webContents.send('print-preview'),
            },
            {
              label: 'Print Preview (With Styles)',
              click: () => mainWindow.webContents.send('print-preview-styled'),
            },
          ],
        },
        {
          type: 'separator',
        },
        {
          label: 'Recent Files',
          submenu: buildRecentFilesMenu(),
        },
        {
          type: 'separator',
        },
        {
          label: 'New from Template',
          submenu: [
            {
              label: 'Blog Post',
              click: () => mainWindow.webContents.send('load-template-menu', 'blog-post.md'),
            },
            {
              label: 'Meeting Notes',
              click: () => mainWindow.webContents.send('load-template-menu', 'meeting-notes.md'),
            },
            {
              label: 'Technical Spec',
              click: () => mainWindow.webContents.send('load-template-menu', 'technical-spec.md'),
            },
            {
              label: 'Changelog',
              click: () => mainWindow.webContents.send('load-template-menu', 'changelog.md'),
            },
            {
              label: 'README',
              click: () => mainWindow.webContents.send('load-template-menu', 'readme.md'),
            },
            {
              label: 'Project Plan',
              click: () => mainWindow.webContents.send('load-template-menu', 'project-plan.md'),
            },
            {
              label: 'API Documentation',
              click: () => mainWindow.webContents.send('load-template-menu', 'api-docs.md'),
            },
            {
              label: 'Tutorial',
              click: () => mainWindow.webContents.send('load-template-menu', 'tutorial.md'),
            },
            {
              label: 'Release Notes',
              click: () => mainWindow.webContents.send('load-template-menu', 'release-notes.md'),
            },
            {
              label: 'Comparison',
              click: () => mainWindow.webContents.send('load-template-menu', 'comparison.md'),
            },
          ],
        },
        {
          type: 'separator',
        },
        {
          label: 'Import Document...',
          accelerator: 'CmdOrCtrl+I',
          click: importDocument,
        },
        {
          // Microsoft MarkItDown: any file → Markdown (PDF/DOCX/PPTX/XLSX/
          // MSG/EPUB/images/ZIP/…, audio/OCR with the [all] extras)
          label: 'Import with MarkItDown (Any Format)...',
          click: importWithMarkItDown,
        },
        {
          label: 'Export',
          submenu: [
            {
              label: 'HTML',
              click: () => exportFile('html'),
            },
            {
              label: 'PDF',
              click: () => exportFile('pdf'),
            },
            {
              label: 'PDF (Enhanced)',
              click: () => exportPDFViaWordTemplate(),
              // Ctrl+Shift+P is the Command Palette; use Alt to avoid the collision
              accelerator: 'Ctrl+Alt+Shift+P',
            },
            {
              label: 'DOCX',
              click: () => exportFile('docx'),
            },
            {
              label: 'DOCX (Enhanced)',
              click: () => exportWordWithTemplate(),
              accelerator: 'Ctrl+Shift+W',
            },
            {
              label: 'LaTeX',
              click: () => exportFile('latex'),
            },
            {
              label: 'RTF',
              click: () => exportFile('rtf'),
            },
            {
              label: 'ODT',
              click: () => exportFile('odt'),
            },
            {
              label: 'EPUB',
              click: () => exportFile('epub'),
            },
            {
              type: 'separator',
            },
            {
              label: 'PowerPoint (PPTX)',
              click: () => exportFile('pptx'),
            },
            {
              label: 'OpenDocument Presentation (ODP)',
              click: () => exportFile('odp'),
            },
            {
              type: 'separator',
            },
            {
              label: 'CSV (Tables)',
              click: () => exportSpreadsheet('csv'),
            },
            {
              label: 'Excel Spreadsheet (.xlsx)',
              click: () => exportSpreadsheet('xlsx'),
            },
            {
              type: 'separator',
            },
            {
              label: 'JSON (.json)',
              click: () => exportFile('json'),
            },
            {
              label: 'YAML (.yaml)',
              click: () => exportFile('yaml'),
            },
            {
              label: 'XML (.xml)',
              click: () => exportFile('xml'),
            },
            {
              label: 'TOML (.toml)',
              click: () => exportFile('toml'),
            },
            {
              type: 'separator',
            },
            {
              label: 'Reveal.js Slides (.html)',
              click: () => exportFile('revealjs'),
            },
            {
              label: 'Beamer Slides (.pdf)',
              click: () => exportFile('beamer'),
            },
            {
              type: 'separator',
            },
            {
              label: 'Confluence Wiki (.txt)',
              click: () => exportFile('confluence'),
            },
            {
              label: 'MOBI E-book (.mobi)',
              click: () => exportFile('mobi'),
            },
            {
              type: 'separator',
            },
            // Lightweight markup / interchange formats supported by the bundled Pandoc
            {
              label: 'AsciiDoc (.adoc)',
              click: () => exportFile('asciidoc'),
            },
            {
              label: 'reStructuredText (.rst)',
              click: () => exportFile('rst'),
            },
            {
              label: 'MediaWiki (.wiki)',
              click: () => exportFile('mediawiki'),
            },
            {
              label: 'Org-mode (.org)',
              click: () => exportFile('org'),
            },
            {
              label: 'Textile (.textile)',
              click: () => exportFile('textile'),
            },
            {
              label: 'Man Page (.man)',
              click: () => exportFile('man'),
            },
            {
              label: 'Jupyter Notebook (.ipynb)',
              click: () => exportFile('ipynb'),
            },
            ...buildPluginExportMenuItems(),
          ],
        },
        {
          type: 'separator',
        },
        {
          label: 'Word Template Settings...',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('open-word-template-dialog');
            }
          },
        },
        {
          label: 'Header & Footer Settings...',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('open-header-footer-dialog');
            }
          },
        },
        {
          type: 'separator',
        },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => app.quit(),
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          click: () => mainWindow.webContents.send('undo'),
        },
        {
          label: 'Redo',
          accelerator: 'CmdOrCtrl+Shift+Z',
          click: () => mainWindow.webContents.send('redo'),
        },
        {
          type: 'separator',
        },
        {
          label: 'Cut',
          accelerator: 'CmdOrCtrl+X',
          role: 'cut',
        },
        {
          label: 'Copy',
          accelerator: 'CmdOrCtrl+C',
          role: 'copy',
        },
        {
          label: 'Paste',
          accelerator: 'CmdOrCtrl+V',
          role: 'paste',
        },
        {
          label: 'Select All',
          accelerator: 'CmdOrCtrl+A',
          role: 'selectAll',
        },
        {
          type: 'separator',
        },
        {
          label: 'Find & Replace',
          accelerator: 'CmdOrCtrl+F',
          click: () => mainWindow.webContents.send('toggle-find'),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Preview',
          accelerator: 'CmdOrCtrl+Shift+V',
          click: () => mainWindow.webContents.send('toggle-preview'),
        },
        {
          label: 'Command Palette',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => mainWindow.webContents.send('toggle-command-palette'),
        },
        {
          type: 'separator',
        },
        {
          label: 'Sidebar',
          submenu: [
            {
              label: 'File Explorer',
              click: () => mainWindow.webContents.send('toggle-sidebar-panel', 'explorer'),
            },
            {
              label: 'Git',
              click: () => mainWindow.webContents.send('toggle-sidebar-panel', 'git'),
            },
            {
              label: 'Snippets',
              click: () => mainWindow.webContents.send('toggle-sidebar-panel', 'snippets'),
            },
            {
              label: 'Templates',
              click: () => mainWindow.webContents.send('toggle-sidebar-panel', 'templates'),
            },
            {
              label: 'Outline',
              click: () => mainWindow.webContents.send('toggle-sidebar-panel', 'outline'),
            },
            {
              label: 'Backlinks',
              click: () => mainWindow.webContents.send('toggle-sidebar-panel', 'backlinks'),
            },
            {
              label: 'Version History',
              click: () => mainWindow.webContents.send('toggle-sidebar-panel', 'history'),
            },
          ],
        },
        {
          label: 'Bottom Panel (REPL)',
          click: () => mainWindow.webContents.send('toggle-bottom-panel'),
        },
        {
          type: 'separator',
        },
        {
          label: 'Theme',
          submenu: [
            // Light Themes (grouped first)
            {
              label: 'Atom One Light (Default)',
              click: () => setTheme('atomonelight'),
            },
            {
              label: 'GitHub Light',
              click: () => setTheme('github'),
            },
            {
              label: 'Light',
              click: () => setTheme('light'),
            },
            {
              label: 'Solarized Light',
              click: () => setTheme('solarized'),
            },
            {
              label: 'Gruvbox Light',
              click: () => setTheme('gruvbox-light'),
            },
            {
              label: 'Ayu Light',
              click: () => setTheme('ayu-light'),
            },
            {
              label: 'Sepia',
              click: () => setTheme('sepia'),
            },
            {
              label: 'Paper',
              click: () => setTheme('paper'),
            },
            {
              label: 'Rose Pine Dawn',
              click: () => setTheme('rosepine-dawn'),
            },
            {
              label: 'Concrete Light',
              click: () => setTheme('concrete-light'),
            },
            {
              type: 'separator',
            },
            // Dark Themes
            {
              label: 'Dark',
              click: () => setTheme('dark'),
            },
            {
              label: 'One Dark',
              click: () => setTheme('onedark'),
            },
            {
              label: 'Dracula',
              click: () => setTheme('dracula'),
            },
            {
              label: 'Nord',
              click: () => setTheme('nord'),
            },
            {
              label: 'Monokai',
              click: () => setTheme('monokai'),
            },
            {
              label: 'Material',
              click: () => setTheme('material'),
            },
            {
              label: 'Gruvbox Dark',
              click: () => setTheme('gruvbox-dark'),
            },
            {
              label: 'Tokyo Night',
              click: () => setTheme('tokyonight'),
            },
            {
              label: 'Palenight',
              click: () => setTheme('palenight'),
            },
            {
              label: 'Ayu Dark',
              click: () => setTheme('ayu-dark'),
            },
            {
              label: 'Ayu Mirage',
              click: () => setTheme('ayu-mirage'),
            },
            {
              label: 'Oceanic Next',
              click: () => setTheme('oceanic-next'),
            },
            {
              label: 'Cobalt2',
              click: () => setTheme('cobalt2'),
            },
            {
              label: 'Concrete Dark',
              click: () => setTheme('concrete-dark'),
            },
            {
              label: 'Concrete Warm',
              click: () => setTheme('concrete-warm'),
            },
          ],
        },
        {
          type: 'separator',
        },
        {
          label: 'Font Size',
          submenu: [
            {
              label: 'Increase Font Size',
              accelerator: 'CmdOrCtrl+Shift+Plus',
              click: () => mainWindow.webContents.send('adjust-font-size', 'increase'),
            },
            {
              label: 'Decrease Font Size',
              accelerator: 'CmdOrCtrl+Shift+-',
              click: () => mainWindow.webContents.send('adjust-font-size', 'decrease'),
            },
            {
              label: 'Reset Font Size',
              accelerator: 'CmdOrCtrl+Shift+0',
              click: () => mainWindow.webContents.send('adjust-font-size', 'reset'),
            },
          ],
        },
        {
          type: 'separator',
        },
        {
          label: 'Monospace Font',
          submenu: [
            {
              label: 'JetBrains Mono',
              type: 'radio',
              checked: readSettingsJsonCached().monospaceFont !== 'fira-code',
              click: () =>
                mainWindow.webContents.send('monospace-setting-change', {
                  monospaceFont: 'jetbrains-mono',
                }),
            },
            {
              label: 'Fira Code',
              type: 'radio',
              checked: readSettingsJsonCached().monospaceFont === 'fira-code',
              click: () =>
                mainWindow.webContents.send('monospace-setting-change', {
                  monospaceFont: 'fira-code',
                }),
            },
            {
              type: 'separator',
            },
            {
              label: 'Ligatures',
              type: 'checkbox',
              checked: readSettingsJsonCached().monospaceLigatures === true,
              click: (menuItem) =>
                mainWindow.webContents.send('monospace-setting-change', {
                  monospaceLigatures: menuItem.checked,
                }),
            },
          ],
        },
        {
          type: 'separator',
        },
        {
          label: 'Spell Check',
          type: 'checkbox',
          checked: true,
          click: (menuItem) => {
            mainWindow.webContents.session.setSpellCheckerEnabled(menuItem.checked);
          },
        },
        {
          // Vim keybindings for the editor (toggled live via setVimMode)
          label: 'Vim Mode',
          type: 'checkbox',
          checked: store.get('vimMode', false) === true,
          click: (menuItem) => {
            mainWindow.webContents.send('vim-setting-change', menuItem.checked);
          },
        },
        {
          type: 'separator',
        },
        {
          label: 'Custom Preview CSS',
          submenu: [
            {
              label: 'Load Custom Preview CSS...',
              click: () => mainWindow.webContents.send('load-custom-css'),
            },
            {
              label: 'Clear Custom Preview CSS',
              click: () => mainWindow.webContents.send('clear-custom-css'),
            },
          ],
        },
        {
          type: 'separator',
        },
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          role: 'reload',
        },
        {
          label: 'Toggle DevTools',
          accelerator: 'F12',
          role: 'toggleDevTools',
        },
        {
          type: 'separator',
        },
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+Plus',
          role: 'zoomIn',
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          role: 'zoomOut',
        },
        {
          label: 'Reset Zoom',
          accelerator: 'CmdOrCtrl+0',
          role: 'resetZoom',
        },
      ],
    },
    {
      label: 'Batch',
      submenu: [
        {
          label: 'Convert Markdown Folder...',
          click: () => showBatchConversionDialog(),
        },
        {
          type: 'separator',
        },
        {
          label: 'Batch Image Conversion...',
          click: () => mainWindow.webContents.send('show-batch-converter', 'image'),
        },
        {
          label: 'Batch Audio Conversion...',
          click: () => mainWindow.webContents.send('show-batch-converter', 'audio'),
        },
        {
          label: 'Batch Video Conversion...',
          click: () => mainWindow.webContents.send('show-batch-converter', 'video'),
        },
        {
          label: 'Batch PDF Conversion...',
          click: () => mainWindow.webContents.send('show-batch-converter', 'pdf'),
        },
      ],
    },
    {
      label: 'Convert',
      submenu: [
        {
          label: 'Universal File Converter...',
          accelerator: 'CmdOrCtrl+Shift+C',
          click: () => showUniversalConverterDialog(),
        },
      ],
    },
    {
      label: 'PDF Editor',
      submenu: [
        {
          label: 'Open PDF File...',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => openPDFFile(),
        },
        {
          type: 'separator',
        },
        {
          label: 'Merge PDFs...',
          click: () => showPDFEditorDialog('merge'),
        },
        {
          label: 'Split PDF...',
          click: () => showPDFEditorDialog('split'),
        },
        {
          label: 'Compress PDF...',
          click: () => showPDFEditorDialog('compress'),
        },
        {
          type: 'separator',
        },
        {
          label: 'Rotate Pages...',
          click: () => showPDFEditorDialog('rotate'),
        },
        {
          label: 'Delete Pages...',
          click: () => showPDFEditorDialog('delete'),
        },
        {
          label: 'Reorder Pages...',
          click: () => showPDFEditorDialog('reorder'),
        },
        {
          type: 'separator',
        },
        {
          label: 'Add Watermark...',
          click: () => showPDFEditorDialog('watermark'),
        },
        {
          label: 'Add Page Numbers...',
          click: () => showPDFEditorDialog('pageNumbers'),
        },
        {
          label: 'Crop Pages...',
          click: () => showPDFEditorDialog('crop'),
        },
        {
          type: 'separator',
        },
        {
          label: 'Extract Text...',
          click: () => showPDFEditorDialog('extractText'),
        },
        {
          label: 'Extract Images...',
          click: () => showPDFEditorDialog('extractImages'),
        },
        {
          type: 'separator',
        },
        {
          label: 'Fill Form...',
          click: () => showPDFEditorDialog('fillForm'),
        },
        {
          type: 'separator',
        },
        {
          label: 'Security',
          submenu: [
            {
              label: 'Add Password Protection...',
              click: () => showPDFEditorDialog('encrypt'),
            },
            {
              label: 'Remove Password...',
              click: () => showPDFEditorDialog('decrypt'),
            },
            {
              label: 'Set Permissions...',
              click: () => showPDFEditorDialog('permissions'),
            },
          ],
        },
        {
          type: 'separator',
        },
        {
          label: 'About PDF Editor',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About PDF Editor',
              message: 'PDF Editor',
              detail:
                'Comprehensive PDF editing capabilities powered by @cantoo/pdf-lib and pdfjs-dist.\n\nFeatures:\n• Merge multiple PDF files\n• Split PDF into separate files\n• Compress PDF to reduce file size\n• Rotate pages (90°, 180°, 270°)\n• Delete unwanted pages\n• Reorder pages\n• Add text watermarks\n• Add page numbers\n• Crop pages\n• Extract text\n• Extract embedded images\n\nSecurity Features:\n• Password protection (encryption)\n• Remove passwords (decryption)\n• Set document permissions\n\n100% offline and open-source.',
              buttons: ['OK'],
            });
          },
        },
      ],
    },
    {
      label: 'Tools',
      submenu: [
        {
          label: 'Table Generator',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: () => openTableGenerator(),
        },
        {
          label: 'ASCII Art Generator',
          accelerator: 'CmdOrCtrl+Shift+A',
          click: () => openAsciiGenerator(),
        },
        {
          type: 'separator',
        },
        {
          // Global scratchpad (Ctrl+Alt+Q works even when the app is unfocused)
          label: 'Quick Note',
          accelerator: 'CmdOrCtrl+Alt+Q',
          click: () => openQuickNoteWindow(),
        },
        {
          label: 'Document Compare',
          click: () => mainWindow.webContents.send('show-document-compare'),
        },
        {
          type: 'separator',
        },
        {
          label: 'Image Tools...',
          click: () => mainWindow.webContents.send('show-image-converter'),
        },
        {
          label: 'Audio Tools...',
          click: () => mainWindow.webContents.send('show-audio-converter'),
        },
        {
          label: 'Video Tools...',
          click: () => mainWindow.webContents.send('show-video-converter'),
        },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About MarkdownConverter',
          click: () => showAboutDialog(),
        },
        {
          type: 'separator',
        },
        {
          label: 'Dependencies & Requirements',
          click: () => showDependenciesDialog(),
        },
        {
          // Legal: bundled-component licenses + GPL source offer (in-app copy
          // of THIRD-PARTY-NOTICES.md and SOURCES.md)
          label: 'Third-Party Notices & Licenses',
          click: () => showThirdPartyNoticesWindow(),
        },
        {
          type: 'separator',
        },
        {
          label: 'Documentation',
          click: () => shell.openExternal('https://github.com/amitwh/markdown-converter'),
        },
        {
          label: 'Report Issue',
          click: () => shell.openExternal('https://github.com/amitwh/markdown-converter/issues'),
        },
        {
          label: 'Check for Updates',
          click: () => shell.openExternal('https://github.com/amitwh/markdown-converter/releases'),
        },
      ],
    },
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Show About Dialog with logo
function showAboutDialog() {
  const aboutWindow = new BrowserWindow({
    width: 500,
    height: 600,
    parent: mainWindow,
    modal: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, '../assets/icon.png'),
  });

  // Convert images to base64 for data URL compatibility
  let logoBase64 = '';
  let iconBase64 = '';
  try {
    const logoPath = path.join(__dirname, '../assets/logo.png');
    const iconPath = path.join(__dirname, '../assets/icon.png');
    if (fs.existsSync(logoPath)) {
      logoBase64 = 'data:image/png;base64,' + fs.readFileSync(logoPath).toString('base64');
    }
    if (fs.existsSync(iconPath)) {
      iconBase64 = 'data:image/png;base64,' + fs.readFileSync(iconPath).toString('base64');
    }
  } catch (e) {
    console.error('Error loading about dialog images:', e);
  }
  const aboutHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>About MarkdownConverter</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: linear-gradient(135deg, #464646 0%, #0d0b09 100%);
      color: #e3e3e3;
      padding: 30px;
      text-align: center;
    }
    .logo { width: 120px; margin-bottom: 20px; border-radius: 20px; }
    h1 { font-size: 24px; margin-bottom: 5px; color: #fff; }
    .version { color: #e5461f; font-size: 14px; margin-bottom: 20px; }
    .company { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 20px; }
    .company-logo { height: 24px; }
    .section { background: rgba(255,255,255,0.1); border-radius: 10px; padding: 15px; margin: 15px 0; text-align: left; }
    .section h3 { color: #e5461f; font-size: 14px; margin-bottom: 10px; }
    .section p, .section li { font-size: 12px; line-height: 1.6; }
    ul { padding-left: 20px; }
    .footer { margin-top: 20px; font-size: 11px; color: #9a9696; }
    a { color: #e5461f; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <img src="${iconBase64}" class="logo" alt="MarkdownConverter">
  <h1>MarkdownConverter</h1>
  <div class="version">Version ${app.getVersion()}</div>

  <div class="company">
    <span>by</span>
    <img src="${logoBase64}" class="company-logo" alt="ConcreteInfo">
  </div>

  <div class="section">
    <h3>Features</h3>
    <ul>
      <li>Professional Markdown editing with syntax highlighting</li>
      <li>Universal file converter (Image, Audio, Video, PDF)</li>
      <li>Batch conversion for all media types</li>
      <li>Advanced PDF Editor (merge, split, watermark, encrypt)</li>
      <li>Export to PDF, DOCX, HTML, LaTeX, EPUB & more</li>
      <li>23+ beautiful themes including ConcreteInfo theme</li>
      <li>ASCII Art & Table generators</li>
      <li>Code file syntax highlighting</li>
    </ul>
  </div>

  <div class="section">
    <h3>Contact</h3>
    <p>Email: <a href="mailto:amit.wh@gmail.com">amit.wh@gmail.com</a></p>
    <p>Website: <a href="https://github.com/amitwh/markdown-converter">GitHub Repository</a></p>
  </div>

  <div class="footer">
    <p>License: MIT</p>
    <p>© 2024-2026 ConcreteInfo. All rights reserved.</p>
  </div>
</body>
</html>`;
  aboutWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(aboutHTML));
  aboutWindow.setMenuBarVisibility(false);
}

// Show Dependencies Dialog
/**
 * In-app legal window: renders THIRD-PARTY-NOTICES.md and SOURCES.md (both
 * ship inside the app — dev: repo root, packaged: asar root via build.files).
 * The markdown is shown verbatim in a <pre> with light styling rather than
 * rendered, so license texts stay exactly as written.
 */
function showThirdPartyNoticesWindow() {
  const noticesWindow = new BrowserWindow({
    width: 820,
    height: 640,
    parent: mainWindow,
    title: 'Third-Party Notices & Licenses',
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  noticesWindow.setMenuBarVisibility(false);

  // Both files are read defensively so a packaging slip degrades gracefully
  const readDoc = (file) => {
    try {
      return fs.readFileSync(path.join(__dirname, '..', file), 'utf-8');
    } catch {
      return `(Could not read ${file} in this installation — see the source repository.)`;
    }
  };
  const esc = (s) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const html =
    '<!doctype html><html><head><meta charset="utf-8"><title>Third-Party Notices</title><style>' +
    'body{margin:0;font:13px/1.6 system-ui,sans-serif;background:#fafafa;color:#222}' +
    'header{position:sticky;top:0;background:#fff;border-bottom:1px solid #e5e7eb;padding:10px 20px;display:flex;gap:16px;align-items:center;z-index:1}' +
    'header h1{font-size:15px;margin:0;flex:1}' +
    'header button{padding:6px 14px;cursor:pointer;border:1px solid #d1d5db;border-radius:4px;background:#fff}' +
    'header button.active{background:#4a90d9;color:#fff;border-color:#4a90d9}' +
    'pre{white-space:pre-wrap;word-break:break-word;padding:20px 24px;margin:0;font:12px/1.65 ui-monospace,Menlo,Consolas,monospace}' +
    'body.dark pre{background:#1f2937;color:#e5e7eb}body.dark{background:#111}' +
    '</style></head><body>' +
    '<header><h1>MarkdownConverter — Third-Party Notices</h1>' +
    '<button id="tab-notices" class="active">Notices</button>' +
    '<button id="tab-sources">Source Offers</button></header>' +
    `<pre id="content"></pre>` +
    '<script>' +
    'const notices=' +
    JSON.stringify(esc(readDoc('THIRD-PARTY-NOTICES.md'))) +
    ';' +
    'const sources=' +
    JSON.stringify(esc(readDoc('SOURCES.md'))) +
    ';' +
    'const c=document.getElementById("content");' +
    'c.textContent=notices;' +
    'document.getElementById("tab-notices").onclick=e=>{c.textContent=notices;swap(e)};' +
    'document.getElementById("tab-sources").onclick=e=>{c.textContent=sources;swap(e)};' +
    'function swap(e){document.querySelectorAll("header button").forEach(b=>b.classList.remove("active"));e.target.classList.add("active")}' +
    '</script></body></html>';

  noticesWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}

function showDependenciesDialog() {
  const depsWindow = new BrowserWindow({
    width: 600,
    height: 700,
    parent: mainWindow,
    modal: true,
    resizable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, '../assets/icon.png'),
  });
  const depsHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Dependencies & Requirements</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: #f5f5f5;
      color: #464646;
      padding: 30px;
    }
    h1 { color: #e5461f; font-size: 20px; margin-bottom: 20px; border-bottom: 2px solid #e5461f; padding-bottom: 10px; }
    h2 { color: #464646; font-size: 16px; margin: 20px 0 10px; }
    .dep-card {
      background: #fff;
      border-radius: 8px;
      padding: 15px;
      margin: 10px 0;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .dep-name { font-weight: bold; color: #0d0b09; }
    .dep-desc { font-size: 13px; color: #666; margin: 5px 0; }
    .dep-link { color: #e5461f; font-size: 12px; text-decoration: none; }
    .dep-link:hover { text-decoration: underline; }
    .required { background: #fff3cd; border-left: 4px solid #ffc107; }
    .optional { background: #d4edda; border-left: 4px solid #28a745; }
    .tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; margin-left: 10px; }
    .tag-required { background: #ffc107; color: #000; }
    .tag-optional { background: #28a745; color: #fff; }
  </style>
</head>
<body>
  <h1>Dependencies & Requirements</h1>

  <h2>Required Dependencies</h2>

  <div class="dep-card required">
    <div class="dep-name">Pandoc <span class="tag tag-required">Required</span></div>
    <div class="dep-desc">Universal document converter. Required for most export formats (PDF, DOCX, LaTeX, EPUB).</div>
    <a class="dep-link" href="https://pandoc.org/installing.html" target="_blank">https://pandoc.org/installing.html</a>
  </div>

  <h2>Optional Dependencies (for extended features)</h2>

  <div class="dep-card optional">
    <div class="dep-name">FFmpeg <span class="tag tag-optional">Optional</span></div>
    <div class="dep-desc">Required for audio/video conversion and processing.</div>
    <a class="dep-link" href="https://ffmpeg.org/download.html" target="_blank">https://ffmpeg.org/download.html</a>
  </div>

  <div class="dep-card optional">
    <div class="dep-name">ImageMagick <span class="tag tag-optional">Optional</span></div>
    <div class="dep-desc">Required for image format conversion and processing.</div>
    <a class="dep-link" href="https://imagemagick.org/script/download.php" target="_blank">https://imagemagick.org/script/download.php</a>
  </div>

  <div class="dep-card optional">
    <div class="dep-name">LibreOffice <span class="tag tag-optional">Optional</span></div>
    <div class="dep-desc">Required for enhanced document conversion (Office formats).</div>
    <a class="dep-link" href="https://www.libreoffice.org/download/download/" target="_blank">https://www.libreoffice.org/download/download/</a>
  </div>

  <div class="dep-card optional">
    <div class="dep-name">MiKTeX / TeX Live <span class="tag tag-optional">Optional</span></div>
    <div class="dep-desc">Required for PDF export via LaTeX (higher quality PDFs).</div>
    <a class="dep-link" href="https://miktex.org/download" target="_blank">https://miktex.org/download</a>
  </div>

  <div class="dep-card optional">
    <div class="dep-name">MarkItDown <span class="tag tag-optional">Optional</span></div>
    <div class="dep-desc">Microsoft's any-file-to-Markdown importer (PDF, DOCX, PPTX, XLSX, Outlook .msg, EPUB, images, ZIP). Install with: pip install "markitdown[all]"</div>
    <a class="dep-link" href="https://github.com/microsoft/markitdown" target="_blank">https://github.com/microsoft/markitdown</a>
  </div>

  <h2>Bundled Libraries</h2>

  <div class="dep-card">
    <div class="dep-name">@cantoo/pdf-lib</div>
    <div class="dep-desc">PDF manipulation library for merge, split, watermark, and encryption features.</div>
  </div>

  <div class="dep-card">
    <div class="dep-name">marked</div>
    <div class="dep-desc">Markdown parser for preview rendering.</div>
  </div>

  <div class="dep-card">
    <div class="dep-name">highlight.js</div>
    <div class="dep-desc">Syntax highlighting for code blocks.</div>
  </div>

  <div class="dep-card">
    <div class="dep-name">DOMPurify</div>
    <div class="dep-desc">HTML sanitization for security.</div>
  </div>
</body>
</html>`;
  depsWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(depsHTML));
  depsWindow.setMenuBarVisibility(false);
}

// Open PDF File for viewing/editing
function openPDFFile() {
  const files = dialog.showOpenDialogSync(mainWindow, {
    properties: ['openFile'],
    filters: [
      {
        name: 'PDF Files',
        extensions: ['pdf'],
      },
    ],
  });
  if (files && files[0]) {
    const stats = fs.statSync(files[0]);
    if (stats.size > MAX_FILE_SIZE) {
      dialog.showErrorBox('File Too Large', `File exceeds the ${MAX_FILE_SIZE_MB}MB size limit.`);
      return;
    }
    mainWindow.webContents.send('show-pdf-editor-dialog', null, files[0]);
  }
}
function openFile() {
  const files = dialog.showOpenDialogSync(mainWindow, {
    properties: ['openFile'],
    filters: [
      {
        name: 'Markdown',
        extensions: ['md', 'markdown'],
      },
      {
        name: 'Developer Formats',
        extensions: ['json', 'yaml', 'yml', 'xml', 'toml'],
      },
      {
        name: 'All Files',
        extensions: ['*'],
      },
    ],
  });
  if (files && files[0]) {
    const stats = fs.statSync(files[0]);
    if (stats.size > MAX_FILE_SIZE) {
      dialog.showErrorBox('File Too Large', `File exceeds the ${MAX_FILE_SIZE_MB}MB size limit.`);
      return;
    }
    currentFile = files[0];
    const ext = path.extname(currentFile).toLowerCase().slice(1);
    let content = fs.readFileSync(currentFile, 'utf-8');

    // Wrap developer format files in code blocks for markdown display
    const devFormats = ['json', 'yaml', 'yml', 'xml', 'toml'];
    if (devFormats.includes(ext)) {
      content = convertDataToMarkdown(content, ext);
    }
    mainWindow.webContents.send('file-opened', {
      path: currentFile,
      content,
    });
  }
}
function openPdfFile() {
  const files = dialog.showOpenDialogSync(mainWindow, {
    properties: ['openFile'],
    filters: [
      {
        name: 'PDF Files',
        extensions: ['pdf'],
      },
      {
        name: 'All Files',
        extensions: ['*'],
      },
    ],
  });
  if (files && files[0]) {
    const stats = fs.statSync(files[0]);
    if (stats.size > MAX_FILE_SIZE) {
      dialog.showErrorBox('File Too Large', `File exceeds the ${MAX_FILE_SIZE_MB}MB size limit.`);
      return;
    }
    mainWindow.webContents.send('open-pdf-file', files[0]);
  }
}
function saveAsFile() {
  const file = dialog.showSaveDialogSync(mainWindow, {
    defaultExt: '.md',
    filters: [
      {
        name: 'Markdown',
        extensions: ['md', 'markdown'],
      },
      {
        name: 'All Files',
        extensions: ['*'],
      },
    ],
  });
  if (file) {
    currentFile = file;
    mainWindow.webContents.send('get-content-for-save', file);
  }
}
function exportFile(format) {
  if (!currentFile) {
    dialog.showErrorBox('Error', 'Please save the file first');
    return;
  }

  // Show export options dialog
  showExportOptionsDialog(format);
}
function showExportOptionsDialog(format) {
  mainWindow.webContents.send('show-export-dialog', format);
}

// Build the dynamic tail of the Export submenu from plugin-registered
// formats (see plugin-export-formats-registered IPC handler below). Returns
// [] when no plugin has registered a format, so the Export menu is
// unchanged for a plain install.
function buildPluginExportMenuItems() {
  if (!pluginExportFormats.length) return [];
  const items = pluginExportFormats.map((fmt) => ({
    label: fmt.label || fmt.id,
    click: () => runPluginExportFormat(fmt),
  }));
  return [{ type: 'separator' }, ...items];
}

// Resolve an output path for a plugin-registered export format (main
// process owns save dialogs, same as every other export path in this
// file), then hand off to the renderer — the plugin's handler function
// only exists there, since that's the process that loaded the plugin.
function runPluginExportFormat(fmt) {
  if (!currentFile) {
    dialog.showErrorBox('Error', 'Please save the file first');
    return;
  }
  const ext = fmt.extension || 'txt';
  const outputFile = dialog.showSaveDialogSync(mainWindow, {
    defaultPath: currentFile.replace(/\.[^/.]+$/, `.${ext}`),
    filters: [
      {
        name: fmt.label || fmt.id,
        extensions: [ext],
      },
    ],
  });
  if (!outputFile) return; // User cancelled
  mainWindow.webContents.send('run-plugin-export-format', { id: fmt.id, outputPath: outputFile });
}
function showBatchConversionDialog() {
  mainWindow.webContents.send('show-batch-dialog');
}

// Word Template Settings IPC Handlers
//
// Template selection/settings used to be two separate native OS dialogs
// (an open-file picker and a message-box question) with no visible
// in-app UI showing the currently active template — the original audit
// finding this replaces. There is still genuinely no folder of bundled
// templates to enumerate (see WordTemplateExporter.getDefaultTemplatePath()
// docs), so "Browse..." still opens a native file picker, but the result
// and current state are now shown in a real renderer dialog instead of
// being invisible until a user thinks to reopen the menu item.

// Send current template state to the renderer dialog
ipcMain.on('get-word-template-settings', (event) => {
  event.reply('word-template-settings-data', {
    templatePath: wordTemplatePath,
    templateFileName: wordTemplatePath ? path.basename(wordTemplatePath) : null,
    startPage: templateStartPage,
    defaultTemplateAvailable: fs.existsSync(WordTemplateExporter.getDefaultTemplatePath()),
  });
});

// Browse for a template file via the native picker; does not persist
// until the dialog's Save button sends 'save-word-template-settings'.
ipcMain.on('browse-word-template', async (event) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Word Template',
      filters: [
        {
          name: 'Word Document',
          extensions: ['docx'],
        },
      ],
      properties: ['openFile'],
    });
    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      event.reply('word-template-browsed', {
        templatePath: filePath,
        templateFileName: path.basename(filePath),
      });
    }
  } catch (error) {
    console.error('Word template browse error:', error);
    dialog.showErrorBox(
      'Template Error',
      sanitizeErrorMessage(`Failed to select template: ${error.message}`)
    );
  }
});

// Clear the currently selected template (revert to default formatting)
ipcMain.on('clear-word-template', (event) => {
  event.reply('word-template-browsed', { templatePath: null, templateFileName: null });
});

// Persist template path + start page from the dialog's Save button
ipcMain.on('save-word-template-settings', (event, settings) => {
  wordTemplatePath = (settings && settings.templatePath) || null;
  const page = parseInt(settings && settings.startPage, 10);
  templateStartPage = page >= 1 && page <= 100 ? page : 3;
  store.set('wordTemplatePath', wordTemplatePath);
  store.set('templateStartPage', templateStartPage);
});

// Header & Footer Settings IPC Handlers

// Get current header/footer settings
ipcMain.on('get-header-footer-settings', (event) => {
  event.reply('header-footer-settings-data', headerFooterSettings);
});

// Save header/footer settings
ipcMain.on('save-header-footer-settings', (event, settings) => {
  headerFooterSettings = settings;
  store.set('headerFooterSettings', headerFooterSettings);
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Settings Saved',
    message: 'Header and footer settings have been saved successfully!',
    buttons: ['OK'],
  });
});

// Export Presets IPC Handlers (invoke-style). Presets live in settings.json
// under the `exportPresets` key — the same store used for header/footer and
// page settings; list logic is in src/main/ExportPresets.js.
ipcMain.handle('get-export-presets', async () => ExportPresets.loadPresets(store));
ipcMain.handle('save-export-preset', async (event, preset) =>
  ExportPresets.savePreset(store, preset)
);
ipcMain.handle('delete-export-preset', async (event, presetId) =>
  ExportPresets.deletePreset(store, presetId)
);

// Get current page settings
ipcMain.on('get-page-settings', (event) => {
  event.reply('page-settings-data', pageSettings);
});

// Update page settings from export dialog
ipcMain.on('update-page-settings', (event, settings) => {
  pageSettings = settings;
  store.set('pageSettings', pageSettings);
});

// Save header/footer logo image
// Browse for header/footer logo
ipcMain.on('browse-header-footer-logo', async (event, position) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: `Select ${position.charAt(0).toUpperCase() + position.slice(1)} Logo/Image`,
      filters: [
        {
          name: 'Images',
          extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'],
        },
      ],
      properties: ['openFile'],
    });
    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];

      // Copy image to userData directory for persistent storage
      const userDataPath = app.getPath('userData');
      const logoDir = path.join(userDataPath, 'logos');

      // Create logos directory if it doesn't exist
      if (!fs.existsSync(logoDir)) {
        fs.mkdirSync(logoDir, {
          recursive: true,
        });
      }

      // Generate unique filename
      const ext = path.extname(filePath);
      const filename = `${position}_${Date.now()}${ext}`;
      const destPath = path.join(logoDir, filename);

      // Copy file
      fs.copyFileSync(filePath, destPath);

      // Update settings
      if (position === 'header') {
        headerFooterSettings.header.logo = destPath;
      } else if (position === 'footer') {
        headerFooterSettings.footer.logo = destPath;
      }
      event.reply('header-footer-logo-saved', {
        position,
        path: destPath,
      });
    }
  } catch (error) {
    console.error('Logo browse error:', error);
    dialog.showErrorBox(
      'Logo Error',
      sanitizeErrorMessage(`Failed to select logo: ${error.message}`)
    );
  }
});
ipcMain.on('save-header-footer-logo', async (event, { position, filePath }) => {
  try {
    if (!filePath) {
      dialog.showErrorBox(
        'Logo Error',
        'Failed to save logo: The "path" argument must be of type string. Received undefined'
      );
      return;
    }

    // Copy image to userData directory for persistent storage
    const userDataPath = app.getPath('userData');
    const logoDir = path.join(userDataPath, 'logos');

    // Create logos directory if it doesn't exist
    if (!fs.existsSync(logoDir)) {
      fs.mkdirSync(logoDir, {
        recursive: true,
      });
    }

    // Verify source file exists
    if (!fs.existsSync(filePath)) {
      dialog.showErrorBox('Logo Error', sanitizeErrorMessage(`Source file not found: ${filePath}`));
      return;
    }

    // Generate unique filename
    const ext = path.extname(filePath);
    const filename = `${position}_${Date.now()}${ext}`;
    const destPath = path.join(logoDir, filename);

    // Copy file
    fs.copyFileSync(filePath, destPath);

    // Update settings
    if (position === 'header') {
      headerFooterSettings.header.logo = destPath;
    } else if (position === 'footer') {
      headerFooterSettings.footer.logo = destPath;
    }
    event.reply('header-footer-logo-saved', {
      position,
      path: destPath,
    });
  } catch (error) {
    console.error('Logo save error:', error);
    dialog.showErrorBox(
      'Logo Error',
      sanitizeErrorMessage(`Failed to save logo: ${error.message}`)
    );
  }
});

// Clear header/footer logo
ipcMain.on('clear-header-footer-logo', (event, position) => {
  if (position === 'header') {
    headerFooterSettings.header.logo = null;
  } else if (position === 'footer') {
    headerFooterSettings.footer.logo = null;
  }
  event.reply('header-footer-logo-cleared', position);
});

// Helper function to process dynamic fields in header/footer text
function processDynamicFields(text, metadata = {}) {
  if (!text) return '';
  const now = new Date();
  const dateStr = now.toLocaleDateString();
  const timeStr = now.toLocaleTimeString();
  let result = text;
  result = result.replace(/\$DATE\$/g, dateStr);
  result = result.replace(/\$TIME\$/g, timeStr);
  result = result.replace(/\$TITLE\$/g, metadata.title || 'Untitled');
  result = result.replace(/\$AUTHOR\$/g, metadata.author || '');
  result = result.replace(/\$FILENAME\$/g, metadata.filename || '');

  // Note: $PAGE$ and $TOTAL$ are handled by Pandoc/export tools

  return result;
}

// Add headers/footers to DOCX file using PizZip
// Function to set page size in DOCX files
async function setDocxPageSize(docxPath) {
  try {
    const PizZip = require('pizzip');

    // Read the DOCX file
    const docxBuffer = fs.readFileSync(docxPath);
    const zip = new PizZip(docxBuffer);

    // Get document.xml
    let documentXml = zip.file('word/document.xml').asText();

    // Get page dimensions
    let width, height;
    const pageSize = PAGE_SIZES[pageSettings.size];
    if (pageSize) {
      width = pageSize.word.width;
      height = pageSize.word.height;
    } else if (pageSettings.customWidth && pageSettings.customHeight) {
      // Parse custom dimensions (convert to twentieths of a point)
      // Note: This is simplified - production code should handle various units
      width = parseInt(pageSettings.customWidth) || 11906;
      height = parseInt(pageSettings.customHeight) || 16838;
    } else {
      // Default to A4
      width = 11906;
      height = 16838;
    }

    // Swap dimensions for landscape
    if (pageSettings.orientation === 'landscape') {
      [width, height] = [height, width];
    }

    // Update all <w:pgSz> elements in section properties
    const pgSzRegex = /<w:pgSz[^>]*\/>/g;
    documentXml = documentXml.replace(pgSzRegex, () => {
      return `<w:pgSz w:w="${width}" w:h="${height}" w:orient="${pageSettings.orientation}"/>`;
    });

    // If no pgSz found, add it to all sectPr elements
    if (!pgSzRegex.test(documentXml)) {
      const sectPrRegex = /<w:sectPr[^>]*>/g;
      documentXml = documentXml.replace(sectPrRegex, (match) => {
        return `${match}<w:pgSz w:w="${width}" w:h="${height}" w:orient="${pageSettings.orientation}"/>`;
      });
    }

    // Save updated document.xml
    zip.file('word/document.xml', documentXml);

    // Write modified DOCX
    const newDocxBuffer = zip.generate({
      type: 'nodebuffer',
    });
    fs.writeFileSync(docxPath, newDocxBuffer);
  } catch (error) {
    console.error('Failed to set DOCX page size:', error);
  }
}
async function addHeaderFooterToDocx(docxPath, metadata = {}) {
  if (!headerFooterSettings.enabled) return;
  try {
    const PizZip = require('pizzip');

    // Read the DOCX file
    const docxBuffer = fs.readFileSync(docxPath);
    const zip = new PizZip(docxBuffer);

    // Process dynamic fields
    const headerLeft = processDynamicFields(headerFooterSettings.header.left, metadata);
    const headerCenter = processDynamicFields(headerFooterSettings.header.center, metadata);
    const headerRight = processDynamicFields(headerFooterSettings.header.right, metadata);
    const footerLeft = processDynamicFields(headerFooterSettings.footer.left, metadata);
    const footerCenter = processDynamicFields(headerFooterSettings.footer.center, metadata);
    const footerRight = processDynamicFields(headerFooterSettings.footer.right, metadata);

    // Create header XML
    if (headerLeft || headerCenter || headerRight) {
      const headerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:pPr><w:jc w:val="left"/></w:pPr>
    <w:r><w:t>${headerLeft || ''}</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:jc w:val="center"/></w:pPr>
    <w:r><w:t>${headerCenter || ''}</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:jc w:val="right"/></w:pPr>
    <w:r><w:t>${headerRight || ''}</w:t></w:r>
  </w:p>
</w:hdr>`;
      zip.file('word/header1.xml', headerXml);
    }

    // Create footer XML with page numbers
    if (footerLeft || footerCenter || footerRight) {
      let footerCenterXml = '';
      if (footerCenter) {
        // Handle $PAGE$ and $TOTAL$ in footer
        if (footerCenter.includes('$PAGE$') || footerCenter.includes('$TOTAL$')) {
          const parts = footerCenter.split(/(\$PAGE\$|\$TOTAL\$)/);
          footerCenterXml = parts
            .map((part) => {
              if (part === '$PAGE$') {
                return '<w:fldSimple w:instr="PAGE"/>';
              } else if (part === '$TOTAL$') {
                return '<w:fldSimple w:instr="NUMPAGES"/>';
              } else {
                return `<w:r><w:t>${part}</w:t></w:r>`;
              }
            })
            .join('');
        } else {
          footerCenterXml = `<w:r><w:t>${footerCenter}</w:t></w:r>`;
        }
      }
      const footerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:pPr><w:jc w:val="left"/></w:pPr>
    <w:r><w:t>${footerLeft || ''}</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:jc w:val="center"/></w:pPr>
    ${footerCenterXml}
  </w:p>
  <w:p>
    <w:pPr><w:jc w:val="right"/></w:pPr>
    <w:r><w:t>${footerRight || ''}</w:t></w:r>
  </w:p>
</w:ftr>`;
      zip.file('word/footer1.xml', footerXml);
    }

    // Update document.xml.rels to reference header/footer
    let relsXml = zip.file('word/_rels/document.xml.rels').asText();

    // Add header relationship if not exists
    if ((headerLeft || headerCenter || headerRight) && !relsXml.includes('header1.xml')) {
      const headerId = 'rId100';
      const headerRel = `<Relationship Id="${headerId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>`;
      relsXml = relsXml.replace('</Relationships>', headerRel + '</Relationships>');
    }

    // Add footer relationship if not exists
    if ((footerLeft || footerCenter || footerRight) && !relsXml.includes('footer1.xml')) {
      const footerId = 'rId101';
      const footerRel = `<Relationship Id="${footerId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>`;
      relsXml = relsXml.replace('</Relationships>', footerRel + '</Relationships>');
    }
    zip.file('word/_rels/document.xml.rels', relsXml);

    // Update document.xml to use header/footer in sections
    let documentXml = zip.file('word/document.xml').asText();
    if (headerLeft || headerCenter || headerRight || footerLeft || footerCenter || footerRight) {
      // Find all section properties and add header/footer references
      const sectPrRegex = /<w:sectPr[^>]*>[\s\S]*?<\/w:sectPr>/g;
      documentXml = documentXml.replace(sectPrRegex, (match) => {
        let updated = match;
        if ((headerLeft || headerCenter || headerRight) && !match.includes('headerReference')) {
          updated = updated.replace(
            '</w:sectPr>',
            '<w:headerReference w:type="default" r:id="rId100"/></w:sectPr>'
          );
        }
        if ((footerLeft || footerCenter || footerRight) && !match.includes('footerReference')) {
          updated = updated.replace(
            '</w:sectPr>',
            '<w:footerReference w:type="default" r:id="rId101"/></w:sectPr>'
          );
        }
        return updated;
      });
    }
    zip.file('word/document.xml', documentXml);

    // Write modified DOCX
    const newDocxBuffer = zip.generate({
      type: 'nodebuffer',
    });
    fs.writeFileSync(docxPath, newDocxBuffer);
  } catch (error) {
    console.error('Failed to add headers/footers to DOCX:', error);
    // Don't fail the export, just log the error
  }
}

// Enhanced Word Export with Template Support
async function exportWordWithTemplate() {
  if (!currentFile) {
    dialog.showErrorBox('Error', 'Please save the file first');
    return;
  }
  try {
    // Get markdown content
    const content = fs.readFileSync(currentFile, 'utf-8');

    // Show dialog for output file
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export to Word (Enhanced)',
      defaultPath: currentFile.replace(/\.md$/, '.docx'),
      filters: [
        {
          name: 'Word Document',
          extensions: ['docx'],
        },
      ],
    });
    if (result.canceled) return;

    // Create exporter instance with selected template, start page, and page settings
    const exporter = new WordTemplateExporter(wordTemplatePath, templateStartPage, pageSettings);

    // Convert markdown to DOCX
    await exporter.convert(content, result.filePath);
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Export Successful',
      message: 'Document exported successfully!',
      detail: `Saved to: ${result.filePath}`,
    });
  } catch (error) {
    dialog.showErrorBox(
      'Export Error',
      sanitizeErrorMessage(`Failed to export document: ${error.message}`)
    );
  }
}

// Enhanced PDF Export via Word Template
async function exportPDFViaWordTemplate() {
  if (!currentFile) {
    dialog.showErrorBox('Error', 'Please save the file first');
    return;
  }
  try {
    // Get markdown content
    const content = fs.readFileSync(currentFile, 'utf-8');

    // Show dialog for output file
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export to PDF (Enhanced)',
      defaultPath: currentFile.replace(/\.md$/, '.pdf'),
      filters: [
        {
          name: 'PDF Document',
          extensions: ['pdf'],
        },
      ],
    });
    if (result.canceled) return;

    // Step 1: Create temporary DOCX file using Word template
    const tempDocxPath = result.filePath.replace(/\.pdf$/, '_temp.docx');
    const exporter = new WordTemplateExporter(wordTemplatePath, templateStartPage);
    await exporter.convert(content, tempDocxPath);

    // Step 2: Convert DOCX to PDF using LibreOffice (using execFile for safety)
    const soffice =
      process.platform === 'win32'
        ? 'C:\\Program Files\\LibreOffice\\program\\soffice.exe'
        : 'soffice';
    const outputDir = path.dirname(result.filePath);
    const sofficeArgs = ['--headless', '--convert-to', 'pdf', '--outdir', outputDir, tempDocxPath];
    execFile(soffice, sofficeArgs, (error, _stdout, _stderr) => {
      // Clean up temporary DOCX file
      try {
        fs.unlinkSync(tempDocxPath);
      } catch (e) {
        console.error('Failed to delete temp file:', e);
      }
      if (error) {
        dialog.showErrorBox(
          'PDF Conversion Error',
          sanitizeErrorMessage(
            `Failed to convert to PDF. Please ensure LibreOffice is installed.\n\nError: ${error.message}`
          )
        );
        return;
      }

      // LibreOffice creates file with same base name as input
      const generatedPdfPath = tempDocxPath.replace(/\.docx$/, '.pdf');

      // Rename if needed
      if (generatedPdfPath !== result.filePath) {
        try {
          fs.renameSync(generatedPdfPath, result.filePath);
        } catch (e) {
          console.error('Failed to rename PDF:', e);
        }
      }
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Export Successful',
        message: 'PDF exported successfully using Word template!',
        detail: `Saved to: ${result.filePath}`,
      });
    });
  } catch (error) {
    dialog.showErrorBox(
      'Export Error',
      sanitizeErrorMessage(`Failed to export PDF: ${error.message}`)
    );
  }
}

// Universal File Converter integration
function showUniversalConverterDialog() {
  mainWindow.webContents.send('show-universal-converter-dialog');
}

// PDF Editor dialog
function showPDFEditorDialog(operation) {
  mainWindow.webContents.send('show-pdf-editor-dialog', operation);
}

// Handle PDF editor from toolbar (with optional file path)
ipcMain.on('show-pdf-editor-from-toolbar', (event, { operation, filePath }) => {
  mainWindow.webContents.send('show-pdf-editor-dialog', operation, filePath);
});

// Check if conversion tool is available (using execFile for safety)
function checkConverterAvailable(tool) {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    const locateCmd = isWin ? 'where' : 'which';
    let toolName;
    switch (tool) {
      case 'libreoffice':
        toolName = 'soffice';
        break;
      case 'imagemagick':
        toolName = isWin ? 'magick' : 'convert';
        break;
      case 'ffmpeg': {
        // ffmpeg-static is always bundled — check it directly
        const ffmpegBin = getFFmpegPath();
        resolve(fs.existsSync(ffmpegBin) || ffmpegBin === 'ffmpeg');
        return;
      }
      case 'pandoc': {
        // Pandoc is bundled (bin/<platform>/pandoc) with a system-PATH fallback
        const pandocBin = getPandocPath();
        if (pandocBin && pandocBin !== 'pandoc') {
          resolve(fs.existsSync(pandocBin));
          return;
        }
        // Bundled binary missing — fall through to a PATH lookup
        toolName = 'pandoc';
        break;
      }
      default:
        resolve(false);
        return;
    }
    execFile(locateCmd, [toolName], (error) => {
      resolve(!error);
    });
  });
}

// Handle universal file conversion
ipcMain.on('universal-convert', async (event, { tool, _fromFormat, toFormat, filePath }) => {
  if (!conversionLimiter()) {
    mainWindow.webContents.send('conversion-status', 'Please wait before converting again...');
    return;
  }
  try {
    mainWindow.webContents.send('conversion-status', 'Checking converter availability...');

    // Check if the required tool is available
    const toolAvailable = await checkConverterAvailable(tool);
    if (!toolAvailable) {
      throw new Error(`${tool} is not installed or not found in PATH. Please install it first.`);
    }
    mainWindow.webContents.send('conversion-status', 'Converting file...');
    const outputPath = filePath.replace(/\.[^/.]+$/, `.${toFormat}`);
    let conversionInfo;
    switch (tool) {
      case 'libreoffice':
        conversionInfo = convertWithLibreOffice(filePath, toFormat, outputPath);
        break;
      case 'imagemagick':
        conversionInfo = convertWithImageMagick(filePath, outputPath);
        break;
      case 'ffmpeg':
        conversionInfo = convertWithFFmpeg(filePath, outputPath);
        break;
      case 'pandoc':
        conversionInfo = convertWithPandoc(filePath, outputPath);
        break;
      default:
        throw new Error(`Unknown conversion tool: ${tool}`);
    }

    // Use execFile for safety (prevents command injection)
    execFile(conversionInfo.command, conversionInfo.args, (error, stdout, stderr) => {
      if (error) {
        mainWindow.webContents.send('conversion-complete', {
          success: false,
          error: error.message,
        });
        dialog.showMessageBox(mainWindow, {
          type: 'error',
          title: 'Conversion Failed',
          message: `${tool} conversion failed`,
          detail: stderr || error.message,
          buttons: ['OK'],
        });
      } else {
        mainWindow.webContents.send('conversion-complete', {
          success: true,
          outputPath: outputPath,
        });
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Conversion Complete',
          message: 'File converted successfully!',
          detail: `Saved to: ${outputPath}`,
          buttons: ['OK'],
        });
      }
    });
  } catch (error) {
    mainWindow.webContents.send('conversion-complete', {
      success: false,
      error: error.message,
    });
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Conversion Failed',
      message: 'Universal conversion failed',
      detail: error.message,
      buttons: ['OK'],
    });
  }
});

// Handle universal batch file conversion
ipcMain.on(
  'universal-convert-batch',
  async (
    event,
    { tool, fromFormat, toFormat, inputFolder, outputFolder, includeSubfolders, _advancedOptions }
  ) => {
    if (!conversionLimiter()) {
      mainWindow.webContents.send('conversion-status', 'Please wait before converting again...');
      return;
    }
    try {
      const toolAvailable = await checkConverterAvailable(tool);
      if (!toolAvailable) {
        throw new Error(`${tool} is not installed or not found in PATH. Please install it first.`);
      }

      // Collect matching files
      const files = [];
      function collectFiles(dir) {
        const entries = fs.readdirSync(dir, {
          withFileTypes: true,
        });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory() && includeSubfolders) {
            collectFiles(fullPath);
          } else if (entry.isFile() && entry.name.toLowerCase().endsWith(`.${fromFormat}`)) {
            files.push(fullPath);
          }
        }
      }
      collectFiles(inputFolder);
      if (files.length === 0) {
        mainWindow.webContents.send('conversion-complete', {
          success: false,
          error: `No .${fromFormat} files found in the selected folder.`,
        });
        return;
      }
      let completed = 0;
      let failed = 0;
      for (const filePath of files) {
        const relativePath = path.relative(inputFolder, filePath);
        const outputPath = path.join(
          outputFolder,
          relativePath.replace(/\.[^/.]+$/, `.${toFormat}`)
        );

        // Ensure output subdirectory exists
        fs.mkdirSync(path.dirname(outputPath), {
          recursive: true,
        });
        mainWindow.webContents.send(
          'conversion-status',
          `Converting ${completed + 1}/${files.length}: ${path.basename(filePath)}`
        );
        let conversionInfo;
        switch (tool) {
          case 'libreoffice':
            conversionInfo = convertWithLibreOffice(filePath, toFormat, outputPath);
            break;
          case 'imagemagick':
            conversionInfo = convertWithImageMagick(filePath, outputPath);
            break;
          case 'ffmpeg':
            conversionInfo = convertWithFFmpeg(filePath, outputPath);
            break;
          case 'pandoc':
            conversionInfo = convertWithPandoc(filePath, outputPath);
            break;
          default:
            throw new Error(`Unknown conversion tool: ${tool}`);
        }
        await new Promise((resolve) => {
          execFile(conversionInfo.command, conversionInfo.args, (error) => {
            if (error) {
              failed++;
            } else {
              completed++;
            }
            resolve();
          });
        });
      }
      mainWindow.webContents.send('conversion-complete', {
        success: true,
        outputPath: outputFolder,
      });
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Batch Conversion Complete',
        message: `Batch conversion finished!`,
        detail: `Converted: ${completed}/${files.length} files${failed > 0 ? ` (${failed} failed)` : ''}\nOutput: ${outputFolder}`,
        buttons: ['OK'],
      });
    } catch (error) {
      mainWindow.webContents.send('conversion-complete', {
        success: false,
        error: error.message,
      });
      dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Batch Conversion Failed',
        message: 'Batch conversion failed',
        detail: error.message,
        buttons: ['OK'],
      });
    }
  }
);

// LibreOffice conversion - returns {command, args} for execFile (safer than exec)
function convertWithLibreOffice(inputFile, outputFormat, outputPath) {
  const outputDir = path.dirname(outputPath);
  const soffice =
    process.platform === 'win32'
      ? 'C:\\Program Files\\LibreOffice\\program\\soffice.exe'
      : 'soffice';

  // LibreOffice conversion format mapping
  const formatMap = {
    pdf: 'pdf',
    docx: 'docx',
    doc: 'doc',
    odt: 'odt',
    rtf: 'rtf',
    txt: 'txt',
    html: 'html',
    xlsx: 'xlsx',
    xls: 'xls',
    ods: 'ods',
    csv: 'csv',
    pptx: 'pptx',
    ppt: 'ppt',
    odp: 'odp',
  };
  const format = formatMap[outputFormat] || outputFormat;

  // Return command and args for execFile
  return {
    command: soffice,
    args: ['--headless', '--convert-to', format, '--outdir', outputDir, inputFile],
  };
}

// ImageMagick conversion - returns {command, args} for execFile
function convertWithImageMagick(inputFile, outputPath) {
  const magick = process.platform === 'win32' ? 'magick' : 'convert';
  return {
    command: magick,
    args: [inputFile, outputPath],
  };
}

// FFmpeg conversion - returns {command, args} for execFile
function convertWithFFmpeg(inputFile, outputPath) {
  return {
    command: getFFmpegPath(),
    args: ['-i', inputFile, outputPath, '-y'],
  };
}

// Pandoc conversion - returns {command, args} for execFile
function convertWithPandoc(inputFile, outputPath) {
  return {
    command: getPandocPath(),
    args: [inputFile, '-o', outputPath],
  };
}
function performExportWithOptions(format, options) {
  // Map format names to file extensions
  const formatExtMap = {
    revealjs: 'html',
    beamer: 'pdf',
    confluence: 'txt',
    jira: 'txt',
    asciidoc: 'adoc',
    mediawiki: 'wiki',
  };
  const fileExt = formatExtMap[format] || format;
  const outputFile = dialog.showSaveDialogSync(mainWindow, {
    defaultPath: currentFile.replace(/\.[^/.]+$/, `.${fileExt}`),
    filters: [
      {
        name: format.toUpperCase(),
        extensions: [fileExt],
      },
    ],
  });
  if (!outputFile) return; // User cancelled

  // Check pandoc availability first
  checkPandocAvailability()
    .then((hasPandoc) => {
      if (!hasPandoc) {
        // Handle formats that don't require pandoc
        if (format === 'html') {
          exportToHTML(outputFile);
          return;
        } else if (format === 'pdf') {
          exportToPDFElectron(outputFile);
          return;
        } else {
          dialog.showErrorBox(
            'Export Error',
            `Pandoc is required for ${format.toUpperCase()} export but is not installed or not found in PATH.\n\n` +
              `Please install Pandoc from: https://pandoc.org/installing.html\n\n` +
              `Alternatively, you can export to HTML or PDF using the built-in converters.`
          );
          return;
        }
      }

      // Use pandoc for export with advanced options

      let inputFile = currentFile;
      let tempInputDir = null;
      let tempInputFile = null;

      // Pre-process markdown for Word output so that <style> blocks, HTML
      // comments, and <div> tags do not appear as visible text.
      if (format === 'docx') {
        const content = fs.readFileSync(currentFile, 'utf-8');
        const cleanedContent = WordTemplateExporter.preprocessMarkdownForWordExport(content);
        tempInputDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'mc_export_'));
        tempInputFile = path.join(tempInputDir, path.basename(currentFile));
        fs.writeFileSync(tempInputFile, cleanedContent, 'utf-8');
        inputFile = tempInputFile;
      }

      // Build the argument array once with the shared export options; format
      // branches below append their own flags. Every value lands in argv as a
      // single literal element — never inside a command string (SEC-1).
      const pandocArgs = PandocArgs.buildPandocArgs({ inputFile, outputFile, format, options });

      // Add specific options for PDF export to ensure proper generation
      if (format === 'pdf') {
        PandocArgs.appendPdfEngineOptions(pandocArgs, {
          pdfEngine: options.pdfEngine,
          geometry: options.geometry,
        });

        // Embed bundled monospace font so ASCII columns align in the PDF.
        const monoHeader = buildMonospaceHeaderFile();
        pandocArgs.push(`--include-in-header=${monoHeader}`);
        pandocArgs.push('--highlight-style=tango');

        // Add header/footer if enabled
        if (headerFooterSettings.enabled) {
          const filename = currentFile
            ? path.basename(currentFile, path.extname(currentFile))
            : 'document';
          const metadata = {
            filename,
            title: filename,
            author: '',
          };
          const headerLeft = processDynamicFields(headerFooterSettings.header.left, metadata);
          const headerCenter = processDynamicFields(headerFooterSettings.header.center, metadata);
          const headerRight = processDynamicFields(headerFooterSettings.header.right, metadata);
          const footerLeft = processDynamicFields(headerFooterSettings.footer.left, metadata);
          const footerCenter = processDynamicFields(headerFooterSettings.footer.center, metadata);
          const footerRight = processDynamicFields(headerFooterSettings.footer.right, metadata);

          // Create LaTeX header
          const latexHeader = `
\\usepackage{fancyhdr}
\\pagestyle{fancy}
\\fancyhf{}
\\lhead{${headerLeft.replace(/\\/g, '\\\\')}}
\\chead{${headerCenter.replace(/\\/g, '\\\\')}}
\\rhead{${headerRight.replace(/\\/g, '\\\\')}}
\\lfoot{${footerLeft.replace(/\\/g, '\\\\')}}
\\cfoot{${footerCenter
            .replace(/[$]PAGE[$]/g, '\\\\thepage')
            .replace(/[$]TOTAL[$]/g, '\\\\pageref{LastPage}')
            .replace(/\\/g, '\\\\')}}
\\rfoot{${footerRight.replace(/\\/g, '\\\\')}}
\\renewcommand{\\headrulewidth}{0.4pt}
\\renewcommand{\\footrulewidth}{0.4pt}
`;
          const headerFile = path.join(require('os').tmpdir(), `header_export_${Date.now()}.tex`);
          fs.writeFileSync(headerFile, latexHeader, 'utf-8');
          pandocArgs.push(`--include-in-header=${headerFile}`);
          pandocArgs.push('--variable', 'header-includes=\\\\usepackage{lastpage}');
        }

        // Try with the specified PDF engine, then fall back if it fails
        runPandocArgs(pandocArgs, (error) => {
          if (error) {
            // Try fallback engines if the specified one fails
            const fallbackEngines = ['lualatex', 'pdflatex'];
            tryPdfFallback(currentFile, outputFile, fallbackEngines, 0, options, error);
          } else {
            showExportSuccess(outputFile);
          }
        });
      } else if (format === 'docx') {
        exportWithPandoc(pandocArgs, outputFile, format, async () => {
          // Embed the active monospace TTF into the DOCX so code blocks render in
          // JetBrains Mono / Fira Code regardless of the viewer's installed fonts.
          try {
            const familyKey = readSettingsJsonCached().monospaceFont || 'jetbrains-mono';
            const family = familyKey === 'fira-code' ? 'Fira Code' : 'JetBrains Mono';
            const regular = MonospaceFontConfig.getMonoFontTtfPath(familyKey, 400);
            const bold = MonospaceFontConfig.getMonoFontTtfPath(familyKey, 700);
            const fonts = [];
            if (regular) fonts.push({ path: regular, family, weight: 400 });
            if (bold) fonts.push({ path: bold, family, weight: 700 });
            if (fonts.length) await DocxFontEmbedder.embed(outputFile, fonts);
          } catch (embedErr) {
            if (typeof console !== 'undefined')
              console.warn('[docx] font embed failed:', embedErr.message);
          }
          if (tempInputFile) {
            try {
              fs.unlinkSync(tempInputFile);
            } catch {
              // Ignore cleanup errors
            }
          }
          if (tempInputDir) {
            try {
              fs.rmdirSync(tempInputDir);
            } catch {
              // Ignore cleanup errors
            }
          }
        });
      } else if (format === 'pptx') {
        // Add PowerPoint footer if enabled
        if (headerFooterSettings.enabled && headerFooterSettings.footer.center) {
          const filename = currentFile
            ? path.basename(currentFile, path.extname(currentFile))
            : 'document';
          const metadata = {
            filename,
            title: filename,
            author: '',
          };
          const footerText = processDynamicFields(headerFooterSettings.footer.center, metadata);
          PandocArgs.appendFooterVariable(pandocArgs, footerText);
        }
        exportWithPandoc(pandocArgs, outputFile, format);
      } else if (format === 'json') {
        exportWithPandoc(
          PandocArgs.buildSimpleTargetArgs(currentFile, outputFile, format),
          outputFile,
          format
        );
      } else if (format === 'html') {
        // Build a complete HTML file with our bundled monospace font as embedded CSS.
        const cssFile = path.join(os.tmpdir(), `monospace-html-${Date.now()}-${process.pid}.css`);
        fs.writeFileSync(cssFile, buildMonospaceExportCss(), 'utf-8');
        exportWithPandoc(
          [inputFile, '-s', `--css=${cssFile}`, '-o', outputFile],
          outputFile,
          format
        );
      } else if (format === 'yaml' || format === 'xml' || format === 'toml') {
        // For YAML/XML/TOML, save the raw markdown content with the new extension
        try {
          const content = fs.readFileSync(currentFile, 'utf-8');
          fs.writeFileSync(outputFile, content, 'utf-8');
          showExportSuccess(outputFile);
        } catch (err) {
          dialog.showErrorBox(
            'Export Error',
            sanitizeErrorMessage(`Failed to export: ${err.message}`)
          );
        }
      } else if (format === 'revealjs') {
        const revealArgs = [
          currentFile,
          '-t',
          'revealjs',
          '-s',
          '-o',
          outputFile,
          '--slide-level=2',
        ];
        if (options) {
          if (options.revealTheme) revealArgs.push('-V', `theme=${options.revealTheme}`);
          if (options.revealTransition)
            revealArgs.push('-V', `transition=${options.revealTransition}`);
          if (options.revealTransitionSpeed)
            revealArgs.push('-V', `transitionSpeed=${options.revealTransitionSpeed}`);
          if (options.revealControls !== undefined)
            revealArgs.push('-V', `controls=${options.revealControls}`);
          if (options.revealSlideNumber !== undefined)
            revealArgs.push('-V', `slideNumber=${options.revealSlideNumber}`);
          if (options.revealProgress !== undefined)
            revealArgs.push('-V', `progress=${options.revealProgress}`);
          if (options.revealHistory !== undefined)
            revealArgs.push('-V', `history=${options.revealHistory}`);
          if (options.revealCenter !== undefined)
            revealArgs.push('-V', `center=${options.revealCenter}`);

          // Support for templates, metadata, bibliography (only these dialog
          // options were applied to reveal.js exports before the args-array
          // conversion — keep that exact behavior)
          PandocArgs.appendCommonOptions(revealArgs, {
            template: options.template,
            metadata: options.metadata,
            bibliography: options.bibliography,
            csl: options.csl,
          });
        }
        exportWithPandoc(revealArgs, outputFile, format);
      } else if (PandocArgs.SIMPLE_TARGET_FORMATS[format]) {
        // json, beamer, jira/confluence and the plain text/markup formats all
        // export through a bare `-t <target>` conversion (dialog options are
        // not applied to these formats).
        exportWithPandoc(
          PandocArgs.buildSimpleTargetArgs(currentFile, outputFile, format),
          outputFile,
          format
        );
      } else if (format === 'epub') {
        // Embed the active monospace TTF into EPUB so code blocks render in
        // JetBrains Mono / Fira Code regardless of the reader's installed fonts.
        if (pandocSupportsEpubEmbedFont()) {
          const familyKey = readSettingsJsonCached().monospaceFont || 'jetbrains-mono';
          const regular = MonospaceFontConfig.getMonoFontTtfPath(familyKey, 400);
          const bold = MonospaceFontConfig.getMonoFontTtfPath(familyKey, 700);
          [regular, bold].filter(Boolean).forEach((p) => {
            pandocArgs.push(`--epub-embed-font=${p}`);
          });
        }
        runPandocArgs(pandocArgs, async (error) => {
          if (error) {
            dialog.showErrorBox(
              'Export Error',
              sanitizeErrorMessage(`Failed to export EPUB: ${error.message}`)
            );
            return;
          }
          // Patch the OPF manifest so readers can locate the embedded font.
          // Skip silently if the file is missing or pandoc didn't embed.
          try {
            const familyKey = readSettingsJsonCached().monospaceFont || 'jetbrains-mono';
            const regular = MonospaceFontConfig.getMonoFontTtfPath(familyKey, 400);
            const fonts = [];
            if (regular)
              fonts.push({
                path: regular,
                family: familyKey === 'fira-code' ? 'Fira Code' : 'JetBrains Mono',
                weight: 400,
              });
            if (fonts.length) {
              const patched = await EpubFontEmbedder.patchManifest(outputFile, fonts);
              try {
                fs.renameSync(patched, outputFile);
              } catch (renameErr) {
                if (typeof console !== 'undefined')
                  console.warn('[epub] could not overwrite with patched EPUB:', renameErr.message);
              }
            }
          } catch (patchErr) {
            if (typeof console !== 'undefined')
              console.warn('[epub] manifest patch failed:', patchErr.message);
          }
          showExportSuccess(outputFile);
        });
      } else if (format === 'mobi') {
        // First export to EPUB, then try ebook-convert if available
        const epubFile = outputFile.replace(/\.mobi$/i, '.epub');
        runPandocArgs([currentFile, '-o', epubFile], (error) => {
          if (error) {
            dialog.showErrorBox(
              'Export Error',
              sanitizeErrorMessage(`Failed to export EPUB intermediate: ${error.message}`)
            );
            return;
          }
          // Try ebook-convert (Calibre) for MOBI
          execFile('ebook-convert', [epubFile, outputFile], (ebookError) => {
            if (ebookError) {
              dialog.showMessageBox(mainWindow, {
                type: 'warning',
                title: 'MOBI Export - Partial',
                message: `Calibre's ebook-convert was not found. The file has been exported as EPUB instead.\n\nEPUB saved to: ${epubFile}\n\nTo get MOBI output, install Calibre from: https://calibre-ebook.com/`,
                buttons: ['OK'],
              });
            } else {
              // Clean up intermediate EPUB
              try {
                fs.unlinkSync(epubFile);
              } catch {
                /* ignore */
              }
              showExportSuccess(outputFile);
            }
          });
        });
      } else {
        // Generic export for other formats
        exportWithPandoc(pandocArgs, outputFile, format);
      }
    })
    .catch((error) => {
      console.error('Error checking pandoc availability:', error);
      dialog.showErrorBox(
        'Export Error',
        sanitizeErrorMessage(`Error checking system requirements: ${error.message}`)
      );
    });
}
function tryPdfFallback(inputFile, outputFile, engines, index, options, _lastError) {
  if (index >= engines.length) {
    // All Pandoc PDF engines failed, fallback to Electron's built-in PDF export

    exportToPDFElectron(outputFile);
    return;
  }
  const engine = engines[index];
  const pandocArgs = [inputFile, `--pdf-engine=${engine}`, '-o', outputFile];

  // Embed bundled monospace font so ASCII columns align in the PDF.
  const monoHeader = buildMonospaceHeaderFile();
  pandocArgs.push(`--include-in-header=${monoHeader}`);
  pandocArgs.push('--highlight-style=tango');

  // Add geometry if specified (the engine flag is already set above)
  if (options.geometry) {
    pandocArgs.push('-V', `geometry:${options.geometry}`);
  }

  // Add header/footer if enabled
  if (headerFooterSettings.enabled) {
    const filename = path.basename(inputFile, path.extname(inputFile));
    const metadata = {
      filename,
      title: filename,
      author: options.metadata?.author || '',
    };
    const headerLeft = processDynamicFields(headerFooterSettings.header.left, metadata);
    const headerCenter = processDynamicFields(headerFooterSettings.header.center, metadata);
    const headerRight = processDynamicFields(headerFooterSettings.header.right, metadata);
    const footerLeft = processDynamicFields(headerFooterSettings.footer.left, metadata);
    const footerCenter = processDynamicFields(headerFooterSettings.footer.center, metadata);
    const footerRight = processDynamicFields(headerFooterSettings.footer.right, metadata);

    // Create LaTeX header for fancyhdr
    const latexHeader = `
\\usepackage{fancyhdr}
\\usepackage{lastpage}
\\pagestyle{fancy}
\\fancyhf{}
\\lhead{${headerLeft.replace(/\\/g, '\\\\')}}
\\chead{${headerCenter.replace(/\\/g, '\\\\')}}
\\rhead{${headerRight.replace(/\\/g, '\\\\')}}
\\lfoot{${footerLeft.replace(/\\/g, '\\\\')}}
\\cfoot{${footerCenter
      .replace(/\$PAGE\$/g, '\\\\thepage')
      .replace(/\$TOTAL\$/g, '\\\\pageref{LastPage}')
      .replace(/\\/g, '\\\\')}}
\\rfoot{${footerRight.replace(/\\/g, '\\\\')}}
\\renewcommand{\\headrulewidth}{0.4pt}
\\renewcommand{\\footrulewidth}{0.4pt}
`;
    const headerFile = path.join(require('os').tmpdir(), `header_fallback_${Date.now()}.tex`);
    fs.writeFileSync(headerFile, latexHeader, 'utf-8');
    pandocArgs.push(`--include-in-header=${headerFile}`);
  }

  // Add all other options (this fallback path historically applied only the
  // template and metadata options — keep that exact behavior)
  PandocArgs.appendCommonOptions(pandocArgs, {
    template: options.template,
    metadata: options.metadata,
  });

  runPandocArgs(pandocArgs, (error) => {
    if (error) {
      tryPdfFallback(inputFile, outputFile, engines, index + 1, options, error);
    } else {
      showExportSuccess(outputFile);
    }
  });
}
function showExportSuccess(outputFile) {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Export Complete',
    message: `File exported successfully to ${outputFile}`,
    buttons: ['OK'],
  });
}

// Helper function to export with pandoc (general) - runs pandoc with an
// argument array (values are passed to execFile as literal argv elements)
function exportWithPandoc(pandocArgs, outputFile, format, onComplete) {
  runPandocArgs(pandocArgs, async (error, stdout, stderr) => {
    if (error) {
      console.error(`Pandoc error for ${format}:`, error);
      console.error(`Pandoc stderr:`, stderr);
      console.error(`Pandoc stdout:`, stdout);

      // Provide more specific error messages
      let errorMessage = `Failed to export to ${format.toUpperCase()}`;
      if (error.message.includes('not found') || error.message.includes('not recognized')) {
        errorMessage += '\n\nPandoc is not installed or not found in PATH.';
        errorMessage += '\nPlease install Pandoc from: https://pandoc.org/installing.html';
      } else if (stderr) {
        errorMessage += `\n\nError details: ${stderr}`;
      } else {
        errorMessage += `\n\nError details: ${error.message}`;
      }
      errorMessage += `\n\nCommand used: pandoc ${pandocArgs.join(' ')}`;
      dialog.showErrorBox('Export Error', sanitizeErrorMessage(errorMessage));
    } else {
      if (stderr) {
        console.warn(`Pandoc stderr (non-fatal):`, stderr);
      }

      // Set page size for DOCX
      if (format === 'docx') {
        try {
          await setDocxPageSize(outputFile);
        } catch (pageSizeError) {
          console.error('Error setting page size for DOCX:', pageSizeError);
        }
      }

      // Add headers/footers to DOCX if enabled
      if (format === 'docx' && headerFooterSettings.enabled) {
        try {
          const filename = currentFile
            ? path.basename(currentFile, path.extname(currentFile))
            : 'document';
          const metadata = {
            filename: filename,
            title: filename,
            author: '',
          };
          await addHeaderFooterToDocx(outputFile, metadata);
        } catch (hfError) {
          console.error('Error adding headers/footers to DOCX:', hfError);
          // Continue with success message even if header/footer fails
        }
      }

      // Set page size for ODT (ODF styles.xml — the DOCX-oriented
      // setDocxPageSize cannot patch an ODT package)
      if (format === 'odt') {
        try {
          const { setOdtPageSize } = require('./main/OdtStyling');
          await setOdtPageSize(outputFile, { ...pageSettings, pageSizes: PAGE_SIZES });
        } catch (pageSizeError) {
          console.error('Error setting page size for ODT:', pageSizeError);
        }
      }

      // Add headers/footers to ODT if enabled (mirrors the DOCX path above)
      if (format === 'odt' && headerFooterSettings.enabled) {
        try {
          const filename = currentFile
            ? path.basename(currentFile, path.extname(currentFile))
            : 'document';
          const metadata = {
            filename: filename,
            title: filename,
            author: '',
          };
          const { addHeaderFooterToOdt } = require('./main/OdtStyling');
          await addHeaderFooterToOdt(outputFile, {
            enabled: headerFooterSettings.enabled,
            header: {
              left: processDynamicFields(headerFooterSettings.header.left, metadata),
              center: processDynamicFields(headerFooterSettings.header.center, metadata),
              right: processDynamicFields(headerFooterSettings.header.right, metadata),
            },
            footer: {
              left: processDynamicFields(headerFooterSettings.footer.left, metadata),
              center: processDynamicFields(headerFooterSettings.footer.center, metadata),
              right: processDynamicFields(headerFooterSettings.footer.right, metadata),
            },
          });
        } catch (hfError) {
          console.error('Error adding headers/footers to ODT:', hfError);
          // Continue with success message even if header/footer fails
        }
      }
      showExportSuccess(outputFile);
    }
    if (typeof onComplete === 'function') {
      onComplete(error);
    }
  });
}

// Export to HTML using marked (no pandoc required)
function exportToHTML(outputFile) {
  try {
    const marked = require('marked');
    const markdownContent = fs.readFileSync(currentFile, 'utf8');
    const htmlContent = marked.parse(markdownContent);
    const monospaceCss = buildMonospaceExportCss();
    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Exported Document</title>
    <style>
        ${monospaceCss}
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 40px;
        }
        h1, h2, h3, h4, h5, h6 {
            margin-top: 1.5em;
            margin-bottom: 0.5em;
        }
        /* Inline code */
        code {
            background: #f4f4f4;
            padding: 2px 4px;
            border-radius: 3px;
            font-family: Consolas, Monaco, 'Courier New', monospace;
            font-size: 0.9em;
        }
        /* Code blocks - critical for ASCII art preservation */
        pre {
            background: #f5f5f5;
            padding: 1em;
            border-radius: 5px;
            overflow-x: auto;
            white-space: pre;
            word-wrap: normal;
            font-family: Consolas, Monaco, 'Courier New', monospace;
            font-size: 13px;
            line-height: 1.4;
            border: 1px solid #e0e0e0;
            margin: 1em 0;
        }
        pre code {
            background: transparent;
            padding: 0;
            font-family: inherit;
            font-size: inherit;
            line-height: inherit;
            white-space: pre;
            word-wrap: normal;
            display: block;
        }
        blockquote {
            border-left: 4px solid #ddd;
            margin-left: 0;
            padding-left: 1em;
            color: #666;
        }
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 1em 0;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
        }
        th {
            background-color: #f4f4f4;
        }
        a {
            color: #0066cc;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        img {
            max-width: 100%;
            height: auto;
        }
        @media print {
            pre {
                white-space: pre;
                word-wrap: normal;
                overflow: visible;
                page-break-inside: avoid;
            }
            pre code {
                white-space: pre;
                word-wrap: normal;
            }
        }
    </style>
</head>
<body>
    ${htmlContent}
</body>
</html>`;
    fs.writeFileSync(outputFile, fullHtml, 'utf8');
    showExportSuccess(outputFile);
  } catch (error) {
    console.error('HTML export error:', error);
    dialog.showErrorBox(
      'HTML Export Error',
      sanitizeErrorMessage(`Failed to export HTML: ${error.message}`)
    );
  }
}

// Export to PDF using Electron (no pandoc required)
function exportToPDFElectron(outputFile) {
  try {
    const marked = require('marked');
    const markdownContent = fs.readFileSync(currentFile, 'utf8');
    const htmlContent = marked.parse(markdownContent);
    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PDF Export</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 40px;
        }
        h1, h2, h3, h4, h5, h6 {
            margin-top: 1.5em;
            margin-bottom: 0.5em;
        }
        /* Inline code */
        code {
            background: #f4f4f4;
            padding: 2px 4px;
            border-radius: 3px;
            font-family: Consolas, Monaco, 'Courier New', monospace;
            font-size: 0.9em;
        }
        /* Code blocks - critical for ASCII art preservation */
        pre {
            background: #f5f5f5;
            padding: 1em;
            border-radius: 5px;
            overflow-x: visible;
            overflow-y: visible;
            white-space: pre;
            word-wrap: normal;
            font-family: Consolas, Monaco, 'Courier New', monospace;
            font-size: 12px;
            line-height: 1.4;
            border: 1px solid #e0e0e0;
            margin: 1em 0;
        }
        pre code {
            background: transparent;
            padding: 0;
            font-family: inherit;
            font-size: inherit;
            line-height: inherit;
            white-space: pre;
            word-wrap: normal;
            display: block;
        }
        blockquote {
            border-left: 4px solid #ddd;
            margin-left: 0;
            padding-left: 1em;
            color: #666;
        }
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 1em 0;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
        }
        th {
            background-color: #f4f4f4;
        }
        img {
            max-width: 100%;
            height: auto;
        }
        @media print {
            body { padding: 20px; }
            pre {
                white-space: pre;
                word-wrap: normal;
                overflow: visible;
                page-break-inside: avoid;
            }
            pre code {
                white-space: pre;
                word-wrap: normal;
            }
        }
    </style>
</head>
<body>
    ${htmlContent}
</body>
</html>`;

    // Create a hidden window to render and export PDF
    const pdfWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });
    pdfWindow
      .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`)
      .then(() => {
        return pdfWindow.webContents.printToPDF({
          marginsType: 1,
          // Use default margins
          pageSize: 'A4',
          printBackground: true,
          printSelectionOnly: false,
          landscape: false,
        });
      })
      .then((pdfData) => {
        fs.writeFileSync(outputFile, pdfData);
        pdfWindow.close();
        showExportSuccess(outputFile);
      })
      .catch((error) => {
        pdfWindow.close();
        console.error('Electron PDF export error:', error);
        dialog.showErrorBox(
          'PDF Export Error',
          sanitizeErrorMessage(
            `Failed to export PDF using built-in engine: ${error.message}\n\n` +
              `For better PDF export, please install Pandoc with LaTeX support.`
          )
        );
      });
  } catch (error) {
    console.error('PDF export setup error:', error);
    dialog.showErrorBox(
      'PDF Export Error',
      sanitizeErrorMessage(`Failed to setup PDF export: ${error.message}`)
    );
  }
}
function exportSpreadsheet(format) {
  if (!currentFile) {
    dialog.showErrorBox('Error', 'Please save the file first');
    return;
  }

  // Request content from renderer
  mainWindow.webContents.send('get-content-for-spreadsheet', format);
}
function importDocument() {
  const files = dialog.showOpenDialogSync(mainWindow, {
    properties: ['openFile'],
    filters: [
      {
        name: 'Documents',
        extensions: ['docx', 'odt', 'rtf', 'html', 'htm', 'tex', 'epub', 'pdf', 'txt'],
      },
      {
        name: 'Presentations',
        extensions: ['pptx', 'odp'],
      },
      {
        name: 'Markup Languages',
        extensions: ['rst', 'textile', 'mediawiki', 'org', 'asciidoc', 'twiki', 'opml'],
      },
      {
        name: 'E-book Formats',
        extensions: ['epub', 'fb2'],
      },
      {
        name: 'LaTeX Formats',
        extensions: ['tex', 'latex', 'ltx'],
      },
      {
        name: 'Web Formats',
        extensions: ['html', 'htm', 'xhtml'],
      },
      {
        name: 'Wiki Formats',
        extensions: ['mediawiki', 'dokuwiki', 'tikiwiki', 'twiki'],
      },
      {
        name: 'CSV/TSV',
        extensions: ['csv', 'tsv'],
      },
      {
        name: 'Developer Formats',
        extensions: ['json', 'yaml', 'yml', 'xml', 'toml'],
      },
      {
        name: 'All Files',
        extensions: ['*'],
      },
    ],
  });
  if (files && files[0]) {
    const inputFile = files[0];
    const stats = fs.statSync(inputFile);
    if (stats.size > MAX_FILE_SIZE) {
      dialog.showErrorBox('File Too Large', `File exceeds the ${MAX_FILE_SIZE_MB}MB size limit.`);
      return;
    }
    const ext = path.extname(inputFile).toLowerCase().slice(1);
    const outputFile = inputFile.replace(/\.[^/.]+$/, '.md');

    // Determine format-specific conversion options
    let additionalOptions = [];

    // For PDFs, extract text properly
    if (ext === 'pdf') {
      additionalOptions = ['--pdf-engine=xelatex'];
    }

    // For CSV/TSV, convert as tables
    if (ext === 'csv' || ext === 'tsv') {
      additionalOptions = ['--from=csv', '-t', 'markdown'];
    }

    // For JSON, handle structure
    if (ext === 'json') {
      additionalOptions = ['--from=json', '-t', 'markdown'];
    }

    // For YAML, XML, TOML - wrap content in code blocks directly
    if (['yaml', 'yml', 'xml', 'toml'].includes(ext)) {
      const rawContent = fs.readFileSync(inputFile, 'utf-8');
      const mdContent = convertDataToMarkdown(rawContent, ext);
      const mdOutputFile = inputFile.replace(/\.[^/.]+$/, '.md');
      fs.writeFileSync(mdOutputFile, mdContent, 'utf-8');
      currentFile = mdOutputFile;
      mainWindow.webContents.send('file-opened', {
        path: mdOutputFile,
        content: mdContent,
      });
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Import Complete',
        message: `Document imported successfully as ${path.basename(mdOutputFile)}\n\nOriginal format: ${ext.toUpperCase()}\nConverted to: Markdown`,
        buttons: ['OK'],
      });
      return;
    }

    // Convert to markdown using pandoc with an argument array (input and
    // output paths are passed as single literal argv elements)
    const pandocArgs = [inputFile, '-t', 'markdown', ...additionalOptions, '-o', outputFile];
    runPandocArgs(pandocArgs, (error, _stdout, _stderr) => {
      if (error) {
        dialog.showErrorBox(
          'Import Error',
          sanitizeErrorMessage(
            `Failed to import: ${error.message}\n\nMake sure Pandoc is installed.\n\nSupported formats: DOCX, ODT, RTF, HTML, LaTeX, EPUB, PDF, PPTX, ODP, RST, Textile, MediaWiki, Org-mode, AsciiDoc, CSV, and more.`
          )
        );
      } else {
        // Open the converted markdown file
        currentFile = outputFile;
        const content = fs.readFileSync(outputFile, 'utf-8');
        mainWindow.webContents.send('file-opened', {
          path: outputFile,
          content,
        });
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Import Complete',
          message: `Document imported successfully as ${path.basename(outputFile)}\n\nOriginal format: ${ext.toUpperCase()}\nConverted to: Markdown`,
          buttons: ['OK'],
        });
      }
    });
  }
}

// ============================================
// MarkItDown import (Microsoft markitdown, any file → Markdown)
// ============================================
const MarkItDown = require('./main/MarkItDown');

// Probed once on first use; {command, argsPrefix, version} or null
let markItDownResolved = undefined; // undefined = not probed yet

/** Resolve (and cache) the markitdown command via the bridge module. */
async function getMarkItDown() {
  if (markItDownResolved === undefined) {
    markItDownResolved = await MarkItDown.resolveMarkItDown(require('child_process').execFile);
  }
  return markItDownResolved;
}

/** IPC: availability probe for renderer hints (no version spam, cached). */
ipcMain.handle('markitdown:available', async () => {
  const resolved = await getMarkItDown();
  return {
    available: Boolean(resolved),
    version: resolved?.version || null,
    // How the tool was found, e.g. "markitdown" or "python3 -m markitdown"
    via: resolved ? [resolved.command, ...resolved.argsPrefix].join(' ') : null,
  };
});

/** IPC: convert one file to markdown (renderer-driven flows). */
ipcMain.handle('markitdown:convert', async (_event, { path: inputPath } = {}) => {
  const validation = validatePath(inputPath);
  if (!validation.valid) throw new Error('Invalid file path');
  const stats = fs.statSync(validation.resolved);
  if (stats.size > MAX_FILE_SIZE) {
    throw new Error(`File exceeds the ${MAX_FILE_SIZE_MB}MB size limit.`);
  }
  const resolved = await getMarkItDown();
  return MarkItDown.convertToMarkdown(validation.resolved, { resolved });
});

/**
 * Menu flow: pick any file, convert with markitdown, write <name>.md next to
 * the source (mirroring importDocument's UX), and open it in a new tab.
 * Existing outputs are never overwritten — a numeric suffix is appended.
 */
async function importWithMarkItDown() {
  const files = dialog.showOpenDialogSync(mainWindow, {
    properties: ['openFile'],
    title: 'Import with MarkItDown (any format)',
  });
  if (!files || !files[0]) return;
  const inputFile = files[0];

  try {
    const stats = fs.statSync(inputFile);
    if (stats.size > MAX_FILE_SIZE) {
      dialog.showErrorBox('File Too Large', `File exceeds the ${MAX_FILE_SIZE_MB}MB size limit.`);
      return;
    }

    const resolved = await getMarkItDown();
    const { content } = await MarkItDown.convertToMarkdown(inputFile, { resolved });

    // <name>.md, then <name>-1.md, <name>-2.md, … when it already exists
    const base = inputFile.replace(/\.[^/.]+$/, '');
    let outputFile = `${base}.md`;
    for (let i = 1; fs.existsSync(outputFile); i++) outputFile = `${base}-${i}.md`;
    fs.writeFileSync(outputFile, content, 'utf-8');

    currentFile = outputFile;
    mainWindow.webContents.send('file-opened', { path: outputFile, content });
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Import Complete',
      message: `Imported as ${path.basename(outputFile)} via MarkItDown\n\nOriginal: ${path.basename(inputFile)}`,
      buttons: ['OK'],
    });
  } catch (error) {
    dialog.showErrorBox(
      'MarkItDown Import',
      sanitizeErrorMessage(
        (error.code === 'not_installed'
          ? error.message
          : `Import failed: ${error.message}`) +
          '\n\nMarkItDown is an optional Python tool from Microsoft (MIT):\n' +
          '  pip install "markitdown[all]"'
      )
    );
  }
}

function setTheme(theme) {
  store.set('theme', theme);
  mainWindow.webContents.send('theme-changed', theme);
}

// IPC handlers
ipcMain.on('save-file', (event, { path, content }) => {
  // Version history: snapshot the on-disk content before it is replaced so
  // the user can roll back from the History panel. First save of a new file
  // (or unchanged content) skips the snapshot to keep noise out of the list.
  try {
    if (fs.existsSync(path)) {
      const previous = fs.readFileSync(path, 'utf-8');
      if (previous !== content) {
        VersionHistory.saveVersion({
          docPath: path,
          content: previous,
          label: 'before save',
          io: versionHistoryIo(),
        });
      }
    }
  } catch (historyError) {
    console.error('Version history snapshot failed:', historyError);
  }
  fs.writeFileSync(path, content, 'utf-8');
  currentFile = path;
});
ipcMain.on('save-current-file', (event, payload) => {
  const content = typeof payload === 'string' ? payload : payload?.content;
  const targetFile = typeof payload === 'string' ? currentFile : payload?.filePath || currentFile;
  if (targetFile) {
    fs.writeFileSync(targetFile, content, 'utf-8');
    currentFile = targetFile;
  } else {
    saveAsFile();
  }
});
ipcMain.on('get-theme', (event) => {
  const theme = store.get('theme', 'atomonelight');
  event.reply('theme-changed', theme);
});

// Handle tab file tracking for exports
ipcMain.on('set-current-file', (event, filePath) => {
  currentFile = filePath;
});

// ============================================
// Version History (local rollback without Git)
// ============================================
const VersionHistory = require('./main/VersionHistory');

/** IO bundle for VersionHistory bound to <userData>/versions. */
function versionHistoryIo() {
  return {
    rootDir: path.join(app.getPath('userData'), 'versions'),
    fs,
    pathUtil: path,
  };
}

ipcMain.handle('version-history:list', (_event, docPath) => {
  if (typeof docPath !== 'string' || !docPath) return [];
  // Never leak other documents' history via a guessed path
  const validation = validatePath(docPath);
  if (!validation.valid) return [];
  return VersionHistory.listVersions({ docPath, io: versionHistoryIo() });
});

ipcMain.handle('version-history:read', (_event, { docPath, id } = {}) => {
  const validation = typeof docPath === 'string' ? validatePath(docPath) : { valid: false };
  if (!validation.valid) throw new Error('Invalid document path');
  return VersionHistory.readVersion({ docPath, id, io: versionHistoryIo() });
});

ipcMain.handle('version-history:save', (_event, { docPath, content, label } = {}) => {
  const validation = typeof docPath === 'string' ? validatePath(docPath) : { valid: false };
  if (!validation.valid) throw new Error('Invalid document path');
  return VersionHistory.saveVersion({
    docPath,
    content,
    label: typeof label === 'string' ? label : 'manual',
    io: versionHistoryIo(),
  });
});

ipcMain.handle('version-history:delete', (_event, { docPath, id } = {}) => {
  const validation = typeof docPath === 'string' ? validatePath(docPath) : { valid: false };
  if (!validation.valid) return false;
  return VersionHistory.deleteVersion({ docPath, id, io: versionHistoryIo() });
});

// Handle actual printing when renderer is ready
ipcMain.on('do-print', (event, { withStyles }) => {
  if (mainWindow) {
    // Renderer has already hidden UI, waited 300ms, and prepared the page
    // Print immediately - DOM is fully rendered
    mainWindow.webContents.print({
      silent: false,
      printBackground: withStyles,
      color: true,
      margin: {
        marginType: 'default',
      },
    });
  }
});

// Handle printing with custom options from print preview dialog
ipcMain.on('do-print-with-options', (event, options) => {
  if (!mainWindow) return;
  const marginsMap = {
    default: {
      marginType: 'default',
    },
    narrow: {
      top: 0.4,
      bottom: 0.4,
      left: 0.4,
      right: 0.4,
    },
    wide: {
      top: 1.0,
      bottom: 1.0,
      left: 1.0,
      right: 1.0,
    },
    none: {
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    },
  };
  const printOptions = {
    silent: false,
    printBackground: options.background,
    landscape: options.orientation === 'landscape',
    scaleFactor: options.scale / 100,
    pageSize: options.paperSize,
  };
  if (options.margins && options.margins !== 'default') {
    printOptions.margins = marginsMap[options.margins];
  }
  mainWindow.webContents.print(printOptions);
});

// Handle renderer ready for file association
ipcMain.on('renderer-ready', (_event) => {
  rendererReady = true;
  if (app.pendingFile) {
    openFileFromPath(app.pendingFile);
    app.pendingFile = null;
  }
});

// Handle export with options
ipcMain.on('export-with-options', (event, { format, options }) => {
  if (!conversionLimiter()) {
    mainWindow.webContents.send('conversion-status', 'Please wait before converting again...');
    return;
  }
  performExportWithOptions(format, options);
});

// Handle batch conversion
ipcMain.on(
  'batch-convert',
  (event, { inputFolder, outputFolder, format, options, includeSubfolders }) => {
    if (!conversionLimiter()) {
      mainWindow.webContents.send('conversion-status', 'Please wait before converting again...');
      return;
    }
    performBatchConversion(inputFolder, outputFolder, format, options, includeSubfolders);
  }
);

// Handle folder selection for batch conversion
ipcMain.on('select-folder', (event, type) => {
  const folder = dialog.showOpenDialogSync(mainWindow, {
    properties: ['openDirectory'],
  });
  if (folder && folder[0]) {
    event.reply('folder-selected', {
      type,
      path: folder[0],
    });
  }
});
ipcMain.on('export-spreadsheet', (event, { content, format }) => {
  const outputFile = dialog.showSaveDialogSync(mainWindow, {
    defaultPath: currentFile.replace(/\.[^/.]+$/, `.${format}`),
    filters: [
      {
        name: format.toUpperCase(),
        extensions: [format],
      },
    ],
  });
  if (outputFile) {
    try {
      // Parse markdown content to extract tables
      const tables = extractTablesFromMarkdown(content);
      if (tables.length === 0) {
        dialog.showErrorBox('Export Error', 'No tables found in the markdown content');
        return;
      }
      if (format === 'csv') {
        // Convert tables to CSV format
        let csvContent = '';
        tables.forEach((table, index) => {
          if (index > 0) csvContent += '\n\n'; // Separate multiple tables
          if (tables.length > 1) csvContent += `"Table ${index + 1}"\n`;
          table.forEach((row) => {
            const csvRow = row
              .map((cell) => {
                // Escape quotes and wrap in quotes if necessary
                const cleanCell = cell.replace(/"/g, '""');
                return cleanCell.includes(',') ||
                  cleanCell.includes('"') ||
                  cleanCell.includes('\n')
                  ? `"${cleanCell}"`
                  : cleanCell;
              })
              .join(',');
            csvContent += csvRow + '\n';
          });
        });
        fs.writeFileSync(outputFile, csvContent, 'utf-8');
      } else if (format === 'xlsx') {
        // Native Excel workbook: one sheet per markdown table (no Pandoc needed)
        const { buildXlsx } = require('./main/XlsxExporter');
        const buffer = buildXlsx(tables);
        fs.writeFileSync(outputFile, buffer);
      }
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Export Complete',
        message: `${format.toUpperCase()} exported successfully to ${outputFile}`,
        buttons: ['OK'],
      });
    } catch (error) {
      dialog.showErrorBox(
        'Export Error',
        sanitizeErrorMessage(`Failed to export: ${error.message}`)
      );
    }
  }
});

// Helper function to extract tables from markdown
function extractTablesFromMarkdown(markdown) {
  const tables = [];
  const lines = markdown.split('\n');
  let currentTable = [];
  let inTable = false;
  for (const line of lines) {
    if (line.includes('|')) {
      if (!inTable) {
        inTable = true;
        currentTable = [];
      }

      // Skip separator lines (|---|---|)
      if (!line.match(/^\s*\|?\s*:?-+:?\s*\|/)) {
        const cells = line
          .split('|')
          .map((cell) => cell.trim())
          .filter((cell) => cell !== '');
        if (cells.length > 0) {
          currentTable.push(cells);
        }
      }
    } else if (inTable && line.trim() === '') {
      // End of table
      if (currentTable.length > 0) {
        tables.push(currentTable);
      }
      currentTable = [];
      inTable = false;
    }
  }

  // Add last table if exists
  if (currentTable.length > 0) {
    tables.push(currentTable);
  }
  return tables;
}
async function performBatchConversion(
  inputFolder,
  outputFolder,
  format,
  options,
  includeSubfolders = true
) {
  if (!fs.existsSync(inputFolder)) {
    dialog.showErrorBox('Error', 'Input folder does not exist');
    return;
  }

  // Create output folder if it doesn't exist
  if (!fs.existsSync(outputFolder)) {
    try {
      fs.mkdirSync(outputFolder, {
        recursive: true,
      });
    } catch (error) {
      dialog.showErrorBox(
        'Error',
        sanitizeErrorMessage(`Failed to create output folder: ${error.message}`)
      );
      return;
    }
  }

  // Find all markdown files in input folder
  const markdownFiles = [];
  function findMarkdownFiles(dir, recurse = true) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        if (recurse) {
          findMarkdownFiles(fullPath, recurse);
        }
      } else if (file.match(/\.(md|markdown)$/i)) {
        markdownFiles.push(fullPath);
      }
    }
  }
  findMarkdownFiles(inputFolder, includeSubfolders);
  if (markdownFiles.length === 0) {
    dialog.showErrorBox('No Files Found', 'No markdown files found in the selected folder');
    return;
  }

  // Verify Pandoc is available for formats that require it
  const needsPandoc = !['docx-enhanced', 'pdf-enhanced'].includes(format);
  if (needsPandoc) {
    const hasPandoc = await checkPandocAvailability();
    if (!hasPandoc) {
      dialog.showErrorBox(
        'Pandoc Not Found',
        'Pandoc is required for batch conversion but was not found.\n\n' +
          'Please install Pandoc from https://pandoc.org/installing.html or run: npm run download-tools'
      );
      return;
    }
  }

  // Show progress dialog
  let completedCount = 0;
  const totalCount = markdownFiles.length;

  // Process each file
  const processNextFile = async (index) => {
    if (index >= markdownFiles.length) {
      // All files processed
      const allSucceeded = completedCount === totalCount;
      const allFailed = completedCount === 0;
      dialog.showMessageBox(mainWindow, {
        type: allFailed ? 'error' : 'info',
        title: allSucceeded ? 'Batch Conversion Complete' : 'Batch Conversion Finished',
        message: allFailed
          ? `No files were converted to ${format.toUpperCase()}.`
          : `Converted ${completedCount} out of ${totalCount} files to ${format.toUpperCase()}.`,
        buttons: ['OK'],
      });
      return;
    }
    const inputFile = markdownFiles[index];
    const relativePath = path.relative(inputFolder, inputFile);
    let outputExtension = format;
    if (format === 'docx-enhanced') outputExtension = 'docx';
    if (format === 'pdf-enhanced') outputExtension = 'pdf';
    const outputFile = path.join(
      outputFolder,
      relativePath.replace(/\.(md|markdown)$/i, `.${outputExtension}`)
    );

    // Create subdirectories in output folder if needed
    const outputDir = path.dirname(outputFile);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, {
        recursive: true,
      });
    }

    // Handle DOCX Enhanced format with WordTemplateExporter
    if (format === 'docx-enhanced') {
      try {
        const content = fs.readFileSync(inputFile, 'utf-8');
        const exporter = new WordTemplateExporter(wordTemplatePath, templateStartPage);
        await exporter.convert(content, outputFile);
        completedCount++;

        // Update progress
        mainWindow.webContents.send('batch-progress', {
          completed: index + 1,
          total: totalCount,
          currentFile: path.basename(inputFile),
          success: true,
        });

        // Process next file
        processNextFile(index + 1);
      } catch {
        // Update progress with error
        mainWindow.webContents.send('batch-progress', {
          completed: index + 1,
          total: totalCount,
          currentFile: path.basename(inputFile),
          success: false,
        });

        // Process next file even if this one failed
        processNextFile(index + 1);
      }
      return;
    }

    // Handle PDF Enhanced format with Word Template → PDF conversion
    if (format === 'pdf-enhanced') {
      try {
        const content = fs.readFileSync(inputFile, 'utf-8');

        // Step 1: Create temporary DOCX file using Word template
        const tempDocxPath = outputFile.replace(/\.pdf$/, '_temp.docx');
        const exporter = new WordTemplateExporter(wordTemplatePath, templateStartPage);
        await exporter.convert(content, tempDocxPath);

        // Step 2: Convert DOCX to PDF using LibreOffice (using execFile for safety)
        const soffice =
          process.platform === 'win32'
            ? 'C:\\Program Files\\LibreOffice\\program\\soffice.exe'
            : 'soffice';
        const outputDir = path.dirname(outputFile);
        const sofficeArgs = [
          '--headless',
          '--convert-to',
          'pdf',
          '--outdir',
          outputDir,
          tempDocxPath,
        ];
        execFile(soffice, sofficeArgs, (error, _stdout, _stderr) => {
          // Clean up temporary DOCX file
          try {
            fs.unlinkSync(tempDocxPath);
          } catch (e) {
            console.error('Failed to delete temp file:', e);
          }
          if (error) {
            // Update progress with error
            mainWindow.webContents.send('batch-progress', {
              completed: index + 1,
              total: totalCount,
              currentFile: path.basename(inputFile),
              success: false,
            });
            processNextFile(index + 1);
            return;
          }

          // LibreOffice creates file with same base name as input
          const generatedPdfPath = tempDocxPath.replace(/\.docx$/, '.pdf');

          // Rename if needed
          if (generatedPdfPath !== outputFile) {
            try {
              fs.renameSync(generatedPdfPath, outputFile);
            } catch (e) {
              console.error('Failed to rename PDF:', e);
            }
          }
          completedCount++;

          // Update progress
          mainWindow.webContents.send('batch-progress', {
            completed: index + 1,
            total: totalCount,
            currentFile: path.basename(inputFile),
            success: true,
          });

          // Process next file
          processNextFile(index + 1);
        });
      } catch {
        // Update progress with error
        mainWindow.webContents.send('batch-progress', {
          completed: index + 1,
          total: totalCount,
          currentFile: path.basename(inputFile),
          success: false,
        });

        // Process next file even if this one failed
        processNextFile(index + 1);
      }
      return;
    }

    // Build pandoc command for other formats
    let pandocInputFile = inputFile;
    let batchTempInputDir = null;
    let batchTempInputFile = null;

    // Pre-process markdown for Word output so that <style> blocks, HTML
    // comments, and <div> tags do not appear as visible text.
    if (format === 'docx') {
      try {
        const content = fs.readFileSync(inputFile, 'utf-8');
        const cleanedContent = WordTemplateExporter.preprocessMarkdownForWordExport(content);
        batchTempInputDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'mc_batch_export_'));
        batchTempInputFile = path.join(batchTempInputDir, path.basename(inputFile));
        fs.writeFileSync(batchTempInputFile, cleanedContent, 'utf-8');
        pandocInputFile = batchTempInputFile;
      } catch (preprocessError) {
        console.error(
          `Batch: Failed to pre-process ${path.basename(inputFile)}:`,
          preprocessError.message
        );
        mainWindow.webContents.send('batch-progress', {
          completed: index + 1,
          total: totalCount,
          currentFile: path.basename(inputFile),
          success: false,
        });
        processNextFile(index + 1);
        return;
      }
    }

    // Build the argument array with the shared export options (values are
    // passed to execFile as single literal argv elements — SEC-1)
    const pandocArgs = PandocArgs.buildPandocArgs({
      inputFile: pandocInputFile,
      outputFile,
      format,
      options,
    });

    // Add PDF-specific options with header/footer support
    if (format === 'pdf') {
      PandocArgs.appendPdfEngineOptions(pandocArgs, {
        pdfEngine: options.pdfEngine,
        geometry: options.geometry,
      });

      // Add monospace font settings for code blocks (ASCII art preservation)
      pandocArgs.push('-V', 'monofont=Consolas');
      pandocArgs.push('--highlight-style=tango');

      // Add header/footer if enabled
      if (headerFooterSettings.enabled) {
        const filename = path.basename(inputFile, path.extname(inputFile));
        const metadata = {
          filename,
          title: filename,
          author: '',
        };
        const headerLeft = processDynamicFields(headerFooterSettings.header.left, metadata);
        const headerCenter = processDynamicFields(headerFooterSettings.header.center, metadata);
        const headerRight = processDynamicFields(headerFooterSettings.header.right, metadata);
        const footerLeft = processDynamicFields(headerFooterSettings.footer.left, metadata);
        const footerCenter = processDynamicFields(headerFooterSettings.footer.center, metadata);
        const footerRight = processDynamicFields(headerFooterSettings.footer.right, metadata);

        // Create LaTeX header
        const latexHeader = `
\\usepackage{fancyhdr}
\\pagestyle{fancy}
\\fancyhf{}
\\lhead{${headerLeft.replace(/\\/g, '\\\\')}}
\\chead{${headerCenter.replace(/\\/g, '\\\\')}}
\\rhead{${headerRight.replace(/\\/g, '\\\\')}}
\\lfoot{${footerLeft.replace(/\\/g, '\\\\')}}
\\cfoot{${footerCenter
          .replace(/[$]PAGE[$]/g, '\\\\thepage')
          .replace(/[$]TOTAL[$]/g, '\\\\pageref{LastPage}')
          .replace(/\\/g, '\\\\')}}
\\rfoot{${footerRight.replace(/\\/g, '\\\\')}}
\\renewcommand{\\headrulewidth}{0.4pt}
\\renewcommand{\\footrulewidth}{0.4pt}
`;
        const headerFile = path.join(require('os').tmpdir(), `header_batch_${Date.now()}.tex`);
        fs.writeFileSync(headerFile, latexHeader, 'utf-8');
        pandocArgs.push(`--include-in-header=${headerFile}`);
        pandocArgs.push('--variable', 'header-includes=\\\\usepackage{lastpage}');
      }
    }

    // Add PowerPoint footer if enabled
    if (format === 'pptx' && headerFooterSettings.enabled && headerFooterSettings.footer.center) {
      const filename = path.basename(inputFile, path.extname(inputFile));
      const metadata = {
        filename,
        title: filename,
        author: '',
      };
      const footerText = processDynamicFields(headerFooterSettings.footer.center, metadata);
      PandocArgs.appendFooterVariable(pandocArgs, footerText);
    }

    // Execute conversion with the argument array
    runPandocArgs(pandocArgs, async (error, _stdout, stderr) => {
      // Clean up temporary pre-processed input file and directory
      if (batchTempInputFile) {
        try {
          fs.unlinkSync(batchTempInputFile);
        } catch {
          // Ignore cleanup errors
        }
      }
      if (batchTempInputDir) {
        try {
          fs.rmdirSync(batchTempInputDir);
        } catch {
          // Ignore cleanup errors
        }
      }

      if (error) {
        console.error(
          `Batch: Failed to convert ${path.basename(inputFile)}:`,
          error.message,
          stderr
        );
      } else {
        // Add headers/footers to DOCX if enabled
        if (format === 'docx' && headerFooterSettings.enabled) {
          try {
            const filename = path.basename(inputFile, path.extname(inputFile));
            const metadata = {
              filename,
              title: filename,
              author: '',
            };
            await addHeaderFooterToDocx(outputFile, metadata);
          } catch (hfError) {
            console.error('Batch: Error adding headers/footers to DOCX:', hfError);
          }
        }
        completedCount++;
      }

      // Update progress (you could send this to renderer for a progress bar)
      mainWindow.webContents.send('batch-progress', {
        completed: index + 1,
        total: totalCount,
        currentFile: path.basename(inputFile),
        success: !error,
      });

      // Process next file
      processNextFile(index + 1);
    });
  };

  // Start processing
  processNextFile(0);
}

// Handle command line interface for file conversion
function handleCLIConversion(args) {
  const command = args[0];
  const filePath = args[args.length - 1]; // File path is always last argument

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    app.quit();
    return;
  }

  // Show conversion dialog for --convert command
  if (command === '--convert') {
    showConversionDialog(filePath);
    return;
  }

  // Direct conversion for --convert-to command
  if (command === '--convert-to' && args.length >= 3) {
    const format = args[1];
    performCLIConversion(filePath, format);
    return;
  }
  console.error('Usage: --convert <file> OR --convert-to <format> <file>');
  app.quit();
}

// Show conversion dialog for CLI
function showConversionDialog(filePath) {
  const { dialog } = require('electron');

  // Create a hidden window for dialog operations
  const hiddenWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  const formats = [
    {
      name: 'PDF',
      value: 'pdf',
    },
    {
      name: 'HTML',
      value: 'html',
    },
    {
      name: 'DOCX',
      value: 'docx',
    },
    {
      name: 'LaTeX',
      value: 'latex',
    },
    {
      name: 'RTF',
      value: 'rtf',
    },
    {
      name: 'ODT',
      value: 'odt',
    },
    {
      name: 'PowerPoint',
      value: 'pptx',
    },
  ];

  // Create format selection dialog using message box
  const formatButtons = formats.map((f) => f.name);
  formatButtons.push('Cancel');
  dialog
    .showMessageBox(hiddenWindow, {
      type: 'question',
      title: 'PanConverter - Choose Format',
      message: `Convert "${path.basename(filePath)}" to:`,
      detail: 'Select the output format for conversion',
      buttons: formatButtons,
      defaultId: 0,
      cancelId: formatButtons.length - 1,
    })
    .then((result) => {
      if (result.response < formats.length) {
        const selectedFormat = formats[result.response].value;
        performCLIConversion(filePath, selectedFormat);
      } else {
        app.quit();
      }
      hiddenWindow.destroy();
    });
}

// Perform CLI conversion
function performCLIConversion(inputPath, format) {
  try {
    const content = fs.readFileSync(inputPath, 'utf-8');
    const outputPath = inputPath.replace(/\.[^/.]+$/, `.${format}`);
    // Convert with an argument array (input/output paths are single argv elements)
    const pandocArgs = buildCLIConversionArgs(content, format, outputPath);
    runPandocArgs(pandocArgs, (error, stdout, stderr) => {
      if (error) {
        console.error(`Conversion failed: ${error.message}`);
        if (stderr) console.error(`Details: ${stderr}`);
        app.quit();
        return;
      }
      // Show Windows notification (using exec for PowerShell is acceptable here - hardcoded command)
      if (process.platform === 'win32') {
        const iconPath = path.join(__dirname, '../assets/icon.png');
        execFile(
          'powershell',
          [
            '-Command',
            `New-BurntToastNotification -Text 'PanConverter', 'File converted to ${format.toUpperCase()}' -AppLogo '${iconPath}'`,
          ],
          () => {}
        );
      }
      app.quit();
    });
  } catch (error) {
    console.error(`Error reading file: ${error.message}`);
    app.quit();
  }
}

// Build pandoc argument array for CLI conversion (temp input file plus
// format-specific flags; every value is a single literal argv element)
function buildCLIConversionArgs(content, format, outputPath) {
  const inputFile = path.join(require('os').tmpdir(), `panconverter_temp_${Date.now()}.md`);
  fs.writeFileSync(inputFile, content, 'utf-8');
  let args = [inputFile, '-o', outputPath];

  // Get metadata for dynamic fields
  const filename = currentFile ? path.basename(currentFile, path.extname(currentFile)) : 'document';
  const metadata = {
    filename: filename,
    title: filename,
    author: '',
  };
  switch (format) {
    case 'pdf':
      args.push('--pdf-engine=xelatex', '-V', 'geometry:margin=1in');

      // Add page size and orientation
      const pageSize = PAGE_SIZES[pageSettings.size];
      if (pageSize) {
        args.push('-V', `geometry:papersize=${pageSize.pandoc}`);
      } else if (pageSettings.customWidth && pageSettings.customHeight) {
        // Custom page size
        args.push('-V', `geometry:paperwidth=${pageSettings.customWidth}`);
        args.push('-V', `geometry:paperheight=${pageSettings.customHeight}`);
      }

      // Add orientation
      if (pageSettings.orientation === 'landscape') {
        args.push('-V', 'geometry:landscape');
      }

      // Add monospace font settings for code blocks (ASCII art preservation)
      args.push('-V', 'monofont=Consolas');
      args.push('--highlight-style=tango');

      // Add header/footer if enabled
      if (headerFooterSettings.enabled) {
        // Process dynamic fields
        const headerLeft = processDynamicFields(headerFooterSettings.header.left, metadata);
        const headerCenter = processDynamicFields(headerFooterSettings.header.center, metadata);
        const headerRight = processDynamicFields(headerFooterSettings.header.right, metadata);
        const footerLeft = processDynamicFields(headerFooterSettings.footer.left, metadata);
        const footerCenter = processDynamicFields(headerFooterSettings.footer.center, metadata);
        const footerRight = processDynamicFields(headerFooterSettings.footer.right, metadata);

        // Add Pandoc variables for fancyhdr package
        if (headerLeft) args.push('--variable', `header-left=${headerLeft}`);
        if (headerCenter) args.push('--variable', `header-center=${headerCenter}`);
        if (headerRight) args.push('--variable', `header-right=${headerRight}`);
        if (footerLeft) args.push('--variable', `footer-left=${footerLeft}`);
        if (footerCenter) args.push('--variable', `footer-center=${footerCenter}`);
        if (footerRight) args.push('--variable', `footer-right=${footerRight}`);

        // Create custom LaTeX header with fancyhdr
        const latexHeader = `
\\usepackage{fancyhdr}
\\pagestyle{fancy}
\\fancyhf{}
\\lhead{${headerLeft.replace(/\\/g, '\\\\')}}
\\chead{${headerCenter.replace(/\\/g, '\\\\')}}
\\rhead{${headerRight.replace(/\\/g, '\\\\')}}
\\lfoot{${footerLeft.replace(/\\/g, '\\\\')}}
\\cfoot{${footerCenter
          .replace(/[$]PAGE[$]/g, '\\\\thepage')
          .replace(/[$]TOTAL[$]/g, '\\\\pageref{LastPage}')
          .replace(/\\/g, '\\\\')}}
\\rfoot{${footerRight.replace(/\\/g, '\\\\')}}
\\renewcommand{\\headrulewidth}{0.4pt}
\\renewcommand{\\footrulewidth}{0.4pt}
`;
        const headerFile = path.join(require('os').tmpdir(), `header_${Date.now()}.tex`);
        fs.writeFileSync(headerFile, latexHeader, 'utf-8');
        args.push(`--include-in-header=${headerFile}`);

        // Add lastpage package for $TOTAL$ support
        args.push('--variable', 'header-includes=\\\\usepackage{lastpage}');
      }
      break;
    case 'html':
      // Standalone HTML; a bare --css (or --self-contained, removed in Pandoc 3.x)
      // without a value is invalid argv and makes pandoc exit with an error.
      args.push('--standalone');
      break;
    case 'docx':
      // DOCX headers/footers are applied via addHeaderFooterToDocx() post-processing
      // after export; a bare --reference-doc without a value would be invalid argv.
      break;
    case 'odt':
      // ODT headers/footers are handled via reference document
      break;
    case 'latex':
      args.push('--standalone');
      break;
    case 'pptx':
      args.push('--slide-level=2');
      // PowerPoint footer can be added with --variable
      if (headerFooterSettings.enabled && headerFooterSettings.footer.center) {
        const footerText = processDynamicFields(headerFooterSettings.footer.center, metadata);
        PandocArgs.appendFooterVariable(args, footerText);
      }
      break;
    case 'json':
      args = [inputFile, '-t', 'json', '-o', outputPath];
      break;
    case 'yaml':
      args = [inputFile, '-t', 'markdown', '-o', outputPath];
      break;
    case 'xml':
      args = [inputFile, '-t', 'jats', '-o', outputPath];
      break;
    case 'toml':
      // TOML: save raw markdown content with .toml extension
      args = [inputFile, '-t', 'markdown', '-o', outputPath];
      break;
    case 'revealjs':
      args = [inputFile, '-t', 'revealjs', '-s', '-o', outputPath, '--slide-level=2'];
      break;
    case 'beamer':
      args = [inputFile, '-t', 'beamer', '-o', outputPath];
      break;
    case 'confluence':
    case 'jira':
      args = [inputFile, '-t', 'jira', '-o', outputPath];
      break;
  }
  return args;
}
app.whenReady().then(() => {
  // Load saved Word template path and settings
  wordTemplatePath = store.get('wordTemplatePath', null);
  templateStartPage = store.get('templateStartPage', 3);

  // Load header/footer settings
  const savedHFSettings = store.get('headerFooterSettings', null);
  if (savedHFSettings) {
    headerFooterSettings = savedHFSettings;
  }

  // Load page size settings
  const savedPageSettings = store.get('pageSettings', null);
  if (savedPageSettings) {
    pageSettings = savedPageSettings;
  }

  // Check for command line conversion requests
  const args = process.argv.slice(2);
  if (args.length >= 2 && (args[0] === '--convert' || args[0] === '--convert-to')) {
    handleCLIConversion(args);
    return; // Don't create window for CLI operations
  }
  createWindow();

  // Handle file association on app startup
  // In packaged apps, process.argv structure is different:
  // Development: ['electron', 'app.js', 'file.md'] - need slice(2)
  // Packaged: ['PanConverter.exe', 'file.md'] - need slice(1)
  // We'll check all arguments after the executable

  // Start from index 1 (skip executable) and check each argument
  const startIndex = app.isPackaged ? 1 : 2;
  const fileArgs = process.argv.slice(startIndex);
  for (const arg of fileArgs) {
    if (arg.endsWith('.md') || arg.endsWith('.markdown')) {
      // Try to resolve the path (might be relative)
      const resolvedPath = path.isAbsolute(arg) ? arg : path.resolve(process.cwd(), arg);
      if (fs.existsSync(resolvedPath)) {
        // Store the file to open after window is ready

        app.pendingFile = resolvedPath;
        break;
      } else {
      }
    }
  }
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Clear recent files from disk
function clearRecentFilesOnDisk() {
  const userDataPath = app.getPath('userData');
  const recentFilesPath = path.join(userDataPath, 'recent-files.json');
  fs.writeFileSync(recentFilesPath, JSON.stringify([], null, 2));
  createMenu();
}

// IPC handlers for recent files
ipcMain.on('save-recent-files', (event, recentFiles) => {
  try {
    const userDataPath = app.getPath('userData');
    const recentFilesPath = path.join(userDataPath, 'recent-files.json');
    fs.writeFileSync(recentFilesPath, JSON.stringify(recentFiles, null, 2));
  } catch (error) {
    console.error('Error saving recent files:', error);
  }
});
ipcMain.on('clear-recent-files', (event) => {
  try {
    clearRecentFilesOnDisk();
    event.reply('recent-files-cleared');
  } catch (error) {
    console.error('Error clearing recent files:', error);
  }
});

// Plugins (loaded in the renderer) report the export formats they've
// registered; rebuild the Export menu so they show up as entries.
// createMenu() is idempotent and already re-invoked elsewhere (e.g. after
// clearRecentFilesOnDisk() above) so calling it again here is safe.
ipcMain.on('plugin-export-formats-registered', (event, formats) => {
  pluginExportFormats = Array.isArray(formats)
    ? formats.filter((f) => f && typeof f.id === 'string')
    : [];
  createMenu();
});

// Result of a plugin export handler running in the renderer (see
// runPluginExportFormat() / the Export menu wiring above).
ipcMain.on('plugin-export-format-result', (event, result) => {
  const { outputPath, success, error } = result || {};
  if (success) {
    showExportSuccess(outputPath);
  } else {
    dialog.showErrorBox('Export Error', sanitizeErrorMessage(error || 'Unknown error'));
  }
});

// Handle file opening on macOS
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow && rendererReady) {
    openFileFromPath(filePath);
  } else {
    // Store the file path to open after window and renderer are ready
    app.pendingFile = filePath;
  }
});

// ============================================
// Deep link protocol: markdownconverter://open?path=<encoded abs path>
// ============================================
// Lets external tools (browsers, launchers, note-taking scripts) hand a
// document straight to a running instance. Only the 'open' action exists;
// the path must be absolute, exist, and pass the same size guard as normal
// opens. Returns true when the link was consumed.
function handleDeepLink(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    return false;
  }
  if (url.protocol !== 'markdownconverter:') return false;

  const action = url.hostname || url.pathname.replace(/^\/+/, '');
  if (action !== 'open') {
    dialog.showErrorBox('Deep Link', `Unknown action "${action}". Only "open" is supported.`);
    return true;
  }

  const target = url.searchParams.get('path');
  if (!target || !path.isAbsolute(target)) {
    dialog.showErrorBox('Deep Link', 'The link must include an absolute ?path=… parameter.');
    return true;
  }
  const validation = validatePath(target);
  if (!validation.valid || !fs.existsSync(validation.resolved)) {
    dialog.showErrorBox('Deep Link', 'The linked file does not exist or is not accessible.');
    return true;
  }

  if (rendererReady) {
    openFileFromPath(validation.resolved);
  } else {
    app.pendingFile = validation.resolved;
  }
  return true;
}

// macOS delivers protocol clicks as open-url events
app.on('open-url', (event, urlString) => {
  event.preventDefault();
  handleDeepLink(urlString);
});

// Register the custom protocol once the app is ready (idempotent)
app.whenReady().then(() => {
  app.setAsDefaultProtocolClient('markdownconverter');
});

// Handle file opening from command line or file association
function openFileFromPath(filePath) {
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    if (stats.size > MAX_FILE_SIZE) {
      dialog.showErrorBox('File Too Large', `File exceeds the ${MAX_FILE_SIZE_MB}MB size limit.`);
      return;
    }
    currentFile = filePath;
    const content = fs.readFileSync(filePath, 'utf-8');
    if (mainWindow && mainWindow.webContents && rendererReady) {
      // Send file immediately - renderer-ready means UI is initialized

      mainWindow.webContents.send('file-opened', {
        path: filePath,
        content,
      });
    } else {
      // Store file to open after renderer is ready

      app.pendingFile = filePath;
    }
  } else {
    console.error('[MAIN] File does not exist:', filePath);
  }
}

// ========================================
// PDF OPERATIONS — delegates to main/PDFOperations.js
// ========================================

ipcMain.on('process-pdf-operation', async (event, data) => {
  try {
    mainWindow.webContents.send('pdf-operation-progress', {
      message: `Processing ${data.operation}...`,
      progress: 10,
    });
    const result = await PDFOperations.executeOperation(data.operation, data);
    mainWindow.webContents.send('pdf-operation-complete', result);
  } catch (error) {
    mainWindow.webContents.send('pdf-operation-complete', {
      success: false,
      error: error.message,
    });
  }
});
// Reports the PDF library's encryption capability so the renderer can
// disable the password-protection controls instead of letting the user
// fill the form only to see the operation fail.
ipcMain.handle('get-pdf-capabilities', async () => ({
  passwordProtection: await PDFOperations.pdfEncryptionSupported,
}));

// ================================
// AI Assistant plugin (main-process side)
// ================================
// All AI provider traffic flows through the main process: the renderer CSP
// stays closed to AI endpoints and API keys never cross the IPC boundary.
// Provider settings live in settings.json under plugins.ai-assistant.*
// (written by the plugin settings store), so the handlers below read them
// with the same store the rest of the app uses.
const AiProviders = require('./main/AiProviders');

/** Read the AI Assistant plugin's provider settings from the settings store. */
function getAiAssistantSettings() {
  return {
    provider: store.get('plugins.ai-assistant.provider', ''),
    model: store.get('plugins.ai-assistant.model', ''),
    baseUrl: store.get('plugins.ai-assistant.baseUrl', ''),
    apiKey: store.get('plugins.ai-assistant.apiKey', ''),
    temperature: store.get('plugins.ai-assistant.temperature', 0.7),
  };
}

/**
 * Report provider/model and whether a usable configuration exists — without
 * ever returning the key material to the renderer.
 */
ipcMain.handle('ai-assistant:status', async () => {
  const settings = getAiAssistantSettings();
  let configured = false;
  try {
    // resolveSettings throws when the provider is unknown or a required key
    // is missing — exactly the "not configured" definition we want.
    AiProviders.resolveSettings(settings);
    configured = true;
  } catch {
    configured = false;
  }
  return {
    configured,
    provider: settings.provider,
    model: settings.model || AiProviders.PROVIDER_DEFAULTS[settings.provider]?.defaultModel || '',
  };
});

/**
 * Run a chat completion. The payload is {system?, messages:[{role,content}]}
 * with provider settings taken from the store, never from the caller — a
 * compromised renderer cannot redirect requests to an attacker endpoint.
 */
ipcMain.handle('ai-assistant:complete', async (_event, request) => {
  const settings = getAiAssistantSettings();
  try {
    return await AiProviders.complete({ ...request, ...settings });
  } catch (error) {
    // AiProviderError messages are already user-safe; wrap anything else
    return {
      error:
        error.code === undefined
          ? 'AI request failed. Check the provider settings and your connection.'
          : error.message,
      code: error.code || 'failed',
    };
  }
});

ipcMain.on('get-pdf-page-count', async (event, filePath) => {
  try {
    const count = await PDFOperations.getPageCount(filePath);
    event.reply('pdf-page-count', {
      count,
    });
  } catch (error) {
    event.reply('pdf-page-count', {
      error: error.message,
    });
  }
});
ipcMain.on('get-pdf-form-fields', async (event, filePath) => {
  try {
    const result = await PDFOperations.pdfGetFormFields({ inputPath: filePath });
    event.reply('pdf-form-fields', result);
  } catch (error) {
    event.reply('pdf-form-fields', {
      success: false,
      error: error.message,
    });
  }
});

// IPC Handler for folder selection (for PDF operations)
ipcMain.on('select-pdf-folder', (event, inputId) => {
  const folder = dialog.showOpenDialogSync(mainWindow, {
    properties: ['openDirectory'],
  });
  if (folder && folder[0]) {
    event.reply('pdf-folder-selected', {
      inputId,
      path: folder[0],
    });
  }
});

// ========================================
// IMAGE OPERATIONS — delegates to main/ImageOperations.js
// ========================================

ipcMain.handle('process-image-operation', async (event, { operation, data }) => {
  try {
    return await ImageOperations.executeOperation(operation, {
      ...data,
      maxFileSize: MAX_FILE_SIZE,
    });
  } catch (error) {
    return { success: false, error: sanitizeErrorMessage(error.message) };
  }
});

// ========================================
// AUDIO OPERATIONS — delegates to main/AudioOperations.js
// ========================================

ipcMain.handle('process-audio-operation', async (event, { operation, data }) => {
  try {
    return await AudioOperations.executeOperation(operation, data, {
      ffmpegPath: getFFmpegPath(),
    });
  } catch (error) {
    return { success: false, error: sanitizeErrorMessage(error.message) };
  }
});

// ========================================
// VIDEO OPERATIONS — delegates to main/VideoOperations.js
// ========================================

ipcMain.handle('process-video-operation', async (event, { operation, data }) => {
  try {
    return await VideoOperations.executeOperation(operation, data, {
      ffmpegPath: getFFmpegPath(),
    });
  } catch (error) {
    return { success: false, error: sanitizeErrorMessage(error.message) };
  }
});

// ========================================
// BATCH MEDIA OPERATIONS — apply one image/audio/video operation to every matching
// file in a folder, mirroring the ipcMain.on('universal-convert-batch', ...) /
// performBatchConversion() batch-folder pattern above: collect matching files
// (collectFilesByExtension, generalizing that handler's inline collectFiles()),
// loop executeOperation() over them reporting progress per file, then show a
// completion dialog with completed/failed counts.
// ========================================

// Per-kind executeOperation callers — Image/Audio/Video Operations modules take
// slightly different call shapes (Image bakes maxFileSize into `data`; Audio/Video
// take a third {ffmpegPath} options object), so each is wrapped identically to how
// the single-file process-*-operation handlers above already call them.
const BATCH_MEDIA_EXECUTORS = {
  image: (operation, fileData) =>
    ImageOperations.executeOperation(operation, { ...fileData, maxFileSize: MAX_FILE_SIZE }),
  audio: (operation, fileData) =>
    AudioOperations.executeOperation(operation, fileData, { ffmpegPath: getFFmpegPath() }),
  video: (operation, fileData) =>
    VideoOperations.executeOperation(operation, fileData, { ffmpegPath: getFFmpegPath() }),
};

// How to derive each output file's extension (or, for 'frames', its output directory)
// from the source file. 'fromFormat' means "use data.format" (the operation has a
// format dropdown in the dialog); 'original' keeps the source file's extension;
// 'fixed' always uses a specific extension. Operations not listed here (audio
// 'merge') don't fit the "apply the same operation to every file" batch model —
// merge combines many inputs into a single output — so batch mode is unavailable
// for them (enforced both in the dialog UI and defensively here).
const BATCH_OUTPUT_SPEC = {
  image: {
    convert: { ext: 'fromFormat' },
    resize: { ext: 'original' },
    compress: { ext: 'original' },
    rotate: { ext: 'original' },
  },
  audio: {
    convert: { ext: 'fromFormat' },
    trim: { ext: 'original' },
    extract: { ext: 'fixed', value: 'm4a' },
  },
  video: {
    convert: { ext: 'original' },
    compress: { ext: 'original' },
    trim: { ext: 'original' },
    gif: { ext: 'fixed', value: 'gif' },
    frames: { dir: true },
  },
};

async function runMediaBatchOperation({
  mediaKind,
  operation,
  inputFolder,
  outputFolder,
  includeSubfolders,
  extensions,
  data,
}) {
  const spec = (BATCH_OUTPUT_SPEC[mediaKind] || {})[operation];
  if (!spec) {
    mainWindow.webContents.send('media-batch-complete', {
      success: false,
      error: `Batch mode is not supported for this operation.`,
    });
    return;
  }

  if (!inputFolder || !fs.existsSync(inputFolder)) {
    mainWindow.webContents.send('media-batch-complete', {
      success: false,
      error: 'Input folder does not exist.',
    });
    return;
  }

  try {
    fs.mkdirSync(outputFolder, { recursive: true });
  } catch (error) {
    mainWindow.webContents.send('media-batch-complete', {
      success: false,
      error: sanitizeErrorMessage(`Failed to create output folder: ${error.message}`),
    });
    return;
  }

  const files = collectFilesByExtension(inputFolder, extensions, includeSubfolders !== false);
  if (files.length === 0) {
    mainWindow.webContents.send('media-batch-complete', {
      success: false,
      error: 'No matching files found in the selected folder.',
    });
    return;
  }

  const executor = BATCH_MEDIA_EXECUTORS[mediaKind];
  const total = files.length;
  let completed = 0;
  let failed = 0;

  for (const filePath of files) {
    mainWindow.webContents.send('media-batch-progress', {
      completed,
      failed,
      total,
      currentFile: path.basename(filePath),
    });

    const baseName = path.basename(filePath, path.extname(filePath));
    const relativeDir = path.dirname(path.relative(inputFolder, filePath));
    const targetDir = relativeDir === '.' ? outputFolder : path.join(outputFolder, relativeDir);
    fs.mkdirSync(targetDir, { recursive: true });

    const fileData = { ...data, inputPath: filePath };
    if (spec.dir) {
      fileData.outputDir = path.join(targetDir, baseName);
    } else {
      const ext =
        spec.ext === 'fromFormat'
          ? data.format
          : spec.ext === 'fixed'
            ? spec.value
            : path.extname(filePath).replace(/^\./, '');
      fileData.outputPath = path.join(targetDir, `${baseName}.${ext}`);
    }

    try {
      await executor(operation, fileData);
      completed++;
    } catch {
      failed++;
    }
  }

  mainWindow.webContents.send('media-batch-progress', {
    completed,
    failed,
    total,
    currentFile: null,
  });
  mainWindow.webContents.send('media-batch-complete', {
    success: true,
    completed,
    failed,
    total,
    outputFolder,
  });

  const allSucceeded = failed === 0;
  dialog.showMessageBox(mainWindow, {
    type: allSucceeded ? 'info' : 'warning',
    title: allSucceeded ? 'Batch Conversion Complete' : 'Batch Conversion Finished',
    message: 'Batch conversion finished!',
    detail: `Completed: ${completed}/${total} files${failed > 0 ? ` (${failed} failed)` : ''}\nOutput: ${outputFolder}`,
    buttons: ['OK'],
  });
}

ipcMain.on(
  'batch-image-operation',
  async (event, { operation, inputFolder, outputFolder, includeSubfolders, extensions, data }) => {
    if (!conversionLimiter()) {
      mainWindow.webContents.send('conversion-status', 'Please wait before converting again...');
      return;
    }
    await runMediaBatchOperation({
      mediaKind: 'image',
      operation,
      inputFolder,
      outputFolder,
      includeSubfolders,
      extensions,
      data,
    });
  }
);

ipcMain.on(
  'batch-audio-operation',
  async (event, { operation, inputFolder, outputFolder, includeSubfolders, extensions, data }) => {
    if (!conversionLimiter()) {
      mainWindow.webContents.send('conversion-status', 'Please wait before converting again...');
      return;
    }
    await runMediaBatchOperation({
      mediaKind: 'audio',
      operation,
      inputFolder,
      outputFolder,
      includeSubfolders,
      extensions,
      data,
    });
  }
);

ipcMain.on(
  'batch-video-operation',
  async (event, { operation, inputFolder, outputFolder, includeSubfolders, extensions, data }) => {
    if (!conversionLimiter()) {
      mainWindow.webContents.send('conversion-status', 'Please wait before converting again...');
      return;
    }
    await runMediaBatchOperation({
      mediaKind: 'video',
      operation,
      inputFolder,
      outputFolder,
      includeSubfolders,
      extensions,
      data,
    });
  }
);

// ========================================
// BATCH PDF OPERATIONS — apply one PDFOperations.executeOperation() operation
// (watermark, compress, rotate, split, ... — every per-file non-interactive op;
// see PDF_BATCH_OUTPUT_SPEC in src/main/PDFBatchOperations.js for exclusions) to
// every .pdf in a folder, mirroring the runMediaBatchOperation() batch-folder
// pattern above: collect matching files, loop the operation over them with
// per-file progress, then a completion dialog with completed/failed counts.
// ========================================
ipcMain.on(
  'batch-pdf-operation',
  async (event, { operation, data, inputFolder, outputFolder, includeSubfolders }) => {
    if (!conversionLimiter()) {
      mainWindow.webContents.send('conversion-status', 'Please wait before converting again...');
      return;
    }
    await runPDFBatchOperation({
      operation,
      inputFolder,
      outputFolder,
      includeSubfolders,
      data,
      maxFileSize: MAX_FILE_SIZE,
      sanitizeError: sanitizeErrorMessage,
      onProgress: (progress) => mainWindow.webContents.send('batch-progress', progress),
      onComplete: (result) => {
        mainWindow.webContents.send('pdf-batch-complete', result);
        if (!result.success) return;

        const allSucceeded = result.failed === 0;
        dialog.showMessageBox(mainWindow, {
          type: allSucceeded ? 'info' : 'warning',
          title: allSucceeded ? 'Batch PDF Operation Complete' : 'Batch PDF Operation Finished',
          message: 'Batch PDF operation finished!',
          detail: `Completed: ${result.completed}/${result.total} files${result.failed > 0 ? ` (${result.failed} failed)` : ''}\nOutput: ${result.outputFolder}`,
          buttons: ['OK'],
        });
      },
    });
  }
);

// IPC Handler for folder selection (for batch image operations)
ipcMain.on('select-image-folder', (event, inputId) => {
  const folder = dialog.showOpenDialogSync(mainWindow, {
    properties: ['openDirectory'],
  });
  if (folder && folder[0]) {
    event.reply('image-folder-selected', {
      inputId,
      path: folder[0],
    });
  }
});

// ============================================
// ASCII Art Generator Window
// ============================================
let asciiGeneratorWindow = null;
function openAsciiGenerator() {
  if (asciiGeneratorWindow) {
    asciiGeneratorWindow.focus();
    return;
  }
  asciiGeneratorWindow = new BrowserWindow({
    width: 800,
    height: 700,
    parent: mainWindow,
    modal: false,
    title: 'ASCII Art Generator',
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  asciiGeneratorWindow.loadFile(path.join(__dirname, 'ascii-generator.html'));
  asciiGeneratorWindow.setMenuBarVisibility(false);
  asciiGeneratorWindow.on('closed', () => {
    asciiGeneratorWindow = null;
  });
}
ipcMain.on('open-ascii-generator', () => {
  openAsciiGenerator();
});

// ============================================
// Table Generator Window
// ============================================
let tableGeneratorWindow = null;
function openTableGenerator() {
  if (tableGeneratorWindow) {
    tableGeneratorWindow.focus();
    return;
  }
  tableGeneratorWindow = new BrowserWindow({
    width: 900,
    height: 700,
    parent: mainWindow,
    modal: false,
    title: 'Table Generator',
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  tableGeneratorWindow.loadFile(path.join(__dirname, 'table-generator.html'));
  tableGeneratorWindow.setMenuBarVisibility(false);
  tableGeneratorWindow.on('closed', () => {
    tableGeneratorWindow = null;
  });
}
ipcMain.on('open-table-generator', () => {
  openTableGenerator();
});

// ============================================
// Quick Note — global scratchpad window (Ctrl+Alt+Q)
// ============================================
// A small always-quick-to-open window for capturing thoughts without
// disturbing the main workspace. Notes append to <userData>/notes/quick-notes.md
// with a timestamp header, so nothing is ever lost and the file is plain
// markdown the user can open in the main editor later.
let quickNoteWindow = null;
const quickNotesPath = () => path.join(app.getPath('userData'), 'notes', 'quick-notes.md');

function openQuickNoteWindow() {
  if (quickNoteWindow) {
    quickNoteWindow.show();
    quickNoteWindow.focus();
    return;
  }
  quickNoteWindow = new BrowserWindow({
    width: 420,
    height: 320,
    alwaysOnTop: true,
    skipTaskbar: false,
    title: 'Quick Note',
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      // Small self-contained page; nodeIntegration lets it save via IPC
      // without shipping a dedicated preload for one textarea.
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  quickNoteWindow.setMenuBarVisibility(false);
  quickNoteWindow.loadURL(
    'data:text/html;charset=utf-8,' +
      encodeURIComponent(`<!doctype html>
<html><head><meta charset="utf-8"><title>Quick Note</title>
<style>
  body { margin:0; font: 13px system-ui, sans-serif; display:flex; flex-direction:column; height:100vh; }
  textarea { flex:1; border:0; resize:none; padding:12px; font:inherit; box-sizing:border-box; outline:none; }
  footer { display:flex; justify-content:space-between; align-items:center; padding:6px 12px;
           border-top:1px solid #ddd; color:#666; font-size:11px; }
  button { padding:4px 12px; cursor:pointer; }
</style></head>
<body>
  <textarea id="note" placeholder="Type a note… (Ctrl+Enter saves & clears, Esc hides)"></textarea>
  <footer>
    <span id="status">Appends to notes/quick-notes.md</span>
    <button id="save" type="button">Save note</button>
  </footer>
<script>
  const { ipcRenderer } = require('electron');
  const note = document.getElementById('note');
  const status = document.getElementById('status');
  function save() {
    const text = note.value.trim();
    if (!text) return;
    ipcRenderer.invoke('quick-note:save', text).then(() => {
      note.value = '';
      status.textContent = 'Saved ' + new Date().toLocaleTimeString();
    }).catch((e) => { status.textContent = 'Save failed: ' + e.message; });
  }
  document.getElementById('save').addEventListener('click', save);
  note.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
    if (e.key === 'Escape') ipcRenderer.send('quick-note:hide');
  });
  note.focus();
</script>
</body></html>`)
  );
  quickNoteWindow.on('closed', () => {
    quickNoteWindow = null;
  });
}

ipcMain.handle('quick-note:save', async (_event, text) => {
  // Append with a timestamp header; folder is created on first save
  const file = quickNotesPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
  fs.appendFileSync(file, `\n\n## ${stamp}\n\n${String(text)}\n`, 'utf-8');
  return { path: file };
});

// Esc in the note window hides instead of closing (keeps it one keystroke away)
ipcMain.on('quick-note:hide', () => {
  if (quickNoteWindow) quickNoteWindow.hide();
});

// Global shortcut works even when the app is not focused — the point of a
// scratchpad. Registered on ready, unregistered on quit.
app.whenReady().then(() => {
  const { globalShortcut } = require('electron');
  const registered = globalShortcut.register('CommandOrControl+Alt+Q', () => {
    openQuickNoteWindow();
  });
  if (!registered) console.warn('Quick Note shortcut Ctrl+Alt+Q could not be registered');
});
app.on('will-quit', () => {
  const { globalShortcut } = require('electron');
  globalShortcut.unregister('CommandOrControl+Alt+Q');
});

// IPC Handler for loading document templates
ipcMain.handle('load-template', async (event, filename) => {
  try {
    const templatePath = path.join(__dirname, 'templates', filename);
    return fs.readFileSync(templatePath, 'utf-8');
  } catch (err) {
    console.error('Failed to load template:', err);
    return null;
  }
});

// ============================================
// PlantUML local rendering (optional CLI)
// ============================================
// When a local `plantuml` executable is installed, diagrams render on the
// user's machine via `-pipe` mode (diagram source on stdin, PNG on stdout)
// instead of POSTing them to plantuml.com (the CVE-MC-007 data-exposure
// concern). Availability is probed once and cached.
let plantumlAvailableCache = null;
ipcMain.handle('plantuml:available', async () => {
  if (plantumlAvailableCache !== null) return plantumlAvailableCache;
  plantumlAvailableCache = await new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    execFile(isWin ? 'where' : 'which', [isWin ? 'plantuml.exe' : 'plantuml'], (error) => {
      resolve(!error);
    });
  });
  return plantumlAvailableCache;
});

ipcMain.handle('plantuml:render', async (_event, { text } = {}) => {
  if (typeof text !== 'string' || text.length > 1024 * 1024) {
    throw new Error('Invalid PlantUML input');
  }
  return new Promise((resolve, reject) => {
    // -pipe reads the diagram from stdin and writes PNG bytes to stdout
    const child = execFile(
      'plantuml',
      ['-tpng', '-pipe', '-charset', 'UTF-8'],
      { timeout: 30000, maxBuffer: 20 * 1024 * 1024, encoding: 'buffer' },
      (error, stdout) => {
        if (error) {
          reject(new Error('Local PlantUML rendering failed'));
          return;
        }
        resolve({ dataUrl: 'data:image/png;base64,' + stdout.toString('base64') });
      }
    );
    if (child.stdin) {
      child.stdin.on('error', () => {}); // EPIPE if plantuml dies early
      child.stdin.write(text, 'utf-8');
      child.stdin.end();
    }
  });
});

// IPC Handler for saving pasted/dropped images
ipcMain.handle('save-pasted-image', async (event, { base64, ext }) => {
  try {
    let saveDir;
    if (currentFile) {
      // Save relative to current file
      saveDir = path.join(path.dirname(currentFile), 'assets');
    } else {
      // Use temp directory
      saveDir = path.join(app.getPath('temp'), 'markdown-converter-images');
    }
    if (!fs.existsSync(saveDir)) {
      fs.mkdirSync(saveDir, {
        recursive: true,
      });
    }
    const filename = `image-${Date.now()}.${ext}`;
    const filePath = path.join(saveDir, filename);
    const buffer = Buffer.from(base64, 'base64');
    fs.writeFileSync(filePath, buffer);
    return {
      relativePath: `assets/${filename}`,
      absolutePath: filePath,
    };
  } catch (error) {
    console.error('Failed to save pasted image:', error);
    return null;
  }
});

// IPC Handler to receive generated content from generator windows
ipcMain.on('insert-generated-content', (event, content) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('insert-content', content);
  }
});

// ============================================
// File Explorer IPC Handlers
// ============================================
ipcMain.handle('list-directory', async (event, dirPath) => {
  try {
    if (!dirPath) {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
      });
      if (result.canceled || !result.filePaths[0]) return null;
      dirPath = result.filePaths[0];
    }

    // Validate path to prevent traversal attacks
    const validation = validatePath(dirPath);
    if (!validation.valid) {
      console.error('[SECURITY] Invalid directory path:', validation.error);
      return null;
    }
    if (!isPathAccessible(validation.resolved)) {
      return null;
    }
    const entries = fs
      .readdirSync(validation.resolved, {
        withFileTypes: true,
      })
      .filter((e) => !e.name.startsWith('.'))
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      })
      .map((e) => ({
        name: e.name,
        isDirectory: e.isDirectory(),
        size: e.isDirectory() ? 0 : fs.statSync(path.join(validation.resolved, e.name)).size,
        modified: fs.statSync(path.join(validation.resolved, e.name)).mtimeMs,
        path: path.join(validation.resolved, e.name),
      }));
    return {
      path: validation.resolved,
      entries,
    };
  } catch (err) {
    console.error('list-directory error:', err);
    return null;
  }
});
ipcMain.handle('select-custom-css', async (_event) => {
  const result = dialog.showOpenDialogSync(mainWindow, {
    title: 'Select Custom Preview CSS',
    properties: ['openFile'],
    filters: [
      {
        name: 'CSS Stylesheets',
        extensions: ['css'],
      },
    ],
  });
  if (result && result[0]) {
    const filePath = result[0];
    const content = fs.readFileSync(filePath, 'utf-8');
    return {
      path: filePath,
      content,
    };
  }
  return null;
});
ipcMain.handle('read-file', async (event, filePath) => {
  const validation = validatePath(filePath);
  if (!validation.valid || !isPathAccessible(validation.resolved)) {
    throw new Error(validation.error || 'Invalid file path');
  }
  return fs.readFileSync(validation.resolved, 'utf-8');
});
ipcMain.handle('write-file', async (event, payload) => {
  const validation = resolveWritablePath(payload?.path);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid file path');
  }
  fs.mkdirSync(path.dirname(validation.resolved), {
    recursive: true,
  });
  fs.writeFileSync(validation.resolved, payload?.content ?? '', 'utf-8');
  return {
    path: validation.resolved,
  };
});
ipcMain.handle('delete-file', async (event, filePath) => {
  const validation = validatePath(filePath);
  if (!validation.valid || !isPathAccessible(validation.resolved)) {
    throw new Error(validation.error || 'Invalid file path');
  }
  fs.rmSync(validation.resolved, {
    recursive: true,
    force: false,
  });
  return true;
});
ipcMain.handle('ensure-directory', async (event, dirPath) => {
  const validation = resolveWritablePath(dirPath);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid directory path');
  }
  fs.mkdirSync(validation.resolved, {
    recursive: true,
  });
  return validation.resolved;
});
ipcMain.handle('path-exists', async (event, filePath) => {
  const validation = resolveWritablePath(filePath);
  return validation.valid ? fs.existsSync(validation.resolved) : false;
});
ipcMain.handle('is-directory', async (event, filePath) => {
  const validation = validatePath(filePath);
  if (!validation.valid || !isPathAccessible(validation.resolved)) {
    return false;
  }
  return fs.statSync(validation.resolved).isDirectory();
});
ipcMain.handle('copy-path', async (event, payload) => {
  const sourceValidation = validatePath(payload?.source);
  const destinationValidation = resolveWritablePath(payload?.destination);
  if (!sourceValidation.valid || !isPathAccessible(sourceValidation.resolved)) {
    throw new Error(sourceValidation.error || 'Invalid source path');
  }
  if (!destinationValidation.valid) {
    throw new Error(destinationValidation.error || 'Invalid destination path');
  }
  fs.mkdirSync(path.dirname(destinationValidation.resolved), {
    recursive: true,
  });
  fs.cpSync(sourceValidation.resolved, destinationValidation.resolved, {
    recursive: true,
  });
  return {
    source: sourceValidation.resolved,
    destination: destinationValidation.resolved,
  };
});
ipcMain.handle('move-path', async (event, payload) => {
  const sourceValidation = validatePath(payload?.source);
  const destinationValidation = resolveWritablePath(payload?.destination);
  if (!sourceValidation.valid || !isPathAccessible(sourceValidation.resolved)) {
    throw new Error(sourceValidation.error || 'Invalid source path');
  }
  if (!destinationValidation.valid) {
    throw new Error(destinationValidation.error || 'Invalid destination path');
  }
  fs.mkdirSync(path.dirname(destinationValidation.resolved), {
    recursive: true,
  });
  try {
    fs.renameSync(sourceValidation.resolved, destinationValidation.resolved);
  } catch (error) {
    if (error.code !== 'EXDEV') {
      throw error;
    }
    fs.cpSync(sourceValidation.resolved, destinationValidation.resolved, {
      recursive: true,
    });
    fs.rmSync(sourceValidation.resolved, {
      recursive: true,
      force: false,
    });
  }
  return {
    source: sourceValidation.resolved,
    destination: destinationValidation.resolved,
  };
});

// Open a file by path (from explorer panel)
ipcMain.on('open-file-path', (event, filePath) => {
  try {
    // Validate path to prevent traversal attacks
    const validation = validatePath(filePath);
    if (!validation.valid) {
      console.error('[SECURITY] Invalid file path:', validation.error);
      return;
    }
    if (!isPathAccessible(validation.resolved)) {
      return;
    }
    const stat = fs.statSync(validation.resolved);
    if (stat.size > MAX_FILE_SIZE) return;
    currentFile = validation.resolved;
    const content = fs.readFileSync(validation.resolved, 'utf-8');
    mainWindow.webContents.send('file-opened', {
      path: validation.resolved,
      content,
    });
  } catch (err) {
    console.error('open-file-path error:', err);
  }
});

// ============================================
// Git IPC Handlers
// ============================================
ipcMain.handle('git-status', async () => {
  const dir = currentFile ? path.dirname(currentFile) : process.cwd();
  return GitOperations.getStatus(dir);
});
ipcMain.handle('git-stage', async (event, { files }) => {
  const dir = currentFile ? path.dirname(currentFile) : process.cwd();
  return GitOperations.stage(dir, files);
});
ipcMain.handle('git-commit', async (event, { message }) => {
  const dir = currentFile ? path.dirname(currentFile) : process.cwd();
  return GitOperations.commit(dir, message);
});
ipcMain.handle('git-log', async () => {
  const dir = currentFile ? path.dirname(currentFile) : process.cwd();
  return GitOperations.log(dir);
});
ipcMain.handle('git-diff', async (event, { file, againstHead } = {}) => {
  const dir = currentFile ? path.dirname(currentFile) : process.cwd();
  return GitOperations.diff(dir, file, againstHead);
});
ipcMain.handle('git-branches', async () => {
  const dir = currentFile ? path.dirname(currentFile) : process.cwd();
  return GitOperations.branches(dir);
});
ipcMain.handle('git-checkout', async (event, { name, isNew } = {}) => {
  const dir = currentFile ? path.dirname(currentFile) : process.cwd();
  return GitOperations.checkoutBranch(dir, name, isNew);
});
ipcMain.handle('git-push', async () => {
  const dir = currentFile ? path.dirname(currentFile) : process.cwd();
  return GitOperations.push(dir);
});
ipcMain.handle('git-pull', async () => {
  const dir = currentFile ? path.dirname(currentFile) : process.cwd();
  return GitOperations.pull(dir);
});

// ============================================
// Snippets IPC Handlers
// ============================================
const snippetsPath = path.join(app.getPath('userData'), 'snippets.json');
function loadSnippets() {
  try {
    if (fs.existsSync(snippetsPath)) {
      return JSON.parse(fs.readFileSync(snippetsPath, 'utf-8'));
    }
  } catch (err) {
    console.error('Failed to load snippets:', err);
  }
  return [];
}
function saveSnippetsFile(snippets) {
  fs.writeFileSync(snippetsPath, JSON.stringify(snippets, null, 2));
}
ipcMain.handle('get-snippets', async () => loadSnippets());
ipcMain.handle('save-snippet', async (event, snippet) => {
  const snippets = loadSnippets();
  const existing = snippets.findIndex((s) => s.id === snippet.id);
  if (existing >= 0) snippets[existing] = snippet;
  else snippets.push(snippet);
  saveSnippetsFile(snippets);
  return snippets;
});
ipcMain.handle('delete-snippet', async (event, id) => {
  const snippets = loadSnippets().filter((s) => s.id !== id);
  saveSnippetsFile(snippets);
  return snippets;
});

// ============================================
// Code Execution (REPL) IPC Handler
// ============================================
ipcMain.handle('execute-code', async (event, { code, language }) => {
  const timeout = 10000;
  return new Promise((resolve) => {
    let cmd, args;
    if (language === 'javascript' || language === 'js') {
      cmd = 'node';
      args = ['-e', code];
    } else if (language === 'python' || language === 'py') {
      cmd = process.platform === 'win32' ? 'python' : 'python3';
      args = ['-c', code];
    } else if (language === 'bash' || language === 'sh') {
      cmd = process.platform === 'win32' ? 'cmd' : 'bash';
      args = process.platform === 'win32' ? ['/c', code] : ['-c', code];
    } else {
      resolve({
        error: `Unsupported language: ${language}`,
      });
      return;
    }
    execFile(
      cmd,
      args,
      {
        timeout,
        maxBuffer: 1024 * 1024,
      },
      (err, stdout, stderr) => {
        resolve({
          stdout: stdout || '',
          stderr: stderr || '',
          error: err?.killed ? 'Execution timed out (10s limit)' : err?.message || null,
        });
      }
    );
  });
});
