# Phase 10 — Polish + Delete Legacy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose `src/main.js` (4311 lines) into feature-first modules under `src/main/`, delete the 13 legacy renderer files (12 JS/CSS/HTML + the orphan `src/index.html`), trim dead IPC channels from `preload.js`, bump version to `5.0.0`, write a `CHANGELOG.md`, and tag the release.

**Architecture:** Mechanical decomposition. Each new module is a verbatim copy of an extracted region from `src/main.js` with a single `module.exports = { ... }` at the bottom. No behavior change in Tasks 1-5 (pure refactor). Tasks 6-9 delete code. Task 10 is the verification gate. Existing partial decompositions at `src/main/PDFOperations.js` (433 lines) and `src/main/GitOperations.js` (44 lines) are the patterns to follow.

**Tech Stack:** Electron 41, Node 18+, CommonJS (no transpilation in main process). React 19 + Vite + TypeScript renderer (unchanged). vitest + React Testing Library for the 305 existing tests.

**Branch:** `react-electron` (current). All work happens on this branch. No new branches.

**Working assumption:** The existing 305 vitest tests are the regression net. There are no main-process tests. Verification per task is: `npx vitest run` (must stay 305 green) + manual code review of the diff. The final task adds an electron-launch smoke check.

---

## File Map (locked from spec)

### Created
```
src/main/
├── index.js              # NEW entrypoint (replaces src/main.js)
├── store.js              # NEW — preferences store
├── ipc.js                # NEW — ipcMain.handle registration
├── files/
│   ├── index.js          # NEW — file ops facade
│   ├── search.js         # NEW — recursive regex search
│   ├── git.js            # NEW — git status porcelain
│   └── binary.js         # NEW — writeBuffer
├── menu/
│   ├── index.js          # NEW — buildMenu()
│   └── items.js          # NEW — individual menu items
├── window/
│   ├── index.js          # NEW — createMainWindow (createAsciiWindow/createTableWindow REMOVED)
│   └── state.js          # NEW — window state persistence
├── word-template/
│   ├── index.js          # NEW — WordTemplateExporter facade (moved from src/wordTemplateExporter.js)
│   ├── parser.js         # NEW — .dotx parsing
│   ├── converter.js      # NEW — markdown → docx
│   └── apply.js          # NEW — apply template to converted docx
└── utils/
    ├── paths.js          # NEW — path helpers
    ├── logger.js         # NEW — structured logging
    └── download.js       # NEW — tool downloader

CHANGELOG.md              # NEW — Keep a Changelog 1.1.0 format
```

### Modified
- `package.json` — version 4.4.2 → 5.0.0; main: `src/main.js` → `src/main/index.js`
- `src/preload.js` — remove 9 dead IPC channels + 2 exposed API entries
- `src/main/PDFOperations.js` — unchanged (already a module)
- `src/main/GitOperations.js` — unchanged (already a module)

### Deleted (13 files)
- `src/main.js` (4311 lines / 146KB)
- `src/renderer.js` (5319 lines / 213KB)
- `src/styles.css`, `src/styles-modern.css`, `src/styles-concreteinfo.css`, `src/styles-sidebar.css`, `src/styles-zen.css`, `src/styles-welcome.css`, `src/fonts.css` (7 stylesheets)
- `src/command-palette.js`, `src/print-preview.js`, `src/welcome.js`, `src/zen-mode.js`, `src/wordTemplateExporter.js` (5 legacy scripts)
- `src/ascii-generator.html`, `src/table-generator.html` (2 legacy HTMLs)
- `src/index.html` (1667 lines — orphan, the live template is `src/renderer/index.html`)

### Tagged
- `v5.0.0` (annotated tag, pushed to origin)

---

## Task Decomposition (10 tasks, in order)

The decomposition must run **before** the deletions, because:
1. The deletion tasks reference file paths and import names that the decomposition establishes.
2. Running decomposition first means each deletion task's verification (renderer still renders) is meaningful — we have a working main process to verify against.

Tasks 1-5 are pure refactors of `src/main.js` into modules. They make NO behavior changes. The verification is `npx vitest run` (305 still green) and `npx electron .` (app still launches).

Tasks 6-9 are deletions. Task 10 is the version bump + changelog + tag.

---

### Task 1: Extract `src/main/utils/paths.js`

**Files:**
- Create: `src/main/utils/paths.js`
- Modify: `src/main.js` (remove the extracted code, add `require`)

**Context:** `src/main.js` line 109-208 contains path helpers. Extract them into a module. The new file uses `module.exports = { ... }` (CommonJS, matches existing `PDFOperations.js` and `GitOperations.js` patterns).

- [ ] **Step 1: Create `src/main/utils/paths.js` with the extracted content**

Create the file with this content (extracted verbatim from `src/main.js` lines 109-208):

```js
// src/main/utils/paths.js
// Path helpers — extracted from src/main.js lines 109-208
const path = require('path');
const fs = require('fs');

function getAllowedDirectories() {
  const allowed = new Set();
  allowed.add(app.getPath('home'));
  allowed.add(app.getPath('documents'));
  allowed.add(app.getPath('downloads'));
  allowed.add(app.getPath('desktop'));
  allowed.add(app.getPath('userData'));
  return Array.from(allowed);
}

function validatePath(filePath) {
  // ... (copy verbatim from src/main.js lines 125-158)
}

function resolveWritablePath(filePath) {
  // ... (copy verbatim from src/main.js lines 160-188)
}

function isPathAccessible(resolvedPath) {
  // ... (copy verbatim from src/main.js lines 190-208)
}

module.exports = { getAllowedDirectories, validatePath, resolveWritablePath, isPathAccessible };
```

Note: `app` is the Electron `app` module. It's imported at the top of `src/main.js`. Inside `paths.js`, we need to require it:

```js
const { app } = require('electron');
```

at the top of the file. (The verbatim extraction inlines this.)

- [ ] **Step 2: Update `src/main.js` to import from the new module**

At the top of `src/main.js`, after existing requires, add:
```js
const { getAllowedDirectories, validatePath, resolveWritablePath, isPathAccessible } = require('./main/utils/paths');
```

Then delete the inline definitions of those four functions from `src/main.js` (lines 109-208).

- [ ] **Step 3: Verify tests still pass**

Run: `npx vitest run 2>&1 | tail -5`
Expected: `Tests  305 passed (305)` (renderer doesn't import main process, but smoke check is a no-op confirmation)

- [ ] **Step 4: Verify the app still launches**

Run: `timeout 5 npx electron . 2>&1 | head -20 || true`
Expected: Electron starts, no JS errors in first 5 seconds. (`timeout 5` kills it after 5s.)

- [ ] **Step 5: Commit**

```bash
git add src/main/utils/paths.js src/main.js
git commit -m "refactor(main): extract path helpers to src/main/utils/paths.js"
```

---

### Task 2: Extract `src/main/files/` (file ops facade, search, git, binary)

**Files:**
- Create: `src/main/files/index.js`, `src/main/files/search.js`, `src/main/files/git.js`, `src/main/files/binary.js`
- Modify: `src/main.js` (remove inline definitions, add imports)

**Context:** `src/main.js` lines 3043-4183 contain file operations split across many `ipcMain.handle` calls. Extract them into a `files/` module. The existing `src/main/PDFOperations.js` and `src/main/GitOperations.js` are unrelated (PDF/gui) and stay untouched.

- [ ] **Step 1: Create `src/main/files/search.js`**

Extract the `list-directory`, `pick-folder`, `pick-file`, and any recursive-search logic from `src/main.js` (lines 3043-3089 cover basic list/pick). The recursive regex search is NOT in main.js yet — it lives at `src/renderer/lib/ipc.ts:file.search` and proxies to main. Add a stub that the existing ipcMain.handle('file-search', ...) proxies to. For now, this is just the file ops facade. The recursive search will be added in a follow-up if needed; the renderer already has a working implementation.

Create:
```js
// src/main/files/search.js
// File search — placeholder, recursive regex in renderer
const fs = require('fs').promises;
const path = require('path');

async function listDirectory(dirPath, maxDepth = 3) {
  // ... (extract from src/main.js lines 3043-3071)
}

module.exports = { listDirectory };
```

- [ ] **Step 2: Create `src/main/files/git.js`**

The git handlers at `src/main.js` lines 4226-4244 are minimal (4 handlers, ~20 lines each). They are already factored into `src/main/GitOperations.js` for the GUI version. This module is the IPC handler wrapper.

Create:
```js
// src/main/files/git.js
// Git IPC handlers (status, stage, commit, log)
const { ipcMain } = require('electron');
const GitOperations = require('../GitOperations');

function register() {
  ipcMain.handle('git-status', async () => GitOperations.status());
  ipcMain.handle('git-stage', async (_event, { files }) => GitOperations.stage(files));
  ipcMain.handle('git-commit', async (_event, { message }) => GitOperations.commit(message));
  ipcMain.handle('git-log', async () => GitOperations.log());
}

module.exports = { register };
```

- [ ] **Step 3: Create `src/main/files/binary.js`**

The renderer's `ipc.file.writeBuffer` is the new generic binary-write (Phase 9). The main-side handler does NOT exist yet — it needs to be added here. Add a `write-buffer` ipcMain.handle.

Create:
```js
// src/main/files/binary.js
// Binary file write handler
const { ipcMain } = require('electron');
const fs = require('fs').promises;
const path = require('path');

function register() {
  ipcMain.handle('write-buffer', async (_event, { path: filePath, buffer }) => {
    await fs.writeFile(filePath, Buffer.from(buffer));
    return { ok: true };
  });
}

module.exports = { register };
```

- [ ] **Step 4: Create `src/main/files/index.js` (facade)**

This composes the file ops. It registers all file-related ipcMain handlers.

Create:
```js
// src/main/files/index.js
// File ops facade — registers all file-related IPC handlers
const { ipcMain } = require('electron');
const fs = require('fs').promises;
const { listDirectory } = require('./search');
const { register: registerGit } = require('./git');
const { register: registerBinary } = require('./binary');

function register() {
  // Move ipcMain.handle('list-directory', ...) here (line 3043-3071)
  // Move ipcMain.handle('pick-folder', ...) here (line 3073-3080)
  // Move ipcMain.handle('pick-file', ...) here (line 3082-3089)
  // Move ipcMain.handle('read-file', ...) here (line 4102-4110)
  // Move ipcMain.handle('write-file', ...) here (line 4111-4121)
  // Move ipcMain.handle('delete-file', ...) here (line 4122-4131)
  // Move ipcMain.handle('ensure-directory', ...) here (line 4132-4141)
  // Move ipcMain.handle('path-exists', ...) here (line 4142-4146)
  // Move ipcMain.handle('is-directory', ...) here (line 4147-4155)
  // Move ipcMain.handle('copy-path', ...) here (line 4156-4171)
  // Move ipcMain.handle('move-path', ...) here (line 4172-4199)
  // Move ipcMain.on('open-file-path', ...) here (line 4200-4221)
  registerGit();
  registerBinary();
}

module.exports = { register };
```

- [ ] **Step 5: Update `src/main.js` to use the new module**

At the top of `src/main.js`:
```js
const fileOps = require('./main/files');
```

In the section after `app.whenReady().then(...)` (where the existing ipcMain.handle calls are registered), replace the file-ops ipcMain.handle calls with a single call:
```js
fileOps.register();
```

- [ ] **Step 6: Verify**

Run: `npx vitest run 2>&1 | tail -5`
Expected: 305 passing

Run: `timeout 5 npx electron . 2>&1 | head -20 || true`
Expected: app starts without errors

- [ ] **Step 7: Commit**

```bash
git add src/main/files/ src/main.js
git commit -m "refactor(main): extract file ops to src/main/files/ (search, git, binary)"
```

---

### Task 3: Extract `src/main/menu/` (buildMenu + items)

**Files:**
- Create: `src/main/menu/items.js`, `src/main/menu/index.js`
- Modify: `src/main.js`

**Context:** `src/main.js` lines 609-1045 contain `createMenu()` — a 436-line function that builds the entire application menu. Extract it. The current menu has dead sends (`webContents.send('print-preview')`, `webContents.send('print-preview-styled')`, `webContents.send('toggle-command-palette')`) — REMOVE these. Also remove `webContents.send('open-ascii-generator')` and `webContents.send('open-table-generator')` and the `openAsciiGenerator`/`openTableGenerator` functions (lines 3922-3991).

- [ ] **Step 1: Create `src/main/menu/items.js`**

Move the menu item definitions from inside `createMenu()` into named exports. The items are currently inline `label: '...', click: () => { ... }` blocks. Extract them as a flat list:

```js
// src/main/menu/items.js
// Individual menu items — pure data, no side effects
// Each entry: { label, accelerator?, click?, submenu? }

const fileItems = [
  // Extract from src/main.js lines 609-700 (File menu)
  // Remove any item with click: () => mainWindow.webContents.send('print-preview*')
  // Remove any item with click: () => mainWindow.webContents.send('toggle-command-palette')
  // Remove any item with click: () => mainWindow.webContents.send('open-ascii-generator')
  // Remove any item with click: () => mainWindow.webContents.send('open-table-generator')
];

const editItems = [
  // Extract from src/main.js lines 700-790 (Edit menu)
];

const viewItems = [
  // Extract from src/main.js lines 790-870 (View menu)
];

// ... etc for all submenus

module.exports = { fileItems, editItems, viewItems /*, ... */ };
```

- [ ] **Step 2: Create `src/main/menu/index.js`**

```js
// src/main/menu/index.js
// buildMenu() — composes the app menu from items
const { Menu } = require('electron');
const { fileItems, editItems, viewItems /*, ... */ } = require('./items');

function buildMenu(win) {
  const template = [
    { label: 'File', submenu: fileItems(win) },
    { label: 'Edit', submenu: editItems(win) },
    { label: 'View', submenu: viewItems(win) },
    // ... etc
  ];
  return Menu.buildFromTemplate(template);
}

function register(win) {
  Menu.setApplicationMenu(buildMenu(win));
}

module.exports = { register, buildMenu };
```

- [ ] **Step 3: Update `src/main.js`**

Replace the inline `createMenu()` function (lines 609-1045) and its `Menu.setApplicationMenu(createMenu())` call with:
```js
const menu = require('./main/menu');
// In createWindow after window creation:
menu.register(mainWindow);
```

- [ ] **Step 4: Remove `openAsciiGenerator` and `openTableGenerator` from `src/main.js`**

Delete lines 3922-3991 (`function openAsciiGenerator()`, `ipcMain.on('open-ascii-generator', ...)`, `function openTableGenerator()`, `ipcMain.on('open-table-generator', ...)`). These are dead after Task 7 deletes the HTMLs.

- [ ] **Step 5: Verify**

Run: `npx vitest run 2>&1 | tail -5`
Expected: 305 passing

Run: `timeout 5 npx electron . 2>&1 | head -20 || true`
Expected: app starts, native menu shows File/Edit/View/etc.

- [ ] **Step 6: Commit**

```bash
git add src/main/menu/ src/main.js
git commit -m "refactor(main): extract menu to src/main/menu/ (remove dead print-preview/command-palette/ascii/table sends)"
```

---

### Task 4: Extract `src/main/window/` (createMainWindow, state)

**Files:**
- Create: `src/main/window/state.js`, `src/main/window/index.js`
- Modify: `src/main.js`

**Context:** `src/main.js` lines 491-556 contain `createWindow()`. The `createAsciiWindow()` and `createTableGeneratorWindow()` (lines 3922-3991) are DEAD after Task 7 — they are NOT extracted, they are deleted.

- [ ] **Step 1: Create `src/main/window/state.js`**

Window state persistence (size, position) — extract from the start of `createWindow()`.

```js
// src/main/window/state.js
// Window state persistence
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const stateFile = path.join(app.getPath('userData'), 'window-state.json');

function load() {
  try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); }
  catch { return { width: 1400, height: 900 }; }
}

function save(win) {
  const bounds = win.getBounds();
  try { fs.writeFileSync(stateFile, JSON.stringify(bounds)); }
  catch { /* ignore */ }
}

module.exports = { load, save };
```

- [ ] **Step 2: Create `src/main/window/index.js`**

Extract `createWindow()` from `src/main.js` lines 491-556.

```js
// src/main/window/index.js
// Main window creation
const { BrowserWindow } = require('electron');
const path = require('path');
const state = require('./state');

function createMainWindow() {
  const bounds = state.load();
  const win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    webPreferences: {
      preload: path.join(__dirname, '../../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, '../../renderer/index.html'));
  win.on('close', () => state.save(win));

  return win;
}

module.exports = { createMainWindow };
```

- [ ] **Step 3: Update `src/main.js`**

Replace the inline `createWindow()` (lines 491-556) and the `mainWindow = createWindow()` call in `app.whenReady().then(...)` with:
```js
const { createMainWindow } = require('./main/window');
// In app.whenReady().then(...):
mainWindow = createMainWindow();
```

- [ ] **Step 4: Verify**

Run: `npx vitest run 2>&1 | tail -5`
Expected: 305 passing

Run: `timeout 5 npx electron . 2>&1 | head -20 || true`
Expected: main window opens at saved size

- [ ] **Step 5: Commit**

```bash
git add src/main/window/ src/main.js
git commit -m "refactor(main): extract window creation to src/main/window/ (main only, ascii/table windows removed)"
```

---

### Task 5: Extract `src/main/word-template/` (parser, converter, apply, facade)

**Files:**
- Create: `src/main/word-template/parser.js`, `src/main/word-template/converter.js`, `src/main/word-template/apply.js`, `src/main/word-template/index.js`
- Modify: `src/main.js` (remove `require('./wordTemplateExporter')`)

**Context:** `src/wordTemplateExporter.js` (743 lines) is the legacy Word template exporter. Move it into `src/main/word-template/`, split into logical units. The existing class has methods that map roughly to: `parseTemplate` → parser.js, `convertMarkdown` → converter.js, `applyTemplate` → apply.js, the class itself → index.js (facade).

- [ ] **Step 1: Create `src/main/word-template/parser.js`**

Read `src/wordTemplateExporter.js` end-to-end. Identify the methods that parse the `.dotx` file. Extract them into a `parseTemplate(filePath)` function. Keep the verbatim code; only restructure exports.

```js
// src/main/word-template/parser.js
// .dotx parsing — extracted from wordTemplateExporter.js
const path = require('path');
const fs = require('fs');
const PizZip = require('pizzip');

function parseTemplate(templatePath) {
  // ... (extract from wordTemplateExporter.js#parseTemplate or similar method)
}

module.exports = { parseTemplate };
```

- [ ] **Step 2: Create `src/main/word-template/converter.js`**

Extract the markdown → docx conversion logic. The renderer's `lib/docx-export.ts` already does this for the simple case. The main process version handles the legacy template path.

```js
// src/main/word-template/converter.js
// Markdown → docx conversion (with template support)
const { convertMarkdown } = require('./parser'); // if it shares helpers

function convertMarkdownToDocx(markdown, options) {
  // ... (extract from wordTemplateExporter.js)
}

module.exports = { convertMarkdownToDocx };
```

- [ ] **Step 3: Create `src/main/word-template/apply.js`**

Extract the template-application logic (style merging, header/footer).

```js
// src/main/word-template/apply.js
// Apply parsed template styles to a converted docx
function applyTemplate(docxBuffer, parsedTemplate) {
  // ... (extract from wordTemplateExporter.js)
}

module.exports = { applyTemplate };
```

- [ ] **Step 4: Create `src/main/word-template/index.js` (facade)**

Compose the three. Replicate the class API of `wordTemplateExporter.js` for back-compat with the existing main.js usage.

```js
// src/main/word-template/index.js
// WordTemplateExporter facade — same class API as legacy wordTemplateExporter.js
const { parseTemplate } = require('./parser');
const { convertMarkdownToDocx } = require('./converter');
const { applyTemplate } = require('./apply');

class WordTemplateExporter {
  constructor(templatePath, startPage, pageSettings) {
    this.templatePath = templatePath;
    this.startPage = startPage;
    this.pageSettings = pageSettings;
  }

  // Replicate the public methods that src/main.js uses
  async export(markdown, outputPath) {
    const parsed = parseTemplate(this.templatePath);
    const docx = await convertMarkdownToDocx(markdown, { startPage: this.startPage, pageSettings: this.pageSettings });
    const final = applyTemplate(docx, parsed);
    require('fs').writeFileSync(outputPath, final);
  }
}

module.exports = WordTemplateExporter;
```

- [ ] **Step 5: Update `src/main.js`**

Change line 5:
```js
// BEFORE:
const WordTemplateExporter = require('./wordTemplateExporter');
// AFTER:
const WordTemplateExporter = require('./main/word-template');
```

The rest of main.js (lines 1795, 1835, 3260, 3297) uses `new WordTemplateExporter(...)` — same API, no other changes.

- [ ] **Step 6: Verify**

Run: `npx vitest run 2>&1 | tail -5`
Expected: 305 passing

Run: `timeout 5 npx electron . 2>&1 | head -20 || true`
Expected: app starts; Word export (if exercised) still works

- [ ] **Step 7: Commit**

```bash
git add src/main/word-template/ src/main.js
git commit -m "refactor(main): move WordTemplateExporter from src/wordTemplateExporter.js to src/main/word-template/ (split into parser/converter/apply)"
```

---

### Task 6: Glue layer — `src/main/store.js`, `src/main/ipc.js`, `src/main/index.js`

**Files:**
- Create: `src/main/store.js`, `src/main/ipc.js`, `src/main/index.js`
- Modify: `src/main.js` (drain remaining content into the new entrypoint)

**Context:** After Tasks 1-5, `src/main.js` still has: the preferences store (lines 293-316), the misc ipcMain.handle calls (plugin-settings, get-app-version, etc.), the app lifecycle (lines 3743-3807), the `app.on('open-file')` macOS handler, the CLI conversion handler, and the `app.whenReady().then(...)` bootstrap. Extract these into the new entrypoint files.

- [ ] **Step 1: Create `src/main/store.js`**

Extract the preferences store (lines 293-316).

```js
// src/main/store.js
// electron-store wrapper for user preferences
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const settingsPath = path.join(app.getPath('userData'), 'settings.json');

const store = {
  get(key, defaultValue) {
    try {
      const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      return data[key] !== undefined ? data[key] : defaultValue;
    } catch { return defaultValue; }
  },
  set(key, value) {
    let data = {};
    try { data = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch {}
    data[key] = value;
    fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2));
  },
};

module.exports = store;
```

- [ ] **Step 2: Create `src/main/ipc.js`**

Compose all IPC handlers from the modules. This is the single place that registers all ipcMain.handle/on calls.

```js
// src/main/ipc.js
// Centralized ipcMain registration — composes from all modules
const { ipcMain, app } = require('electron');
const fileOps = require('./files');
const wordTemplate = require('./word-template');
const store = require('./store');

function register() {
  // Move remaining ipcMain.handle calls from src/main.js:
  // - 'plugin-settings:get' (line 316)
  // - 'plugin-settings:set' (line 319)
  // - 'get-app-version' (line 322)
  // - 'load-template' (line 3992)
  // - 'save-pasted-image' (line 4003)
  // - 'select-custom-css' (line 4083)
  // - 'list-directory' (already in files/, remove from here)
  // - 'get-snippets', 'save-snippet', 'delete-snippet' (lines 4264-4280)
  // - 'execute-code' (line 4284)

  fileOps.register();
}

module.exports = { register };
```

- [ ] **Step 3: Create `src/main/index.js` (NEW ENTRYPOINT)**

The new `src/main.js` equivalent. Composes everything.

```js
// src/main/index.js
// Main process entrypoint — replaces src/main.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { createMainWindow } = require('./window');
const menu = require('./menu');
const ipc = require('./ipc');
const store = require('./store');
const WordTemplateExporter = require('./word-template');
const { convertMarkdown } = require('./word-template/converter');

let mainWindow;
let wordTemplatePath = null;
let templateStartPage = 3;
let pageSettings = {};

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    mainWindow = createMainWindow();
    menu.register(mainWindow);
    ipc.register();
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createMainWindow();
  }
});

// Move app.on('open-file'), CLI conversion, etc. from src/main.js
```

- [ ] **Step 4: Update `package.json` to point at the new entrypoint**

Change line 5:
```diff
-  "main": "src/main.js",
+  "main": "src/main/index.js",
```

- [ ] **Step 5: Update `src/main.js` to be a thin re-export shim (TEMPORARY, removed in Task 7)**

Replace the entire content of `src/main.js` with:
```js
// src/main.js — DEPRECATED, will be removed in Task 7
// See src/main/index.js for the new modular entrypoint
require('./main/index.js');
```

This keeps the app working during the transition. Task 7 deletes this file.

- [ ] **Step 6: Verify**

Run: `npx vitest run 2>&1 | tail -5`
Expected: 305 passing

Run: `timeout 5 npx electron . 2>&1 | head -20 || true`
Expected: app starts, all menus work, all features work

- [ ] **Step 7: Commit**

```bash
git add src/main/store.js src/main/ipc.js src/main/index.js src/main.js package.json
git commit -m "refactor(main): create src/main/{store,ipc,index}.js glue layer; new entrypoint at src/main/index.js"
```

---

### Task 7: Trim `src/preload.js` — remove 9 dead IPC channels

**Files:**
- Modify: `src/preload.js`

**Context:** After Tasks 3 and 6, the following IPC channels are no longer registered in main: `toggle-command-palette`, `print-preview`, `print-preview-styled`, `open-ascii-generator`, `open-table-generator`, `show-ascii-generator`, `show-ascii-generator-window`, `show-table-generator`, `show-table-generator-window`. Remove them from preload.js's allowlist and exposed API.

- [ ] **Step 1: Identify the lines to remove**

Open `src/preload.js`. Find the `validChannels` or `ipcRenderer.send` allowlist. The following channel names appear (from earlier grep):
- `toggle-command-palette` (line 238)
- `open-ascii-generator` (line 89)
- `open-table-generator` (line 92)
- `print-preview` (line 173)
- `print-preview-styled` (line 174)
- `show-table-generator` (line 180)
- `show-ascii-generator-window` (line 217)
- `show-ascii-generator` (line 218)
- `show-table-generator-window` (line 221)

And the exposed API entries (around lines 445-446):
- `openAscii: () => ipcRenderer.send('open-ascii-generator')`
- `openTable: () => ipcRenderer.send('open-table-generator')`

- [ ] **Step 2: Remove the channel names from the allowlist**

For each of the 9 channel names above, remove the line. Example for `toggle-command-palette`:
```js
// BEFORE:
'toggle-command-palette',
// AFTER: (delete this line)
```

Repeat for all 9.

- [ ] **Step 3: Remove the exposed API entries**

Delete lines around 445-446:
```js
// BEFORE:
openAscii: () => ipcRenderer.send('open-ascii-generator'),
openTable: () => ipcRenderer.send('open-table-generator'),
// AFTER: (delete these lines)
```

- [ ] **Step 4: Verify the renderer tests still pass**

Run: `npx vitest run tests/integration/ 2>&1 | tail -10`
Expected: integration tests pass (they don't use the removed channels)

Run: `npx vitest run 2>&1 | tail -5`
Expected: 305 passing

- [ ] **Step 5: Verify the app still launches without preload errors**

Run: `timeout 5 npx electron . 2>&1 | head -20 || true`
Expected: app starts, no "Invalid channel" errors in the console

- [ ] **Step 6: Commit**

```bash
git add src/preload.js
git commit -m "refactor(preload): remove 9 dead IPC channels (print-preview*, command-palette, open-*/show-* ascii/table)"
```

---

### Task 8: Delete the 13 legacy files

**Files:**
- Delete: `src/main.js`, `src/renderer.js`, `src/styles.css`, `src/styles-modern.css`, `src/styles-concreteinfo.css`, `src/styles-sidebar.css`, `src/styles-zen.css`, `src/styles-welcome.css`, `src/fonts.css`, `src/command-palette.js`, `src/print-preview.js`, `src/welcome.js`, `src/zen-mode.js`, `src/wordTemplateExporter.js`, `src/ascii-generator.html`, `src/table-generator.html`, `src/index.html`

Wait — that's 17 files, not 13. Re-counting: 7 stylesheets + 5 scripts + 2 htmls + `src/main.js` (deprecated) + `src/renderer.js` + `src/index.html` (orphan) = 17. The spec says 13. The discrepancy is the stylesheets (spec said 7 stylesheets + 1 fonts.css = 8 CSS files, but the spec list counts them as 7 because fonts.css is sometimes lumped in). For this plan, we count the actual files: 7 stylesheets + fonts.css = 8 CSS files. Total = 8 + 5 + 2 + 1 + 1 = 17.

**The spec undercount is 4 stylesheets off** (counted fonts.css + 6 styles as 7 instead of 7 + 1 = 8). The actual deletion count is 17. The plan proceeds with 17 deletions.

- [ ] **Step 1: Delete the 17 legacy files**

Run:
```bash
git rm src/main.js \
       src/renderer.js \
       src/styles.css \
       src/styles-modern.css \
       src/styles-concreteinfo.css \
       src/styles-sidebar.css \
       src/styles-zen.css \
       src/styles-welcome.css \
       src/fonts.css \
       src/command-palette.js \
       src/print-preview.js \
       src/welcome.js \
       src/zen-mode.js \
       src/wordTemplateExporter.js \
       src/ascii-generator.html \
       src/table-generator.html \
       src/index.html
```

Expected output: 17 files deleted.

- [ ] **Step 2: Verify no code references the deleted files**

Run:
```bash
git grep -E "renderer\.js|command-palette|print-preview|welcome\.js|zen-mode|wordTemplate|ascii-generator|table-generator|styles\.css|styles-modern|styles-concreteinfo|styles-sidebar|styles-zen|styles-welcome|fonts\.css" -- ':!CHANGELOG.md' ':!docs/**' ':!.remember/**' ':!package-lock.json' 2>&1
```

Expected: NO output (zero matches in live code, docs, or config). The CHANGELOG and docs are excluded because they intentionally reference the deleted files for historical context.

- [ ] **Step 3: Verify tests still pass**

Run: `npx vitest run 2>&1 | tail -5`
Expected: 305 passing

- [ ] **Step 4: Verify the app still launches**

Run: `timeout 5 npx electron . 2>&1 | head -20 || true`
Expected: app starts, main window renders, no missing-file errors

- [ ] **Step 5: Verify the renderer build still succeeds**

Run: `npx vite build --config vite.renderer.config.ts 2>&1 | tail -10`
Expected: build succeeds, output in `dist/renderer/`

- [ ] **Step 6: Commit**

```bash
git commit -m "refactor: delete 17 legacy files (renderer.js, 8 stylesheets, 5 scripts, 2 htmls, src/index.html orphan, deprecated src/main.js)"
```

---

### Task 9: Write `CHANGELOG.md` (Keep a Changelog 1.1.0)

**Files:**
- Create: `CHANGELOG.md`

**Context:** The project has no CHANGELOG. Create one with the v5.0.0 entry documenting the 10-phase React UI redesign.

- [ ] **Step 1: Create `CHANGELOG.md`**

Create at the project root:

```markdown
# Changelog

All notable changes to markdown-converter will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.0.0] - 2026-06-06

### Added
- **Complete React 19 + Vite + TypeScript renderer** replacing the legacy vanilla-JS UI (Phases 1-9 of the React UI redesign)
- Native macOS/Windows/Linux menus with command palette and keyboard shortcuts
- Settings sheet with 5 tabs (editor, theme, keybindings, advanced, about) and 17+ persisted fields
- Modal layer with 13 modal kinds (export PDF/DOCX/HTML/Word, batch, settings, about, welcome, confirm, ASCII gen, table gen, find in files)
- 10 advanced tools: ASCII generator (figlet), table generator, Word export (.docx via `docx` lib), find-in-files (recursive regex), REPL (markdown snippet preview), print preview, zen mode (Esc exits), minimap, breadcrumbs-with-symbols, git status (porcelain parser)
- Sonner toast notifications at 4 wire points (file save, open file/folder, 4 export dialogs)
- 3 mount strategies: ModalLayer dialogs, App.tsx global overlays, editor/sidebar integrations
- `ipc.file.writeBuffer` for renderer-side binary file output (used by Word .docx export)
- `ipc.file.search` (recursive regex), `ipc.file.gitStatus`, `ipc.print.show`, `ipc.app.showSaveDialog`
- 305 unit + integration tests (vitest + React Testing Library)
- Per-package @radix-ui primitives (checkbox, dialog, select, switch, tabs, radio-group, scroll-area, slider, collapsible, label, context-menu)
- shadcn/ui (new-york style) primitives, manually pasted (CLI broken on Node 24)
- Feature-first main process decomposition: `src/main/{files,menu,window,word-template,utils}/` + glue files

### Changed
- **BREAKING**: Renderer is now React-only. The legacy `src/renderer.js` (5319 lines) and all vanilla-JS UI scripts/styles are removed.
- Main process decomposed from a 4311-line `src/main.js` into feature-first modules under `src/main/`
- New entrypoint: `src/main/index.js` (was `src/main.js`)
- `src/index.html` (1667-line legacy orphan) removed; renderer served by `src/renderer/index.html` (Vite root)
- IPC contract: handlers throw on error, `safeCall` catches → returns `{ ok: false, error }`. `result.ok` is at top level, NOT nested in `result.data.ok`
- Settings store: `useSettingsStore` (zustand persist with zod validation), 17+ persisted fields
- Modal state: `useAppStore.modal: ModalState` discriminated union with 13 kinds; `openModal` uses TS conditional types to enforce prop requirements

### Removed
- `src/renderer.js` (legacy vanilla-JS renderer, 5319 lines)
- 8 legacy stylesheets: `src/styles.css`, `src/styles-modern.css`, `src/styles-concreteinfo.css`, `src/styles-sidebar.css`, `src/styles-zen.css`, `src/styles-welcome.css`, `src/fonts.css`
- 5 legacy scripts: `src/command-palette.js`, `src/print-preview.js`, `src/welcome.js`, `src/zen-mode.js`, `src/wordTemplateExporter.js`
- 2 legacy HTMLs: `src/ascii-generator.html`, `src/table-generator.html`
- `src/main.js` (4311-line god file, replaced by `src/main/index.js`)
- `src/index.html` (1667-line legacy orphan at project root, replaced by `src/renderer/index.html`)
- 9 dead IPC channels from `src/preload.js`: `toggle-command-palette`, `print-preview`, `print-preview-styled`, `open-ascii-generator`, `open-table-generator`, `show-ascii-generator`, `show-ascii-generator-window`, `show-table-generator`, `show-table-generator-window`

[5.0.0]: https://github.com/amitwh/markdown-converter/releases/tag/v5.0.0
[4.4.2]: https://github.com/amitwh/markdown-converter/releases/tag/v4.4.2
```

- [ ] **Step 2: Verify no other CHANGELOG conflicts**

Run: `ls CHANGELOG* 2>&1`
Expected: only `CHANGELOG.md` exists

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: add CHANGELOG.md (v5.0.0 entry, Keep a Changelog 1.1.0 format)"
```

---

### Task 10: Bump version to 5.0.0, final verification, tag `v5.0.0`

**Files:**
- Modify: `package.json` (version bump)

- [ ] **Step 1: Update `package.json` version**

Edit line 3 of `package.json`:
```diff
-  "version": "4.4.2",
+  "version": "5.0.0",
```

- [ ] **Step 2: Final test run**

Run: `npx vitest run 2>&1 | tail -5`
Expected: `Test Files  73 passed (73)` / `Tests  305 passed (305)`

- [ ] **Step 3: Final build run**

Run: `npx vite build --config vite.renderer.config.ts 2>&1 | tail -10`
Expected: build succeeds

Run: `npx vite build --config vite.preload.config.ts 2>&1 | tail -10`
Expected: build succeeds

- [ ] **Step 4: Final legacy-grep check**

Run: `git grep -E "renderer\.js|command-palette|print-preview|welcome\.js|zen-mode|wordTemplate|ascii-generator|table-generator|styles\.css" -- ':!CHANGELOG.md' ':!docs/**' ':!.remember/**' ':!package-lock.json' 2>&1`
Expected: NO output

- [ ] **Step 5: Final electron-launch smoke**

Run: `timeout 8 npx electron . 2>&1 | head -30 || true`
Expected: app launches, main window opens, no JS errors. The `timeout 8` ensures the command exits cleanly (we can't interact with a GUI in this terminal).

- [ ] **Step 6: Commit the version bump**

```bash
git add package.json
git commit -m "chore(release): bump version to 5.0.0"
```

- [ ] **Step 7: Push all commits to origin**

Run: `git push origin react-electron 2>&1 | tail -10`
Expected: push succeeds, all Phase 10 commits now on origin

- [ ] **Step 8: Create and push the `v5.0.0` tag**

Run:
```bash
git tag -a v5.0.0 -m "Release v5.0.0 — React 19 renderer, decomposed main process, legacy removed"
git push origin v5.0.0 2>&1 | tail -10
```

Expected: tag created locally, pushed to origin

- [ ] **Step 9: Verify the tag is on origin**

Run: `git ls-remote --tags origin | grep v5.0.0`
Expected: a line containing `refs/tags/v5.0.0`

- [ ] **Step 10: Report completion**

Final stats:
- 10 tasks completed
- ~15 commits added (Tasks 1-9: 9 commits; Task 10: 1 version bump + 1 tag)
- 17 legacy files deleted
- 0 test regressions (305 still green)
- Tag `v5.0.0` pushed to origin
- React UI redesign COMPLETE (10/10 phases)

---

## Notes for implementers

1. **No TDD for Tasks 1-7.** The main process is untested. Adding tests is Phase 11+ work. Verification per task is: vitest stays green, app still launches, no missing-file errors.

2. **The 9 channel names in Task 7 are exact.** Grep for them in `src/preload.js` before removing — line numbers may have shifted since the spec was written.

3. **The 17 file deletions in Task 8 are exact.** Use `git rm` to remove them in one command (Step 1). The commit message lists all 17.

4. **Task 9 is the only "create new content" task** besides the CHANGELOG. The rest are refactors or deletions.

5. **Task 10's electron-launch smoke (`timeout 8 npx electron .`) is the closest thing to an integration test for the main process.** It can't catch every bug, but it catches "missing file" and "syntax error" failures.

6. **If `timeout 8 npx electron .` fails in any task's verification step, STOP.** A working electron launch is the regression signal for main-process changes. Don't proceed to the next task until it works.

7. **If `npx vitest run` fails in any task, STOP.** Renderer tests are the regression signal for renderer + IPC contract changes. Don't proceed.

8. **Don't bundle tasks.** Each task is one commit. The user values a clean history, one feature per commit.

---

## Self-review checklist (run before starting execution)

- [ ] All 10 spec sections covered: 1 (decomposition), 2 (preload trim), 3 (legacy deletion), 4 (CHANGELOG), 5 (version bump), 6 (tag)
- [ ] No placeholders ("TBD", "TODO", "implement later", "fill in details")
- [ ] All file paths exact
- [ ] All commit messages follow Conventional Commits
- [ ] One feature per commit, no bundling
- [ ] Verification gates after every task
- [ ] `git grep` for legacy refs documented as the success criteria for Task 8
- [ ] The 17-vs-13 file-count discrepancy is documented (spec said 13, actual is 17)
- [ ] Tasks 1-6 are pure refactors (no behavior change)
- [ ] Task 7 trims dead code only
- [ ] Task 8 deletes files only
- [ ] Task 9 creates CHANGELOG only
- [ ] Task 10 is the only task that touches `package.json#version`
- [ ] Tag `v5.0.0` is the final step
