# Packaging — All-Platform Build + GitHub Releases

**Goal:** Make `npm run dist:all` produce Linux + Windows + macOS artifacts, and have the existing `.github/workflows/release.yml` create a GitHub Release on tag push with those artifacts. No code signing in this iteration.

**Scope (user decisions 2026-06-06):**
- Target platforms: **all three** (Linux .deb/AppImage/snap, Windows NSIS/portable/zip, macOS dmg/zip)
- Distribution: **GitHub Releases** (no auto-update; static artifacts only)
- Code signing: **skip for now** (unsigned binaries; Windows SmartScreen will warn, macOS Gatekeeper will quarantine)

**Architecture:** This is mostly about completing the existing scaffold. `electron-builder` 26.0.12, `scripts/download-tools.js`, `scripts/generate-icons.js`, the `package.json` scripts, and `release.yml` are all already in place. We need to (1) close a real bug in the `files` config, (2) add the macOS job to the workflow, and (3) declare macOS targets in the package config.

**Tech stack:** electron-builder 26.0.12, GitHub Actions `ubuntu-latest`/`windows-latest`/`macos-latest` runners, softprops/action-gh-release@v2 for the release creation.

---

## Task 1 — Fix the `files` config in `package.json`

The current `files: ["src/**/*", ...]` matches `src/renderer/**/*.tsx` and ships dev source into the asar. The shipped renderer should be the built `dist/renderer/**/*` output, not TS source. asarUnpack for ffmpeg-static is correct and stays.

**Files:** `package.json` (build.files, build.extraResources)

### Step 1.1 — Replace `files` block

```json
"files": [
  "src/main/**/*",
  "src/preload.js",
  "src/plugins/**/*",
  "package.json"
],
"extraResources": [
  {
    "from": "dist/renderer",
    "to": "renderer"
  }
]
```

- `src/main/**/*` — main process source (entry point + all main-process modules)
- `src/preload.js` — single preload file at the root of `src/`
- `src/plugins/**/*` — built-in plugins (referenced from main process; the `extraFiles: []` line in the current config is empty, so this is the right pattern)
- `package.json` — required for the asar `app.asar/package.json` lookup electron does at runtime
- `dist/renderer` moves to `extraResources` because it should live alongside the asar (not inside it) — the asar is sealed and we want the renderer to be a separately-updatable resource path. Production main loads it via `loadFile(path.join(__dirname, '../../dist/renderer/index.html'))` which, in the packaged app, resolves to `process.resourcesPath/renderer/index.html`. **This requires changing the loadFile path in `src/main/window/index.js` too** — see Task 4.

### Step 1.2 — Verify

- `npm run build:linux` should produce a working .AppImage
- Inside the .AppImage (extract with `--appimage-extract`), check `resources/` has `app.asar` and a `renderer/` directory containing `index.html` and `assets/`
- Inside `app.asar`, check `src/main/index.js` is present and `src/renderer/` is absent

---

## Task 2 — Add macOS targets + icon to `package.json` build config

**Files:** `package.json`

### Step 2.1 — Replace the existing `mac` block

```json
"mac": {
  "category": "public.app-category.productivity",
  "identity": null,
  "target": [
    { "target": "dmg", "arch": ["x64", "arm64"] },
    { "target": "zip", "arch": ["x64", "arm64"] }
  ],
  "icon": "assets/icon.icns",
  "darkModeSupport": true,
  "hardenedRuntime": false,
  "gatekeeperAssess": false,
  "entitlements": null
}
```

- `identity: null` is intentional for unsigned builds
- `darkModeSupport: true` — the app already supports dark mode; this is just metadata
- `hardenedRuntime: false` and `gatekeeperAssess: false` — without signing, these are the only way the build succeeds
- `entitlements: null` — no entitlements file; some features (jit) won't work but Electron's main process doesn't need them in this app
- **`.icns` is missing.** For this iteration we'll use the default Electron icon and add a follow-up to generate one. The build will succeed without it but the produced .app will have the default icon.

### Step 2.2 — Generate a placeholder `.icns` (optional, can be deferred)

If we want a proper icon, the path is:
1. `npm run generate-icons` to produce `assets/icons/*.png` (already done)
2. Use `png2icns` (Linux) or `iconutil` (mac) to bundle them into `assets/icon.icns`
3. We don't have either on this Linux container; defer to a follow-up plan

For this iteration: ship without `.icns` and accept the default icon.

### Step 2.3 — Add `publish` config

```json
"publish": {
  "provider": "github",
  "owner": "amitwh",
  "repo": "markdown-converter",
  "releaseType": "release"
}
```

Even without auto-update, this tells `electron-builder` to write `latest-mac.yml` / `latest-linux.yml` next to the artifacts. Useful for future auto-update wiring. CI passes `--publish=never` to override.

---

## Task 3 — Add macOS job to `.github/workflows/release.yml`

**Files:** `.github/workflows/release.yml`

### Step 3.1 — Add a third job between `build-windows` and `release`

Insert after the `build-windows` job (around line 96):

```yaml
  build-macos:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Download external tools (pandoc)
        run: node scripts/download-tools.js

      - name: Run tests
        run: npm test

      - name: Build macOS packages (unsigned)
        env:
          CSC_IDENTITY_AUTO_DISCOVERY: 'false'
        run: npm run build:mac -- --publish=never

      - name: Upload macOS artifacts
        uses: actions/upload-artifact@v4
        with:
          name: macos-artifacts
          path: |
            dist/*.dmg
            dist/*.zip
          retention-days: 5
```

### Step 3.2 — Wire macOS into the `release` job's `needs` and downloads

Change the `release` job:

```yaml
  release:
    needs: [build-linux, build-windows, build-macos]
    ...
```

And add a third download step (after the Windows download):

```yaml
      - name: Download macOS artifacts
        uses: actions/download-artifact@v4
        continue-on-error: true
        with:
          name: macos-artifacts
          path: dist
```

`continue-on-error: true` is intentional — a failed macOS build shouldn't block a release of working Linux+Windows artifacts.

---

## Task 4 — Update `src/main/window/index.js` for the resource path

**Files:** `src/main/window/index.js`

### Step 4.1 — Update the loadFile path

The current code (line 35):
```js
const prodPath = path.join(__dirname, '../../dist/renderer/index.html');
```

Inside the packaged app, `__dirname` points into the asar. `process.resourcesPath` points to the directory holding `app.asar` + the `renderer/` extraResources dir. Change to:

```js
const rendererIndex = app.isPackaged
  ? path.join(process.resourcesPath, 'renderer', 'index.html')
  : path.join(__dirname, '../../dist/renderer/index.html');
win.loadFile(rendererIndex);
```

This needs to happen after the dev/prod branch is decided. The existing `if (!app.isPackaged && devServerUrl)` block already handles dev mode; the else branch needs this update.

### Step 4.2 — Add a guard for missing renderer in prod

```js
if (app.isPackaged) {
  try {
    fs.accessSync(path.join(process.resourcesPath, 'renderer', 'index.html'));
  } catch {
    console.error('[WINDOW] Renderer not found at', process.resourcesPath, '— did you run `npm run build:renderer` before packaging?');
  }
}
```

Failure mode: someone runs `npm run build` without first building the renderer. Without this guard, the window opens blank and the user has no idea why.

---

## Task 5 — Test on this Linux box

### Step 5.1 — Local verification

```bash
npm ci
npm run download-tools   # idempotent; bin/linux/pandoc already exists
npm run build:renderer
npm run build:linux      # produces .deb, .AppImage in dist/
```

Inspect the .AppImage:
```bash
chmod +x dist/*.AppImage
./dist/MarkdownConverter-*.AppImage --appimage-extract
ls squashfs-root/resources/
# Expect: app.asar  renderer/
ls squashfs-root/resources/renderer/
# Expect: index.html  assets/
```

### Step 5.2 — Run the produced app

```bash
./dist/MarkdownConverter-*.AppImage
```

The app should:
- Launch with the AppShell, header, sidebar
- Allow opening a folder / file
- Export to PDF/DOCX/HTML work (pandoc bundled)

### Step 5.3 — Tag + push to test the release workflow (optional)

Only do this if the user wants to verify the full pipeline. A dry-run on the CI side via `act` would be cleaner but `act` doesn't run macos-latest jobs locally. If the user wants to verify the workflow, push a `v5.0.1-rc1` tag and watch the Actions tab.

---

## Success criteria

1. `npm run dist:all` produces all three platform families on this Linux box (or at least Linux + mac, since Windows is built on Windows)
2. The .AppImage launches and the app works end-to-end
3. `release.yml` runs all three jobs on a tag push and creates a GitHub release with the union of artifacts
4. No regressions: 306/306 tests still pass, dev workflow still works
5. The `files` bug is fixed: no `.tsx` in the packaged asar

## Known limitations (intentional, can be follow-ups)

- **No `.icns`** — the macOS app will have the default Electron icon. Generating a proper `.icns` requires `iconutil` (mac) or `png2icns` (cross-platform); neither is on this Linux box.
- **No code signing** — Windows SmartScreen will warn; macOS Gatekeeper will quarantine unsigned `.dmg`. Setting up signing later is a config-only change (no structural rework): add `CSC_LINK`/`CSC_KEY_PASSWORD` for Windows, `CSC_LINK` (Apple Developer ID) for mac.
- **No auto-update** — user decisions for this iteration. Wiring `electron-updater` is a follow-up; the `publish` config from Task 2 puts metadata in the right place.
- **Cross-build quirks** — building macOS from Linux produces a `.dmg` that is generally usable but may show a "this app is from an unidentified developer" prompt the first time. Right-click → Open to bypass once. Documented in the release notes.

## Out of scope

- CHANGELOG.md updates (not part of packaging)
- electron-updater wiring
- Code signing cert procurement
- Snap store / Microsoft Store / Mac App Store submission
