# Feature Audit, Bug Fixes, New Features & Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every verified non-working feature in MarkdownConverter, build out the orphaned image/audio/video converter subsystem, add 9 new features extending existing architecture, remediate a critical Pandoc argument-injection vulnerability plus other security findings, then produce a clean local release build.

**Architecture:** Vanilla JS Electron app (`contextIsolation: false`, `nodeIntegration: true`). Main process (`src/main.js`, ~5000 lines) owns all IPC handlers, dialogs, and external-tool invocation (Pandoc, ffmpeg, ImageMagick, LibreOffice) via `execFile`. Renderer (`src/renderer.js`, ~6150 lines) is vanilla DOM manipulation; it uses `ipcRenderer` both directly (legacy) and via the whitelisted `window.electronAPI` bridge (`src/preload.js`). Feature modules live under `src/main/*.js` (PDF, Git, font embedding) and `src/plugins/*.js` (plugin system). Follow this existing pattern for all new code — do not introduce a bundler, framework, or TypeScript.

**Tech Stack:** Electron 41, Node 20, Pandoc (external binary via `getPandocPath()`), ffmpeg-static (bundled, via `getFFmpegPath()`), `sharp` (image ops, currently a devDependency — must move to `dependencies`), `pdf-lib` (`src/main/PDFOperations.js`), `simple-git` (`src/main/GitOperations.js`), Jest for tests, ESLint flat config + Prettier.

**Spec:** This plan is self-originated from a live codebase audit (two parallel research passes + manual verification of every finding against `src/main.js`, `src/preload.js`, `src/renderer.js`, `src/main/GitOperations.js`, `src/main/PDFOperations.js`, `src/plugins/plugin-context.js`). No separate spec doc exists; each task below states the verified current behavior and the required end behavior.

## Global Constraints

- `contextIsolation: false` / `nodeIntegration: true` is the existing (weak) security model for this branch — do not attempt to flip it as part of this plan; that is a separate, much larger migration tracked elsewhere. Do not make the security posture worse than it already is.
- All new external-process invocation MUST use `execFile` with an explicit argument array — **never** build a shell-style command string and re-tokenize it. This is the root cause of Finding SEC-1 below; do not repeat the pattern anywhere new.
- All new/changed IPC channels must be added to the correct whitelist array in `src/preload.js` (`ALLOWED_SEND_CHANNELS` for renderer→main, `ALLOWED_RECEIVE_CHANNELS` for main→renderer) — an unlisted channel is silently blocked (see `preload.js:261-282`).
- 2-space indent, single quotes, semicolons, 100-char width (Prettier). Run `npm run lint` and `npm run format:check` before every commit; both must pass.
- `npm test` (Jest, jsdom) must stay green (247 tests / 32 suites passing at plan start) after every task.
- File size limit for user-opened files is `MAX_FILE_SIZE_MB = 50` (`main.js:57-58`) — reuse this constant for any new file-accepting handler, don't invent a new limit.
- Error messages shown to the user must go through `sanitizeErrorMessage()` (`main.js:61-70`) if they might contain absolute paths.
- No forbidden markers (`TODO`, `FIXME`, `stub`, `placeholder`, `coming soon`, etc.) in any changed file.

---

## Phase A — Fix Verified Non-Working Features

### Task 1: Fix "Open PDF File..." menu item (wrong IPC channel)

**Files:**
- Modify: `src/main.js:1666-1684` (`openPDFFile()`)

**Verified current behavior:** `openPDFFile()` sends `mainWindow.webContents.send('open-pdf-viewer', files[0])` (line 1682). No listener for `'open-pdf-viewer'` exists anywhere in the repo. The working PDF-editor open path is `show-pdf-editor-dialog`, whose renderer listener is `ipcRenderer.on('show-pdf-editor-dialog', (event, operation, openedFilePath) => {...})` (`renderer.js:3685`).

- [ ] **Step 1:** In `openPDFFile()`, replace the send call:
```javascript
mainWindow.webContents.send('show-pdf-editor-dialog', null, files[0]);
```
- [ ] **Step 2:** Manually verify: `npm start`, open a PDF via File → Open PDF File (or the equivalent menu entry), confirm the PDF editor dialog opens with the file loaded (same result as opening it via the PDF toolbar button).
- [ ] **Step 3:** `npm run lint && npm test`
- [ ] **Step 4:** Commit: `git add src/main.js && git commit -m "fix(pdf): route Open PDF File menu item to the working editor dialog channel"`

### Task 2: Fix "Clear Recent Files" silent no-op

**Files:**
- Modify: `src/main.js:731-736` (menu click handler), `src/main.js:4480-4491` (`ipcMain.on('clear-recent-files', ...)`)

**Verified current behavior:** The menu click handler does `mainWindow.webContents.send('clear-recent-files')` (main→renderer), but nothing in the renderer listens for that channel. The actual deletion logic lives in `ipcMain.on('clear-recent-files', (event) => {...})`, which only fires on a renderer→main `.send`/`.invoke` that never happens from this menu path. `preload.js:342` exposes a separate `clearRecent: () => ipcRenderer.send('clear-recent-files')` helper that IS the correct renderer→main direction, but the menu item bypasses it entirely by sending the same channel name in the wrong direction.

- [ ] **Step 1:** Extract the deletion logic into a standalone function above the `ipcMain.on` registration:
```javascript
function clearRecentFilesOnDisk() {
  const userDataPath = app.getPath('userData');
  const recentFilesPath = path.join(userDataPath, 'recent-files.json');
  fs.writeFileSync(recentFilesPath, JSON.stringify([], null, 2));
  createMenu();
}
```
- [ ] **Step 2:** Update the `ipcMain.on` handler to use it:
```javascript
ipcMain.on('clear-recent-files', (event) => {
  try {
    clearRecentFilesOnDisk();
    event.reply('recent-files-cleared');
  } catch (error) {
    console.error('Error clearing recent files:', error);
  }
});
```
- [ ] **Step 3:** Update the menu click handler (`main.js:731-736`) to call the main-process function directly and notify the renderer the same way the working path does:
```javascript
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
```
- [ ] **Step 4:** Manually verify: open a few recent files, use File menu → Clear Recent Files, confirm the Recent Files submenu is empty afterward.
- [ ] **Step 5:** `npm run lint && npm test`
- [ ] **Step 6:** Commit: `git add src/main.js && git commit -m "fix(menu): make Clear Recent Files actually clear the list"`

### Task 3: Wire "Insert Template" submenu (content already exists, just needs a listener)

**Files:**
- Modify: `src/renderer.js` (near the existing `templates` sidebar-panel registration, ~line 1744-1758)

**Verified current behavior:** `main.js:811-847` sends `mainWindow.webContents.send('load-template-menu', '<file>.md')` for 10 menu items. `'load-template-menu'` IS already in `ALLOWED_RECEIVE_CHANNELS` (`preload.js:241`) but nothing in the renderer listens for it — **however** the underlying feature is fully implemented already: `src/templates/*.md` contains real content for all 10 templates, `ipcMain.handle('load-template', ...)` (`main.js:4641-4649`) reads them, and the sidebar Templates panel (`renderer.js:1744-1758`) already does exactly the load-into-new-tab flow needed. Do not author new template content — reuse the existing flow.

- [ ] **Step 1:** Extract the existing inline callback at `renderer.js:1746-1757` into a shared named function so both the sidebar panel and the new menu listener use it:
```javascript
async function loadTemplateIntoNewTab(file) {
  const templateContent = await ipcRenderer.invoke('load-template', file);
  if (templateContent) {
    const content = templateContent.replace(/\{\{DATE\}\}/g, new Date().toISOString().split('T')[0]);
    tabManager.createNewTab();
    const tab = tabManager.tabs.get(tabManager.activeTabId);
    tabManager.setEditorContent(tab.id, content);
  }
}
```
Place this near the top of the sidebar-initialization block (wherever `tabManager` is already in scope at that point), then replace the sidebar panel's inline callback with `render: (container) => getRenderTemplatesPanel()(container, loadTemplateIntoNewTab)`.
- [ ] **Step 2:** Add a listener for the menu channel, near the other `ipcRenderer.on(...)` registrations in the same initialization area:
```javascript
ipcRenderer.on('load-template-menu', (event, file) => {
  loadTemplateIntoNewTab(file);
});
```
- [ ] **Step 3:** Manually verify: File → New from Template → Blog Post (and 2-3 others), confirm a new tab opens with the real template content, `{{DATE}}` replaced with today's date.
- [ ] **Step 4:** `npm run lint && npm test`
- [ ] **Step 5:** Commit: `git add src/renderer.js && git commit -m "fix(templates): wire New from Template menu to existing template-loading flow"`

### Task 4: Wire Command Palette / Sidebar / Bottom Panel menu toggles

**Files:**
- Modify: `src/renderer.js` (near command palette init ~line 2045, sidebar manager init ~line 1703, bottom/REPL panel init ~line 1007)

**Verified current behavior:** `main.js:1047,1057-1069,1075` send `toggle-command-palette`, `toggle-sidebar-panel` (with a panel-id arg: `explorer`/`git`/`snippets`/`templates`), and `toggle-bottom-panel`. All three channels are already whitelisted in `ALLOWED_RECEIVE_CHANNELS` (`preload.js:242-244`). None have a renderer listener — the Command Palette currently only opens via its own `Ctrl+Shift+P` keydown handler (`renderer.js:2045-2049`), sidebar panels only toggle via their own buttons, and the bottom/REPL panel only auto-shows when a code block runs (`renderer.js:1007`).

- [ ] **Step 1:** Find the existing function/method that the `Ctrl+Shift+P` keydown handler calls to open the command palette (read `renderer.js:2040-2060` to get its exact name), then add:
```javascript
ipcRenderer.on('toggle-command-palette', () => {
  /* call the same open/toggle function the Ctrl+Shift+P handler uses */
});
```
- [ ] **Step 2:** Find the existing method on `sidebarManager` used to show/activate a panel by id (read the `SidebarManager` class, likely in `src/sidebar/` — grep `class SidebarManager`), then add:
```javascript
ipcRenderer.on('toggle-sidebar-panel', (event, panelId) => {
  /* call sidebarManager's existing toggle/show method with panelId */
});
```
- [ ] **Step 3:** Find the existing function that shows/hides the bottom REPL panel (read `renderer.js` around line 997-1012), then add:
```javascript
ipcRenderer.on('toggle-bottom-panel', () => {
  /* call the same show/hide function used when a code block runs, but toggle rather than force-show */
});
```
- [ ] **Step 4:** Manually verify each of the three View-menu items now actually opens/toggles its target.
- [ ] **Step 5:** `npm run lint && npm test`
- [ ] **Step 6:** Commit: `git add src/renderer.js && git commit -m "fix(menu): wire Command Palette / Sidebar / Bottom Panel View-menu toggles"`

### Task 5: Fix broken `git-diff` IPC call (renderer invokes a channel main never handles)

**Files:**
- Modify: `src/main/GitOperations.js`, `src/main.js` (near the other `git-*` handlers, ~line 4889-4904)
- Modify: `src/sidebar/git-panel.js`, `src/renderer.js:1714-1731`

**Verified current behavior:** `renderer.js:1718-1721` passes `gitDiff: (file) => ipcRenderer.invoke('git-diff', { file })` into the Git sidebar panel, but `src/main.js` has **no** `ipcMain.handle('git-diff', ...)` registered anywhere (only `git-status`, `git-stage`, `git-commit`, `git-log` exist at lines 4889-4904), and `GitOperations.js` exports no `diff` function. Additionally, `src/sidebar/git-panel.js:1` receives this callback as a parameter literally named `_gitDiff` (underscore-prefixed = intentionally unused) — the panel never even calls it. This is dead on both ends. Fold the real fix into Task 14 (Phase C, new git features) rather than doing a throwaway partial fix here.

- [ ] **Step 1:** No action in this task — cross-reference only. Mark this task done once Task 14 lands, since it fully supersedes it.

### Task 6: Whitelist and wire "Document Compare" menu item

**Files:**
- Modify: `src/preload.js` (`ALLOWED_RECEIVE_CHANNELS`)

**Verified current behavior:** `main.js:1411-1413` sends `mainWindow.webContents.send('show-document-compare')`, but `'show-document-compare'` is **not** in `ALLOWED_RECEIVE_CHANNELS` at all (unlike the other dead channels, which were at least whitelisted) — per `preload.js:288-...` the `on()` wrapper drops unlisted channels. Building the actual compare UI is Task 20 (Phase C) — this task only covers the whitelist fix; C8 covers the working listener + UI.

- [ ] **Step 1:** Add `'show-document-compare'` to `ALLOWED_RECEIVE_CHANNELS` in `src/preload.js` (alongside the other `show-*-dialog`/`show-*-converter` entries for consistency).
- [ ] **Step 2:** `npm run lint && npm test`
- [ ] **Step 3:** Commit: `git add src/preload.js && git commit -m "fix(preload): whitelist show-document-compare channel"`
- Do not close this task's manual-verification step until Task 20 lands (there is nothing to see until the listener exists).

### Task 7: Reachable UI control for monospace font settings

**Files:**
- Modify: `src/renderer.js` (Settings panel/dialog — locate existing settings UI, e.g. grep `showSettingsDialog` or similar)

**Verified current behavior:** `ipcMain.handle('set-monospace-settings', ...)` exists and works (`main.js:375` area) and the getter is used at `renderer.js:1857`, but no UI control anywhere calls the setter — a user cannot actually change the monospace font/ligature preference.

- [ ] **Step 1:** Read `main.js` around the `get-monospace-settings`/`set-monospace-settings` handlers to learn the exact settings shape (property names, e.g. `{ enabled, fontFamily, ligatures }` — use whatever the real shape is, do not invent fields).
- [ ] **Step 2:** Locate the app's existing Settings panel/dialog in `renderer.js` (grep for where `get-monospace-settings` is already invoked at line ~1857 to find the surrounding UI section) and add a toggle + font-family control there, following the existing settings-control markup/CSS pattern already used for other settings in that same dialog.
- [ ] **Step 3:** Wire the control's change handler to `ipcRenderer.invoke('set-monospace-settings', {...})` and apply the returned/echoed setting immediately (toggle the body class the same way the existing `renderer.js:1857`-area code does on load).
- [ ] **Step 4:** Manually verify: toggle monospace font in Settings, confirm the editor/preview font changes live, and confirm the preference persists across an app restart.
- [ ] **Step 5:** `npm run lint && npm test`
- [ ] **Step 6:** Commit: `git add src/renderer.js && git commit -m "feat(settings): expose monospace font toggle in Settings UI"`

### Task 8: Dependency hygiene — `jszip` and `sharp`

**Files:**
- Modify: `package.json`

**Verified current behavior:** `src/main/DocxFontEmbedder.js` and `src/main/EpubFontEmbedder.js` `require('jszip')` directly, but `jszip` is declared only under `overrides`, not `dependencies` — it currently resolves only via hoisting from a transitive dependency. `sharp` is declared under `devDependencies` (used today only by `scripts/generate-icons.js` at build time) but Phase B (media converter) will require it at **runtime** in the packaged app, where devDependencies are not installed/bundled.

- [ ] **Step 1:** In `package.json`, add `"jszip": "^3.10.1"` to `dependencies` (matching the version already pinned in `overrides`; keep the `overrides` entry too — it still forces the version for transitive consumers).
- [ ] **Step 2:** Move `"sharp": "^0.34.3"` from `devDependencies` to `dependencies`.
- [ ] **Step 3:** Add `"node_modules/sharp/**"` to the `build.asarUnpack` array in `package.json` (alongside the existing `ffmpeg-static` and `assets/fonts` entries) — `sharp` ships native `.node` bindings that must not be packed into `app.asar`.
- [ ] **Step 4:** Run `npm install` to regenerate the lockfile, then `npm test` to confirm nothing broke.
- [ ] **Step 5:** Commit: `git add package.json package-lock.json && git commit -m "fix(deps): move jszip and sharp to runtime dependencies, unpack sharp from asar"`

---

## Phase B — Build Out Image/Audio/Video Converter (currently orphaned dead API)

**Context:** `preload.js` whitelists 16 channels (`image-convert`, `image-batch-convert`, `image-resize`, `image-compress`, `image-rotate`, `audio-convert`, `audio-batch-convert`, `audio-extract`, `audio-trim`, `audio-merge`, `video-convert`, `video-batch-convert`, `video-compress`, `video-trim`, `video-frames`, `video-gif`) and 3 receive channels (`show-image-converter`, `show-audio-converter`, `show-video-converter`), but **zero** `ipcMain` handlers exist for any of them and no menu/UI ever triggers them. This is distinct from the already-working generic "Universal Converter" (`universal-convert`/`universal-convert-batch`, `main.js:2377-2622`) which does plain format-to-format conversion via bare `convertWithImageMagick`/`convertWithFFmpeg` calls with no operation-specific options. Phase B builds the **operation-specific** toolkit (resize/compress/rotate for images; trim/merge/extract for audio; compress/trim/frames/gif for video) as a new `src/main/MediaOperations.js` module, modeled directly on the existing `src/main/PDFOperations.js` pattern (single `executeOperation(operation, data)` dispatcher).

### Task 9: Image operations backend (`sharp`-based)

**Files:**
- Create: `src/main/ImageOperations.js`
- Create: `tests/main/ImageOperations.test.js`
- Modify: `src/main.js` (register handlers near the PDF operation handlers, ~line 4535)

**Interfaces:**
- Produces: `module.exports = { executeOperation, imageConvert, imageResize, imageCompress, imageRotate }` — `executeOperation(operation, data)` where `operation` is one of `'convert' | 'resize' | 'compress' | 'rotate'` and `data` always includes `{ inputPath, outputPath }` plus operation-specific fields below.
- `imageConvert(data)`: `data = { inputPath, outputPath, format }` (`format` is one of sharp's supported output formats: `jpeg|png|webp|avif|tiff|gif`) → uses `sharp(inputPath).toFormat(format).toFile(outputPath)`.
- `imageResize(data)`: `data = { inputPath, outputPath, width, height, fit }` (`fit` one of `'cover'|'contain'|'fill'|'inside'|'outside'`, default `'inside'`) → `sharp(inputPath).resize({ width, height, fit }).toFile(outputPath)`. `width`/`height` may be `null` (sharp allows omitting one dimension to preserve aspect ratio) but not both.
- `imageCompress(data)`: `data = { inputPath, outputPath, quality }` (`quality` integer 1-100, default 80) → route by output extension: jpeg/webp/avif use `{ quality }`, png uses `{ quality, compressionLevel: 9 }`.
- `imageRotate(data)`: `data = { inputPath, outputPath, angle }` (`angle` integer degrees, any value — sharp's `.rotate(angle)` handles non-90 multiples by expanding canvas) → `sharp(inputPath).rotate(angle).toFile(outputPath)`.
- All four validate `inputPath` exists and is ≤ `MAX_FILE_SIZE` (import the same 50MB constant convention used in `main.js` — pass it in as a parameter from `main.js`, do not redefine a second limit).
- All four return `{ success: true, outputPath }` on success or throw an `Error` with a sanitized (no absolute-path leakage beyond what's already the app's convention) message on failure — `main.js` wraps calls in try/catch per the PDFOperations pattern.

- [ ] **Step 1:** Write `tests/main/ImageOperations.test.js` covering all four operations against small fixture images (generate fixtures at test time with `sharp` itself — e.g. a 100x100 red PNG buffer — do not commit binary fixtures):
```javascript
const sharp = require('sharp');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ImageOperations = require('../../src/main/ImageOperations');

describe('ImageOperations', () => {
  let tmpDir, inputPath;
  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imgops_'));
    inputPath = path.join(tmpDir, 'in.png');
    await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } } })
      .png()
      .toFile(inputPath);
  });
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  test('imageConvert converts PNG to JPEG', async () => {
    const outputPath = path.join(tmpDir, 'out.jpg');
    const result = await ImageOperations.imageConvert({ inputPath, outputPath, format: 'jpeg' });
    expect(result.success).toBe(true);
    expect(fs.existsSync(outputPath)).toBe(true);
    const meta = await sharp(outputPath).metadata();
    expect(meta.format).toBe('jpeg');
  });

  test('imageResize resizes to given width preserving aspect', async () => {
    const outputPath = path.join(tmpDir, 'out.png');
    await ImageOperations.imageResize({ inputPath, outputPath, width: 50, height: null, fit: 'inside' });
    const meta = await sharp(outputPath).metadata();
    expect(meta.width).toBe(50);
  });

  test('imageRotate rotates by given angle', async () => {
    const outputPath = path.join(tmpDir, 'out.png');
    await ImageOperations.imageRotate({ inputPath, outputPath, angle: 90 });
    const meta = await sharp(outputPath).metadata();
    expect(meta.width).toBe(100); // 90deg on square stays square
  });

  test('imageCompress produces a smaller or equal-size JPEG at low quality', async () => {
    const jpegPath = path.join(tmpDir, 'in.jpg');
    await sharp(inputPath).jpeg({ quality: 100 }).toFile(jpegPath);
    const outputPath = path.join(tmpDir, 'compressed.jpg');
    await ImageOperations.imageCompress({ inputPath: jpegPath, outputPath, quality: 10 });
    expect(fs.statSync(outputPath).size).toBeLessThanOrEqual(fs.statSync(jpegPath).size);
  });

  test('executeOperation dispatches to the correct function', async () => {
    const outputPath = path.join(tmpDir, 'out.png');
    const result = await ImageOperations.executeOperation('rotate', { inputPath, outputPath, angle: 180 });
    expect(result.success).toBe(true);
  });

  test('unknown operation throws', async () => {
    await expect(ImageOperations.executeOperation('bogus', {})).rejects.toThrow();
  });
});
```
- [ ] **Step 2:** Run `npx jest tests/main/ImageOperations.test.js` — expect FAIL (module doesn't exist).
- [ ] **Step 3:** Implement `src/main/ImageOperations.js` per the interfaces above, using `sharp`. Model the file's shape (JSDoc header, `executeOperation` switch, `module.exports`) on `src/main/PDFOperations.js:404-436`.
- [ ] **Step 4:** Run `npx jest tests/main/ImageOperations.test.js` — expect PASS.
- [ ] **Step 5:** In `src/main.js`, add a single dispatcher handler near the PDF operation handler (`process-pdf-operation`, ~line 4535):
```javascript
const ImageOperations = require('./main/ImageOperations');
// ...
ipcMain.handle('process-image-operation', async (event, { operation, data }) => {
  try {
    return await ImageOperations.executeOperation(operation, data);
  } catch (error) {
    return { success: false, error: sanitizeErrorMessage(error.message) };
  }
});
```
Note: this collapses the originally-whitelisted 5 separate channel names (`image-convert`, `image-batch-convert`, `image-resize`, `image-compress`, `image-rotate`) into one operation-dispatch channel, matching the existing `process-pdf-operation` pattern — remove the 5 stale names from `ALLOWED_SEND_CHANNELS` in `src/preload.js` and add `'process-image-operation'` in their place (also add `'select-image-folder'` if batch needs folder selection — mirror `select-pdf-folder`). Batch (`image-batch-convert`) is handled in Task 12.
- [ ] **Step 6:** `npm run lint && npm test`
- [ ] **Step 7:** Commit: `git add src/main/ImageOperations.js tests/main/ImageOperations.test.js src/main.js src/preload.js && git commit -m "feat(image): implement sharp-based image operations backend"`

### Task 10: Audio operations backend (`ffmpeg`-based)

**Files:**
- Create: `src/main/AudioOperations.js`
- Create: `tests/main/AudioOperations.test.js`
- Modify: `src/main.js`

**Interfaces:**
- `module.exports = { executeOperation, buildConvertArgs, buildTrimArgs, buildExtractArgs, buildMergeArgs }`. Because ffmpeg is an external binary, this module exposes **pure argument-builder functions** (easily unit-testable without invoking a real binary) plus `executeOperation`, which is the only piece that actually spawns ffmpeg via `execFile` — inject the ffmpeg path and an `execFileFn` (defaulting to Node's real `execFile`) as parameters so tests can stub it.
- `buildConvertArgs({ inputPath, outputPath, format })` → returns `string[]` args, e.g. `['-i', inputPath, '-y', outputPath]` (format is implied by `outputPath`'s extension — ffmpeg infers it; do not pass a separate `-f` unless `format` is explicitly given and differs from the extension, in which case append `['-f', format]` before `outputPath`).
- `buildTrimArgs({ inputPath, outputPath, startTime, duration })` → `['-i', inputPath, '-ss', String(startTime), '-t', String(duration), '-y', outputPath]`. `startTime`/`duration` are seconds (numbers), validate they are finite non-negative numbers before building args (throw `Error('Invalid trim range')` otherwise — this is the injection guard, since these become argv elements passed straight to execFile with no shell involved, but malformed values should still fail fast rather than reach ffmpeg).
- `buildExtractArgs({ inputPath, outputPath })` → extracts the audio track from a video/audio file: `['-i', inputPath, '-vn', '-acodec', 'copy', '-y', outputPath]` (fallback if codec copy fails: caller retries without `-acodec copy`, letting ffmpeg transcode — implement this retry inside `executeOperation`'s `'extract'` case, not in the pure builder).
- `buildMergeArgs({ inputPaths, outputPath })` → `inputPaths` is `string[]` (2+ files) → build a temp concat-list file is the safe approach; but since this module must stay pure/testable, `buildMergeArgs` returns `{ args, concatListContent }` where `concatListContent` is the `file '<path>'` lines the caller writes to a temp file, and `args = ['-f', 'concat', '-safe', '0', '-i', tempListPath, '-c', 'copy', '-y', outputPath]` (caller supplies `tempListPath` after writing the file — see `executeOperation`'s `'merge'` case).
- `executeOperation(operation, data, { ffmpegPath, execFileFn } = {})` where `operation` is `'convert'|'trim'|'extract'|'merge'`, defaults `ffmpegPath` to the real `getFFmpegPath()`-resolved path (passed in from `main.js`, not re-implemented here) and `execFileFn` to `require('child_process').execFile`. Returns a Promise resolving `{ success: true, outputPath }`.

- [ ] **Step 1:** Write `tests/main/AudioOperations.test.js` testing the pure builders directly (no real ffmpeg spawn needed for these) plus one `executeOperation` test with a stubbed `execFileFn`:
```javascript
const AudioOperations = require('../../src/main/AudioOperations');

describe('AudioOperations argument builders', () => {
  test('buildConvertArgs builds correct ffmpeg args', () => {
    const args = AudioOperations.buildConvertArgs({ inputPath: '/a.wav', outputPath: '/b.mp3' });
    expect(args).toEqual(['-i', '/a.wav', '-y', '/b.mp3']);
  });

  test('buildTrimArgs builds correct trim args', () => {
    const args = AudioOperations.buildTrimArgs({ inputPath: '/a.mp3', outputPath: '/b.mp3', startTime: 5, duration: 10 });
    expect(args).toEqual(['-i', '/a.mp3', '-ss', '5', '-t', '10', '-y', '/b.mp3']);
  });

  test('buildTrimArgs rejects non-finite startTime', () => {
    expect(() =>
      AudioOperations.buildTrimArgs({ inputPath: '/a.mp3', outputPath: '/b.mp3', startTime: NaN, duration: 10 })
    ).toThrow('Invalid trim range');
  });

  test('buildMergeArgs builds concat-demuxer args and list content', () => {
    const { args, concatListContent } = AudioOperations.buildMergeArgs({
      inputPaths: ['/a.mp3', '/b.mp3'],
      outputPath: '/out.mp3',
    });
    expect(concatListContent).toContain("file '/a.mp3'");
    expect(concatListContent).toContain("file '/b.mp3'");
    expect(args).toContain('-f');
    expect(args).toContain('concat');
  });
});

describe('AudioOperations.executeOperation', () => {
  test('convert calls execFileFn with ffmpeg path and args, resolves success', async () => {
    const execFileFn = (cmd, args, opts, cb) => cb(null, '', '');
    const result = await AudioOperations.executeOperation(
      'convert',
      { inputPath: '/a.wav', outputPath: '/b.mp3' },
      { ffmpegPath: '/usr/bin/ffmpeg', execFileFn }
    );
    expect(result.success).toBe(true);
    expect(result.outputPath).toBe('/b.mp3');
  });

  test('unknown operation rejects', async () => {
    await expect(
      AudioOperations.executeOperation('bogus', {}, { ffmpegPath: '/usr/bin/ffmpeg', execFileFn: () => {} })
    ).rejects.toThrow();
  });
});
```
- [ ] **Step 2:** Run `npx jest tests/main/AudioOperations.test.js` — expect FAIL.
- [ ] **Step 3:** Implement `src/main/AudioOperations.js` per the interfaces above. Use `fs.writeFileSync`/`fs.mkdtempSync` (Node `os.tmpdir()`) inside `executeOperation`'s `'merge'` case to materialize the concat list file before invoking `execFileFn`.
- [ ] **Step 4:** Run `npx jest tests/main/AudioOperations.test.js` — expect PASS.
- [ ] **Step 5:** In `src/main.js`, add the dispatcher handler (mirrors Task 9 Step 5):
```javascript
const AudioOperations = require('./main/AudioOperations');
// ...
ipcMain.handle('process-audio-operation', async (event, { operation, data }) => {
  try {
    return await AudioOperations.executeOperation(operation, data, { ffmpegPath: getFFmpegPath() });
  } catch (error) {
    return { success: false, error: sanitizeErrorMessage(error.message) };
  }
});
```
Replace the 5 stale audio channel names in `ALLOWED_SEND_CHANNELS` (`preload.js`) with `'process-audio-operation'` (batch handled in Task 12).
- [ ] **Step 6:** `npm run lint && npm test`
- [ ] **Step 7:** Commit: `git add src/main/AudioOperations.js tests/main/AudioOperations.test.js src/main.js src/preload.js && git commit -m "feat(audio): implement ffmpeg-based audio operations backend"`

### Task 11: Video operations backend (`ffmpeg`-based)

**Files:**
- Create: `src/main/VideoOperations.js`
- Create: `tests/main/VideoOperations.test.js`
- Modify: `src/main.js`

**Interfaces:** Same shape as Task 10 (`executeOperation(operation, data, { ffmpegPath, execFileFn })`, pure arg builders for testability).
- `buildConvertArgs({ inputPath, outputPath })` → `['-i', inputPath, '-y', outputPath]`.
- `buildCompressArgs({ inputPath, outputPath, crf })` (`crf` 0-51, default 28 — lower is higher quality/larger file, matching libx264 convention) → `['-i', inputPath, '-vcodec', 'libx264', '-crf', String(crf), '-y', outputPath]`. Validate `crf` is an integer 0-51 (throw otherwise).
- `buildTrimArgs({ inputPath, outputPath, startTime, duration })` → identical shape/validation to `AudioOperations.buildTrimArgs`.
- `buildFramesArgs({ inputPath, outputDir, fps })` (`fps` frames-per-second to extract, default 1) → `['-i', inputPath, '-vf', `fps=${fps}`, path.join(outputDir, 'frame-%04d.png')]`. Validate `fps` is a positive finite number.
- `buildGifArgs({ inputPath, outputPath, fps, width })` (`fps` default 10, `width` default 480, height auto via `-1`) → `['-i', inputPath, '-vf', `fps=${fps},scale=${width}:-1:flags=lanczos`, '-y', outputPath]`.
- `operation` is `'convert'|'compress'|'trim'|'frames'|'gif'`.

- [ ] **Step 1:** Write `tests/main/VideoOperations.test.js` mirroring Task 10's test structure — one test per builder function checking exact `args` array output plus validation-rejection tests for `compress` (bad `crf`) and `frames` (bad `fps`), plus one `executeOperation` test with a stubbed `execFileFn` for `'convert'` and one for `'frames'` that also verifies the output directory is created (`fs.mkdirSync(outputDir, { recursive: true })` inside `executeOperation`'s `'frames'` case before spawning ffmpeg).
- [ ] **Step 2:** Run `npx jest tests/main/VideoOperations.test.js` — expect FAIL.
- [ ] **Step 3:** Implement `src/main/VideoOperations.js` per the interfaces above.
- [ ] **Step 4:** Run `npx jest tests/main/VideoOperations.test.js` — expect PASS.
- [ ] **Step 5:** In `src/main.js`, add the dispatcher handler (mirrors B1/B2):
```javascript
const VideoOperations = require('./main/VideoOperations');
// ...
ipcMain.handle('process-video-operation', async (event, { operation, data }) => {
  try {
    return await VideoOperations.executeOperation(operation, data, { ffmpegPath: getFFmpegPath() });
  } catch (error) {
    return { success: false, error: sanitizeErrorMessage(error.message) };
  }
});
```
Replace the 6 stale video channel names in `ALLOWED_SEND_CHANNELS` with `'process-video-operation'`.
- [ ] **Step 6:** `npm run lint && npm test`
- [ ] **Step 7:** Commit: `git add src/main/VideoOperations.js tests/main/VideoOperations.test.js src/main.js src/preload.js && git commit -m "feat(video): implement ffmpeg-based video operations backend"`

### Task 12: Media Operations UI (menu entries + dialog + batch)

**Files:**
- Create: `src/renderer/media-operations-dialog.js` (follow whatever module pattern `src/renderer.js` already uses for the PDF editor dialog — read `renderer.js:3685` onward to find that dialog's implementation file/pattern before creating this one)
- Modify: `src/main.js` (menu — add "Image/Audio/Video Tools..." entries under the existing `Tools` submenu, next to Table Generator/ASCII Art Generator at `main.js:1395-1414`; also extend `universal-convert-batch`'s existing batch-folder flow OR add three new `process-*-operation` batch loops mirroring the pattern at `main.js:2454-2563`, whichever requires less duplication once B1-B3 exist — prefer reusing `executeOperation` in a loop over `fs.readdirSync` results, matching the existing batch style)
- Modify: `src/preload.js` (add `'show-image-converter'`... already present; add `'process-image-operation'`/`'process-audio-operation'`/`'process-video-operation'` to `ALLOWED_SEND_CHANNELS` if not already added by B1-B3)

**Verified current behavior:** `show-image-converter`/`show-audio-converter`/`show-video-converter` are whitelisted receive channels with no sender and no listener — Batch Image/Audio/Video Conversion menu items already exist and work via the generic Universal Converter (`main.js:1283-1291`, `2454-2563`) for plain format conversion; this task adds the **operation-specific** single-file dialogs (resize/compress/rotate/trim/merge/extract/frames/gif) that B1-B3 implemented.

- [ ] **Step 1:** Add three menu items under `Tools` (`main.js`, after the "Document Compare" item added conceptually in Task 6/C8):
```javascript
{ label: 'Image Tools...', click: () => mainWindow.webContents.send('show-image-converter') },
{ label: 'Audio Tools...', click: () => mainWindow.webContents.send('show-audio-converter') },
{ label: 'Video Tools...', click: () => mainWindow.webContents.send('show-video-converter') },
```
- [ ] **Step 2:** Build the renderer-side dialog module. Read how the existing PDF Editor dialog (triggered by `show-pdf-editor-dialog`) is structured/rendered in `renderer.js` (search for its listener at line 3685 and follow into whatever function/file builds its DOM) and replicate that construction pattern for a single dialog that: (a) lets the user pick an operation from a dropdown scoped to the current media kind (image/audio/video), (b) shows the relevant operation-specific fields (e.g. width/height for resize, quality for compress, angle for rotate, startTime/duration for trim, fps/width for gif), (c) has an input-file picker (reuse the existing `dialog.showOpenDialogSync` pattern via a new small `ipcMain.handle('select-media-file', ...)` if no generic file-picker IPC already exists — check first; `select-pdf-folder` is folder-only, so a new single-file-picker handler is likely needed), (d) calls `ipcRenderer.invoke('process-image-operation', { operation, data })` (or audio/video) and shows success/error the same way `pdf-operation-complete`/`pdf-operation-error` are surfaced elsewhere.
- [ ] **Step 3:** Wire the three `ipcRenderer.on('show-image-converter'|'show-audio-converter'|'show-video-converter', ...)` listeners in `renderer.js` to open the new dialog scoped to the right media kind.
- [ ] **Step 4:** Manually verify with `npm start`: Tools → Image Tools → Resize a test PNG, confirm the output file is created at the chosen size; repeat once each for one audio op (trim) and one video op (compress) using any small local test media file.
- [ ] **Step 5:** `npm run lint && npm test`
- [ ] **Step 6:** Commit: `git add -A && git commit -m "feat(media): add Image/Audio/Video Tools dialogs wired to new operation backends"`

---

## Phase C — New Features (extending existing systems)

### Task 13: Expose more Pandoc export/import formats already supported by the bundled Pandoc

**Files:**
- Modify: `src/main.js` (export submenu ~`main.js:864-959`; `exportFile()` at `main.js:1766`; the format switch inside `performExportWithOptions`/`buildPandocExportArgs` — see Task 23, which replaces string-building with an args-array builder; add cases there, not to the old string-concat code)

**New formats to add** (all already importable per the existing import switch at `main.js:3507` — Pandoc supports both directions for each):
- Export: AsciiDoc (`asciidoc`), reStructuredText (`rst`), MediaWiki (`mediawiki`), Org-mode (`org`), Textile (`textile`), man page (`man`), Jupyter Notebook (`ipynb`).

- [ ] **Step 1:** Add 7 new menu entries to the Export submenu (`main.js:864-959`), grouped in a new labeled section, each calling `exportFile('<format>')` with the format id above.
- [ ] **Step 2:** Add each format to the extension-mapping table used by the export path (the `formatExtMap` object at `main.js:2624-2629` — add `asciidoc: 'adoc', mediawiki: 'wiki'`; the rest already match their format id as extension).
- [ ] **Step 3:** RULING (pre-flight scan, execution order is Phase A→B→C→D, so Task 23 has NOT run yet when this task executes): add each format as an additional `-t <format>` case to the **current** string-concatenation `pandocCmd` logic in `performExportWithOptions` (the same pattern already used for `'json'`, `'beamer'`, `'jira'` etc. around `main.js:2825-2965` — a simple `pandocCmd = \`${getPandocPath()} "${currentFile}" -t <format> -o "${outputFile}"\`; exportWithPandoc(pandocCmd, outputFile, format);` branch per new format is sufficient; do not introduce any new string-interpolated user-controlled fields — these 7 formats take no extra options beyond the standard ones already handled generically above the format switch). When Task 23 runs later (Phase D) it will read the current state of this function, per its own Step 3 instruction to "read every one of the sites... in full," and MUST carry these 7 new cases into its args-array rewrite — that responsibility already belongs to SEC-1's own scope and needs no separate action here.
- [ ] **Step 4:** Manually verify: export the currently-open sample markdown file to each of the 7 new formats, confirm each produces a non-empty output file Pandoc itself can round-trip (`pandoc out.rst -o roundtrip.md` succeeds).
- [ ] **Step 5:** `npm run lint && npm test`
- [ ] **Step 6:** Commit: `git add src/main.js && git commit -m "feat(export): expose AsciiDoc, RST, MediaWiki, Org, Textile, man, ipynb export formats"`

### Task 14: Git branch / diff / push / pull

**Files:**
- Modify: `src/main/GitOperations.js`
- Modify: `tests/` (find and extend the existing GitOperations test file — grep `tests/**/GitOperations*`; if none exists, create `tests/main/GitOperations.test.js`)
- Modify: `src/main.js` (register 4 new `ipcMain.handle` calls near the existing git handlers, `main.js:4889-4904`)
- Modify: `src/preload.js` (add `'git-branch'`, `'git-diff'` is already listed but unhandled — see below, `'git-push'`, `'git-pull'` to `ALLOWED_SEND_CHANNELS`)
- Modify: `src/sidebar/git-panel.js`, `src/renderer.js:1714-1731`

**Interfaces (add to `GitOperations.js`, matching the existing `try { ... } catch (err) { return { error: err.message } }` pattern used by every existing function there):**
```javascript
async function diff(dir, file) { /* git.diff([file]) if file given, else git.diff() for full working-tree diff */ }
async function branches(dir) { /* git.branchLocal() — returns { all, current, branches } */ }
async function checkoutBranch(dir, name, isNew) { /* isNew=true: git.checkoutLocalBranch(name); else git.checkout(name) */ }
async function push(dir) { /* git.push() */ }
async function pull(dir) { /* git.pull() */ }
module.exports = { getStatus, stage, commit, log, diff, branches, checkoutBranch, push, pull };
```

- [ ] **Step 1:** Write/extend the Jest test file covering `diff`, `branches`, `checkoutBranch`, `push`, `pull` against a real temp git repo (follow whatever fixture pattern the existing Git-related tests use — if this is the first GitOperations test file, initialize a repo with `simple-git` itself inside `beforeEach` using `fs.mkdtempSync` + `simpleGit(tmpDir).init()`, matching how `simple-git` is already used in the module under test).
- [ ] **Step 2:** Run the new tests — expect FAIL (functions don't exist).
- [ ] **Step 3:** Implement the 5 new functions in `GitOperations.js` per the interfaces above.
- [ ] **Step 4:** Run the tests — expect PASS.
- [ ] **Step 5:** In `main.js`, register handlers next to the existing 4:
```javascript
ipcMain.handle('git-diff', async (event, { file }) => {
  const dir = path.dirname(currentFile || app.getPath('documents'));
  return GitOperations.diff(dir, file);
});
ipcMain.handle('git-branches', async () => GitOperations.branches(path.dirname(currentFile || app.getPath('documents'))));
ipcMain.handle('git-checkout', async (event, { name, isNew }) => GitOperations.checkoutBranch(path.dirname(currentFile || app.getPath('documents')), name, isNew));
ipcMain.handle('git-push', async () => GitOperations.push(path.dirname(currentFile || app.getPath('documents'))));
ipcMain.handle('git-pull', async () => GitOperations.pull(path.dirname(currentFile || app.getPath('documents'))));
```
(Match whatever `dir` resolution the existing `git-status` handler at `main.js:4889-4891` actually uses — read those 3 lines first and reuse the identical expression rather than inventing a new one.)
- [ ] **Step 6:** Add `'git-branches'`, `'git-checkout'`, `'git-push'`, `'git-pull'` to `ALLOWED_SEND_CHANNELS` in `preload.js` (`'git-diff'` is already present).
- [ ] **Step 7:** In `src/sidebar/git-panel.js`, rename the unused `_gitDiff` parameter to `gitDiff` and add UI to actually call it (a "diff" button/icon per changed file in the status list, rendering the returned diff text in a `<pre>` block or similar — follow the panel's existing rendering style for the status list). Add branch/push/pull UI following the same panel's existing button/section style.
- [ ] **Step 8:** In `renderer.js:1714-1731`, pass the 4 new callbacks (`gitBranches`, `gitCheckout`, `gitPush`, `gitPull`) into `getRenderGitPanel()` alongside the existing ones.
- [ ] **Step 9:** Manually verify in a real git-tracked test folder: view a file diff, list branches, create+checkout a new branch, (push/pull only if a real remote is available — otherwise verify the IPC round-trip returns a sane `{error: ...}` for a repo with no remote, not a crash).
- [ ] **Step 10:** `npm run lint && npm test`
- [ ] **Step 11:** Commit: `git add -A && git commit -m "feat(git): add diff, branch, checkout, push, pull to Git sidebar panel"`

### Task 15: More PDF operations — extract text, page numbers, crop, extract images

**Files:**
- Modify: `src/main/PDFOperations.js`, its test file (grep `tests/**/PDFOperations*`)
- Modify: `src/main.js` (`process-pdf-operation` already dispatches via `executeOperation` — no new handler needed, just new `case`s in `PDFOperations.js`'s existing switch at line 404)
- Modify: renderer PDF editor dialog UI (wherever the existing operation list/buttons are — find via the `show-pdf-editor-dialog` listener at `renderer.js:3685`)

**Interfaces (add to the existing `executeOperation` switch, `PDFOperations.js:404-430`):**
```javascript
async function pdfExtractText(data) { /* data: {inputPath}. Use pdf-lib's page.getTextContent() is NOT available in pdf-lib — pdf-lib has no text extraction. Use pdfjs-dist (already a dependency) instead: load with pdfjs-dist, iterate pages, getTextContent(), join strings. Return { success: true, text } */ }
async function pdfAddPageNumbers(data) { /* data: {inputPath, outputPath, position, startNumber}. For each page, drawText via pdf-lib at the given corner (reuse the position-mapping switch already present in pdfWatermark, PDFOperations.js:258-287, for corner math). */ }
async function pdfCrop(data) { /* data: {inputPath, outputPath, margins: {top,bottom,left,right}} in points. Use page.setCropBox(x, y, width, height) computed from the page's existing MediaBox minus margins. */ }
async function pdfExtractImages(data) { /* data: {inputPath, outputDir}. pdf-lib doesn't expose embedded image extraction either — use pdfjs-dist's page.getOperatorList() + page.objs to pull OPS.paintImageXObject image data, write each as PNG via sharp (already a dependency after Task 8). Return { success: true, count, files: string[] } */ }
```
Add 4 new `case` branches to `executeOperation` (`'extractText'`, `'pageNumbers'`, `'crop'`, `'extractImages'`) and add all 4 to `module.exports`.

- [ ] **Step 1:** Read `PDFOperations.js:233-317` (`pdfWatermark`) in full to reuse its exact position-to-coordinate mapping logic for `pdfAddPageNumbers` rather than re-deriving it.
- [ ] **Step 2:** Write tests for all 4 new functions in the existing PDFOperations test file, generating a minimal test PDF at test time via `pdf-lib`'s `PDFDocument.create()` (mirror however the existing test file already builds its fixture PDFs — check its `beforeEach`).
- [ ] **Step 3:** Run new tests — expect FAIL.
- [ ] **Step 4:** Implement the 4 functions.
- [ ] **Step 5:** Run new tests — expect PASS.
- [ ] **Step 6:** Add 4 corresponding buttons/menu entries to the PDF editor dialog UI, following its existing per-operation button pattern exactly (find where 'Watermark' or 'Rotate' is wired in the renderer PDF dialog and copy that structure).
- [ ] **Step 7:** Manually verify each of the 4 operations against a real PDF via the app UI.
- [ ] **Step 8:** `npm run lint && npm test`
- [ ] **Step 9:** Commit: `git add -A && git commit -m "feat(pdf): add extract text, page numbers, crop, extract images operations"`

### Task 16: PDF form field fill/flatten

**Files:**
- Modify: `src/main/PDFOperations.js` (+ test file), PDF editor dialog UI

**Interfaces:**
```javascript
async function pdfGetFormFields(data) { /* data: {inputPath}. PDFDocument.load(bytes) -> pdfDoc.getForm().getFields() -> map each to {name, type, value}. Return { success: true, fields } */ }
async function pdfFillForm(data) { /* data: {inputPath, outputPath, values: Record<string,string>, flatten}. Load, getForm(), for each key in values call form.getTextField(key).setText(value) (wrap per-field in try/catch to skip fields that don't exist or aren't text fields — this app's convention per pdfWatermark is to fail loudly on real errors but this is a batch-of-independent-fields case, so log+skip per-field failures and continue). If flatten, call form.flatten() before saving. */ }
```
Add `'formFields'` (get) and `'fillForm'` cases to `executeOperation`, add both to exports.

- [ ] **Step 1:** Write tests building a test PDF with an AcroForm text field via `pdf-lib`'s `form.createTextField()` API (check pdf-lib's docs/existing usage in the codebase for the exact field-creation calls — `PDFOperations.js` already imports `pdf-lib`, follow its existing import style).
- [ ] **Step 2:** Run tests — expect FAIL.
- [ ] **Step 3:** Implement both functions.
- [ ] **Step 4:** Run tests — expect PASS.
- [ ] **Step 5:** Add a "Fill Form" UI entry to the PDF editor dialog: on open, call `formFields` to list detected fields, render a text input per field, a "Flatten after fill" checkbox, then call `fillForm` on submit.
- [ ] **Step 6:** Manually verify against a real fillable PDF (search for one under `tests/fixtures/` or create one with `pdf-lib` in a scratch script — do not commit the scratch script).
- [ ] **Step 7:** `npm run lint && npm test`
- [ ] **Step 8:** Commit: `git add -A && git commit -m "feat(pdf): add form field detection, fill, and flatten"`

### Task 17: Plugin API — export-format and file-reader registration hooks

**Files:**
- Modify: `src/plugins/plugin-context.js`, `src/plugins/plugin-loader.js` (or wherever plugin manifests are validated/loaded — grep `plugin-loader.js`), `src/main.js` (export format switch — needs to consult plugin-registered formats)

**Interfaces (extend `PluginContext`, `plugin-context.js:64-71`, alongside the existing `this.exports` block):**
```javascript
this.formats = {
  registerExportFormat: (id, opts) => {
    // opts: { label, extension, handler: async (markdownContent, outputPath, options) => void }
    if (formatRegistry) formatRegistry.register(`${pluginId}:${id}`, opts);
  },
};
```
This requires a new small `FormatRegistry` (mirror the existing `plugin-registry.js` pattern — read it first to match its exact API shape, e.g. `register(id, opts)` / `getAll()` / `get(id)`) injected into `PluginContext`'s constructor `deps` alongside `sidebar`/`commands`/`statusBar`.

- [ ] **Step 1:** Read `src/plugins/plugin-registry.js` in full to learn its exact class/function shape before adding a sibling `FormatRegistry` (or extending the existing registry with a new namespace if it's already generic enough — prefer extending over duplicating if the existing registry is namespace-agnostic).
- [ ] **Step 2:** Add `registerExportFormat` to `PluginContext` per the interface above, wired to whatever registry mechanism Step 1 determined is the right fit.
- [ ] **Step 3:** In `src/main.js`'s export dispatch path (wherever the Export submenu's dynamic entries would need to merge in plugin formats — likely requires the Export submenu to be rebuilt after plugin load, similar to how `createMenu()` is already called after recent-files change in Task 2; check if `createMenu()` is idempotent/safe to call after plugin loading completes), add plugin-registered formats as additional Export submenu entries whose `click` handler calls the plugin's registered `handler` function instead of Pandoc.
- [ ] **Step 4:** Update the built-in `writing-studio` plugin's manifest/index (`src/plugins/built-in/`) with a trivial example usage of `registerExportFormat` (e.g. exporting sprint data as a `.txt` summary) — this both documents the new API and gives Step 5's manual test something concrete to click.
- [ ] **Step 5:** Write a unit test in `tests/plugins/` (find the existing plugin test directory/pattern) verifying a plugin calling `context.formats.registerExportFormat(...)` results in the registry containing the namespaced entry.
- [ ] **Step 6:** Manually verify: `npm start`, confirm the writing-studio example format appears in the Export menu and produces the expected output file when clicked.
- [ ] **Step 7:** `npm run lint && npm test`
- [ ] **Step 8:** Commit: `git add -A && git commit -m "feat(plugins): add export-format registration hook to plugin API"`

### Task 18: DOCX/EPUB template gallery UI

**Files:**
- Modify: `src/renderer.js` (export dialog for DOCX/EPUB — find via `exportWordWithTemplate()` at `main.js:881` and follow into whatever renderer dialog it opens)
- Modify: `src/main.js` (wherever the existing Word-template list is sourced from — grep `WordTemplateExporter` and `listTemplates`/`getTemplates`-style function)

**Verified context:** `main.js` already has `exportWordWithTemplate()` and `WordTemplateExporter` (`src/wordTemplateExporter.js`) — a template mechanism for DOCX exists but per the feature-inventory research pass has "no discoverable UI" for browsing available templates; the user has to already know a template exists. Read `src/wordTemplateExporter.js` in full first to learn how templates are currently listed/selected (is there a folder of `.dotx`/`.docx` template files? A hardcoded list?) before designing the gallery.

- [ ] **Step 1:** Read `src/wordTemplateExporter.js` and the renderer dialog `exportWordWithTemplate()` opens, to learn the exact current template-selection mechanism (function names, data shape).
- [ ] **Step 2:** Add a visual gallery (grid of template name + thumbnail-if-available, or name + short description if no thumbnails exist) to that same dialog, replacing or augmenting whatever minimal selector currently exists, following the dialog's existing CSS/markup conventions (check `src/styles.css` for the dialog's existing classes before inventing new ones).
- [ ] **Step 3:** Do the same for EPUB export if `main.js` has an equivalent EPUB-template mechanism (grep for `epub` + `template`); if none exists, skip EPUB (do not invent a template system that doesn't exist — note this explicitly as out of scope in the commit message rather than silently dropping it).
- [ ] **Step 4:** Manually verify: open the DOCX export dialog, see the template gallery, pick one, confirm the exported DOCX uses it.
- [ ] **Step 5:** `npm run lint && npm test`
- [ ] **Step 6:** Commit: `git add -A && git commit -m "feat(export): add visual template gallery to DOCX export dialog"`

### Task 19: CSV-to-markdown-table toolbar converter

**Files:**
- Modify: `src/renderer.js` (editor toolbar — find the existing toolbar button registration pattern, e.g. near table generator/ASCII generator toolbar buttons)

**Verified context:** Pandoc already imports CSV (`main.js:3507` import switch includes `csv`). This task adds a quick in-editor action: paste/select CSV-like text, convert to a markdown table without leaving the editor (distinct from the full file-import path).

- [ ] **Step 1:** Add a toolbar button "CSV → Table" (or a Command Palette entry, matching whichever pattern is more consistent with similar single-action editor tools already in the toolbar — check what's already there before choosing).
- [ ] **Step 2:** Implement a pure client-side CSV→Markdown-table converter function in `renderer.js` (no need to round-trip through Pandoc for this simple case — parse the current selection's lines by comma, respecting basic double-quote-wrapped fields containing commas; build a `| a | b |` / `|---|---|` markdown table). Keep this function small and testable — extract it to `src/lib/csv-to-markdown-table.js` if `src/renderer.js` doesn't already have a `src/lib/`-style extraction pattern for similar pure functions (check first).
- [ ] **Step 3:** Write a Jest unit test for the converter function covering: simple CSV, quoted fields containing commas, ragged rows (fewer columns in some rows — pad with empty cells), empty input.
- [ ] **Step 4:** Wire the toolbar button to: read the editor selection, run the converter, replace the selection with the resulting markdown table.
- [ ] **Step 5:** Manually verify: select a few lines of comma-separated text in the editor, click the button, confirm it becomes a proper markdown table.
- [ ] **Step 6:** `npm run lint && npm test`
- [ ] **Step 7:** Commit: `git add -A && git commit -m "feat(editor): add CSV-to-markdown-table toolbar converter"`

### Task 20: Document Compare / diff view (completes Task 6)

**Files:**
- Modify: `src/renderer.js` (new listener for `show-document-compare`, whitelisted in Task 6)
- Create: `src/renderer/document-compare-dialog.js` (or inline in `renderer.js` if that's the dominant pattern for similar dialogs — match Task 12's finding on dialog-module conventions)

**Verified context:** `main.js:1411-1413` sends `show-document-compare`; Task 6 whitelisted the channel; nothing renders it yet. This task adds an actual two-pane diff: either two arbitrary local files, or (leveraging Task 14's new `GitOperations.diff`) the current file against its last-committed git revision.

- [ ] **Step 1:** Build a simple two-file diff dialog: two "choose file" buttons (or one defaulting to the currently-open tab + one file picker for the comparison target), a line-by-line diff render. Do not add a new diff-algorithm dependency — write a minimal LCS-based line diff in a small pure function (`src/lib/line-diff.js`) since the app has no existing diff library; keep it under ~60 lines (standard textbook LCS-diff, not a full Myers-diff library port).
- [ ] **Step 2:** Write a Jest unit test for the line-diff function: identical files (no diffs), pure additions, pure deletions, mixed changes.
- [ ] **Step 3:** Add a "Compare with Git HEAD" option in the same dialog when the current file is inside a git repo, using `GitOperations.diff` from Task 14 (raw git diff text render, separate code path from the line-diff function — git's own diff output is already a diff, don't re-diff it).
- [ ] **Step 4:** Wire `ipcRenderer.on('show-document-compare', () => { /* open the dialog */ })` in `renderer.js`.
- [ ] **Step 5:** Manually verify: Tools → Document Compare, compare two local markdown files, confirm additions/deletions are visually distinguished (e.g. green/red line backgrounds, matching the app's existing theme CSS variables rather than hardcoded colors).
- [ ] **Step 6:** `npm run lint && npm test`
- [ ] **Step 7:** Commit: `git add -A && git commit -m "feat(compare): implement Document Compare dialog with local-diff and git-HEAD-diff modes"`

### Task 21: Export presets/profiles

**Files:**
- Modify: `src/main.js` (near `get-header-footer-settings`/`save-header-footer-settings` handlers, `main.js:1857-1886`)
- Modify: renderer export-options dialog (wherever `export-with-options` is invoked from — grep `export-with-options` in `renderer.js`)

**Interfaces:**
```javascript
// main.js — new handlers, settings persisted the same way header/footer settings already are
// (read main.js:1857-1886 first to copy its exact settings-file read/write pattern, e.g. settings.json path + key)
ipcMain.handle('get-export-presets', async () => { /* returns array of {id, name, format, options} */ });
ipcMain.handle('save-export-preset', async (event, preset) => { /* upsert by id, persist, return updated list */ });
ipcMain.handle('delete-export-preset', async (event, presetId) => { /* remove by id, persist, return updated list */ });
```

- [ ] **Step 1:** Read `main.js:1857-1886` in full to learn the exact settings-persistence pattern already used (this app uses a custom JSON file store per `CLAUDE.md`, not `electron-store` — confirm the exact file/key convention and reuse it verbatim for presets, e.g. a new top-level `exportPresets` array in the same `settings.json`).
- [ ] **Step 2:** Implement the 3 handlers per the interfaces above, add all 3 channel names to `ALLOWED_SEND_CHANNELS` in `preload.js`.
- [ ] **Step 3:** In the renderer's export-options dialog, add a "Save as preset" button (captures the current dialog's option values, prompts for a name, calls `save-export-preset`) and a preset dropdown at the top of the dialog (populated via `get-export-presets` on open; selecting one pre-fills the dialog's fields) plus a delete icon per preset row.
- [ ] **Step 4:** Manually verify: configure export options, save as a preset, close and reopen the dialog, confirm the preset is selectable and correctly restores all fields; delete it, confirm it's gone.
- [ ] **Step 5:** `npm run lint && npm test`
- [ ] **Step 6:** Commit: `git add -A && git commit -m "feat(export): add save/select/delete export presets"`

### Task 22: Batch PDF operations UI (beyond format conversion)

**Files:**
- Modify: `src/renderer.js` (Batch menu handling — find the `show-batch-converter` listener with `'pdf'` type)
- Modify: `src/main.js` (extend the batch loop to support PDFOperations, not just format conversion)

**Verified context:** `main.js:1293-1296` already has a "Batch PDF Conversion..." menu item sending `show-batch-converter` with type `'pdf'`, but (per the existing batch conversion handlers at `main.js:2454-2563`) batch only does format conversion via `convertWithLibreOffice`/pandoc — it never calls into `PDFOperations.executeOperation` for bulk watermark/compress/rotate across many files.

- [ ] **Step 1:** In the renderer's batch dialog (wherever the `'pdf'`-typed batch dialog renders), add an operation-type selector when the batch type is `'pdf'`: "Convert format" (existing behavior, keep as default) vs. "Bulk PDF Operation" (new: pick one of merge/split/compress/rotate/watermark/etc. plus that operation's fields, same fields as the single-file PDF editor dialog).
- [ ] **Step 2:** Add a new `ipcMain.on('batch-pdf-operation', async (event, { operation, data, inputFolder, includeSubfolders }) => {...})` handler in `main.js` that collects matching `.pdf` files (reuse the exact `collectFiles` recursive helper already defined inside `universal-convert-batch`, `main.js:2472-2484` — extract it to a shared top-level function if it isn't already, since Task 22 needs the identical logic) and calls `PDFOperations.executeOperation(operation, {...data, inputPath: filePath, outputPath: ...})` per file in a loop, reporting progress via `mainWindow.webContents.send('batch-progress', ...)` matching the existing batch progress-reporting convention.
- [ ] **Step 3:** Add `'batch-pdf-operation'` to `ALLOWED_SEND_CHANNELS`.
- [ ] **Step 4:** Manually verify: batch-watermark a folder of 2-3 test PDFs, confirm each output file has the watermark applied.
- [ ] **Step 5:** `npm run lint && npm test`
- [ ] **Step 6:** Commit: `git add -A && git commit -m "feat(pdf): add bulk PDF operations (watermark/compress/rotate/etc.) to batch converter"`

---

## Phase D — Security Remediation

### Task 23: Fix Pandoc argument-injection vulnerability (CRITICAL)

**Files:**
- Modify: `src/main.js` (every `pandocCmd` string-concatenation site: `performExportWithOptions` ~`2623-2965`, `exportPDFViaWordTemplate`-adjacent function ~`2980-3050`, `runPandocCmd`/`parseCommand` at `231-282`, the import-side builder at `~3501`, and the enhanced-export builder at `~3997-4097`)
- Modify: `tests/` (new regression test)

**Verified root cause:** `performExportWithOptions` and its siblings build a shell-style command **string** by concatenating user-influenced values (export dialog fields: `options.template`, `options.metadata` key/values, `options.variables` key/values, `options.bibliography` path, `options.csl` path, `options.geometry`, footer text, CSS file path) wrapped in double quotes, e.g. `` pandocCmd += ` --bibliography="${options.bibliography}"` ``. This string is later tokenized by `parseCommand()` (`main.js:253-282`) — a hand-rolled parser that toggles an `inQuotes` flag on any `"` or `'` character and has **no backslash-escape handling at all**. The `.replace(/"/g, '\\"')` escaping applied to `metadata`/`variables` values therefore does nothing protective: `parseCommand` sees the literal backslash as an ordinary character and the following `"` still toggles quote state exactly as an unescaped quote would. Any field that reaches `parseCommand` un-sanitized (which is most of them — `template`, `bibliography`, `csl`, `geometry`, footer text are never escaped at all) lets an attacker-controlled value containing a `"` character break out of its intended single argument and inject additional argv elements into the `execFile(pandocPath, args, ...)` call at the end of `runPandocCmd`. Because `execFile` (not `exec`) is used, this is **not** a shell-injection (no `;`, `|`, backticks interpreted) — it is **argument injection into pandoc itself**, which is still exploitable: Pandoc supports `--lua-filter=<path>` and `--filter=<path>` (arbitrary Lua/executable code execution), `-o <path>` (arbitrary file overwrite by injecting a second `-o`), and `--resource-path`/`--extract-media` (arbitrary-path writes). A malicious value in any of the un-escaped fields above is enough to reach that severity — no shell metacharacters are even needed, just a `"` followed by a new flag.

**Fix approach:** Stop building command strings entirely for every one of these call sites. Replace with direct `execFile(pandocPath, argsArray, ...)` calls where `argsArray` is built as a real JS array (`push`, never string interpolation) — this is exactly what `PDFOperations.js`/`GitOperations.js` already do correctly, and what `AudioOperations.js`/`VideoOperations.js`/`ImageOperations.js` do from Phase B. `parseCommand`/`runPandocCmd`'s string-based indirection should be deleted once all call sites are converted — do not leave it in place as unused dead code (would violate the "no forbidden markers/half-finished" standard); if any call site turns out to be legitimately hard to convert in this task, that is a signal that call site needs its own careful sub-step, not a reason to keep the vulnerable helper around "just in case."

- [ ] **Step 1:** Write a regression test proving the vulnerability exists in the *current* code, in a new file `tests/main/pandoc-arg-safety.test.js`, calling `parseCommand` directly (it will need to be exported from `main.js` for testing, or extracted first — see Step 2) with a crafted value and asserting it does NOT produce an injected extra argument:
```javascript
// This test is written to FAIL against the current parseCommand implementation,
// proving the vulnerability, then PASS once Step 3+ removes the vulnerable path.
const { buildPandocArgs } = require('../../src/main/PandocArgs'); // new module created in Step 3

test('a bibliography path containing a double quote cannot inject extra pandoc flags', () => {
  const malicious = '/tmp/x.bib" --lua-filter=/tmp/evil.lua -o "/tmp/x.bib';
  const args = buildPandocArgs({
    inputFile: '/in.md',
    outputFile: '/out.pdf',
    format: 'pdf',
    options: { bibliography: malicious },
  });
  // The malicious string must appear as exactly ONE argv element (whatever
  // value it ends up as), never split into multiple args, and
  // '--lua-filter=/tmp/evil.lua' must not appear as its own array element.
  expect(args).not.toContain('--lua-filter=/tmp/evil.lua');
  expect(args.filter((a) => a.includes(malicious) || a === malicious).length).toBeLessThanOrEqual(1);
});
```
- [ ] **Step 2:** Run the test — confirm it fails to even import (module doesn't exist yet) — this is expected; proceed to build the real module.
- [ ] **Step 3:** Create `src/main/PandocArgs.js` — a pure module exporting `buildPandocArgs({ inputFile, outputFile, format, options })` that returns a plain `string[]` args array (no string concatenation of the whole command — only individual argv elements are ever created via `.push(...)`), reimplementing every option currently handled across the string-building sites (`toc`, `tocDepth`, `numberSections`, `citeproc`, `bibliography`, `csl`, `template`, `metadata` (loop → `push('-M', `${key}=${value}`)` — no manual quote-escaping needed at all, since array elements are passed to `execFile` as literal argv, never re-parsed), `variables` (same pattern with `-V`), `pdfEngine`, `geometry`, monospace font header include, footer text). Read every one of the sites listed in "Files" above in full before writing this, to ensure no option is silently dropped.
- [ ] **Step 4:** Run the Step 1 test — expect PASS now.
- [ ] **Step 5:** Replace every call site that currently builds a `pandocCmd` string and calls `runPandocCmd(pandocCmd, ...)` with: build args via `PandocArgs.buildPandocArgs(...)`, then `execFile(getPandocPath(), args, { maxBuffer: 10 * 1024 * 1024 }, callback)` directly — inline this or add a tiny `runPandocArgs(args, callback)` helper next to the deleted `runPandocCmd` to avoid repeating the `execFile` options object at every site.
- [ ] **Step 6:** Delete `parseCommand` and the old `runPandocCmd` (`main.js:231-282`) once no call site references them (grep to confirm zero remaining references before deleting).
- [ ] **Step 7:** Manually re-run every export format the app supports (or at minimum: PDF, DOCX, HTML, EPUB, LaTeX — the ones with the most option surface) via the UI, confirming exports still succeed with the new args-array path, including with TOC/metadata/bibliography options actually filled in (not just defaults) to catch any option silently dropped in Step 3.
- [ ] **Step 8:** `npm run lint && npm test`
- [ ] **Step 9:** Commit: `git add -A && git commit -m "fix(security): eliminate pandoc argument-injection vector by building execFile args arrays directly"`

### Task 24: Formal security-review pass

**Files:** N/A — process task.

- [ ] **Step 1:** Invoke the `security-review` skill against the full working tree (post Phase A/B/C/SEC-1 changes) to catch anything beyond what this plan's manual audit already found — particularly re-check the new `AudioOperations`/`VideoOperations`/`ImageOperations` modules and the new file-picker/batch handlers added in Phase B/C for the same class of injection risk (all must use `execFile` with array args — verify none of them slipped into string-building), and check the new plugin `registerExportFormat` hook (Task 17) for arbitrary-code-execution risk if a malicious/compromised plugin could abuse it beyond what a plugin can already do.
- [ ] **Step 2:** For every finding the skill reports, triage severity and either fix inline (Critical/High) or explicitly log as an accepted/deferred risk with reasoning (Medium/Low) — do not silently drop findings.
- [ ] **Step 3:** Produce a short written security summary (what was found across both the manual audit and the formal pass, what was fixed, what if anything was deferred and why) and save it to `docs/superpowers/plans/2026-08-23-security-assessment-summary.md`.
- [ ] **Step 4:** Commit any additional fixes with individual, scoped commit messages (do not batch unrelated security fixes into one commit).

---

## Phase E — Rebuild Local Release

### Task 25: Full verification + local build

**Files:** N/A — build/verification task.

- [ ] **Step 1:** `npm run lint` — must pass clean.
- [ ] **Step 2:** `npm run format:check` — must pass clean (run `npm run format` first if not).
- [ ] **Step 3:** `npm test` — all suites must pass; confirm the total test count has grown from the 247-test baseline (new tests from Phase B/C tasks should be present).
- [ ] **Step 4:** `npm run download-tools` (ensures bundled Pandoc/tool binaries are current for the build).
- [ ] **Step 5:** `npm run build:local` (per `package.json` script — builds Linux + Windows targets; this matches "local release" for this dev machine's platform(s)). If this machine is Linux-only and Windows cross-build tooling (wine, etc.) isn't available, fall back to `npm run build:linux-ci` and note the Windows build was skipped and why.
- [ ] **Step 6:** Verify the `dist/` output contains the expected artifacts (`.deb`, `.AppImage` at minimum) and that the packaged app launches (`./dist/*.AppImage` or the unpacked `dist/linux-unpacked/markdown-converter` binary) without immediate crash — smoke-test opening a markdown file and exporting to PDF from the packaged build specifically (not `npm start`), since `asarUnpack` behavior for `sharp`/`ffmpeg-static`/fonts only manifests in a packaged build.
- [ ] **Step 7:** Report the final `dist/` artifact list and versions to the user; do not bump `package.json`'s version number as part of this task unless the user asks — that is a separate release-management decision.
