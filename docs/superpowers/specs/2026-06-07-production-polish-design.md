# Production polish — v5 shippable build

**Date:** 2026-06-07
**Branch:** `react-electron`
**Status:** Draft, pending implementation plan
**Author:** Claude (brainstormed with Amit Haridas)

## 1. Goals & non-goals

### Goals

v5 is reliably shippable to two distribution channels:

- **GitHub Releases** (public, free, existing workflow).
- **ConcreteInfo update server** at `https://updates.concreteinfo.co.in/v5/` (self-hosted, for ConcreteInfo's own users).

Concretely:

- A non-blocking update banner surfaces "v5.0.2 is available" with a user-confirmed restart-to-install flow. No silent background installs.
- A light first-run wizard (theme + update channel + starter template), all skippable.
- One-shot auto-migration from v4.4.1 settings, with a v4 backup file and a toast on success/failure.
- Local crash dump capture (no third-party). CrashReportModal lets the user open the dump folder and copy/delete dumps.
- GitHub Actions CI that builds + uploads artifacts on tag and runs the test suite on every PR.

### Non-goals (deferred to v5.1+)

- **Code signing.** macOS Gatekeeper and Windows SmartScreen will warn. Re-evaluated for v5.1.
- **Sentry or any third-party crash reporting.** Local dumps only.
- **Auto-install on quit.** Always user-confirmed.
- **Delta updates** (full downloads only in v5).
- **Plugin system, cloud/licensing, perf/a11y** — each is its own subsequent spec.

## 2. Architecture

```
GitHub Releases (public)        ConcreteInfo (CI feed)
  └── *.zip, *.dmg, *.exe,        └── *.zip, *.dmg, *.exe,
      *.deb, *.rpm,                  *.deb, *.rpm,
      latest.yml, latest-           latest.yml, latest-
      mac.yml, latest-              mac.yml, latest-
      linux.yml, latest-            linux.yml, latest-
      windows.yml                   windows.yml
        ▲                              ▲
        │                              │
        └──────┬───────────────────────┘
               │ electron-updater reads
               │ the channel chosen in
               │ Settings (default: GitHub)
               ▼
┌─────────────────────────────────────────────────────┐
│  Main process (src/main/updater/)                  │
│   - Updater service: wraps electron-updater         │
│   - Channel resolver: returns feed URL from setting │
│   - State machine: idle → checking → available →    │
│     downloading → ready → installing                │
│   - Crash writer: catches process.on('uncaught…)   │
│   - Migration runner: idempotent, runs on app start│
└─────────────────────────────────────────────────────┘
        ▲                              ▲
        │ IPC (renderer→main,           │ IPC (renderer→main,
        │ allowlisted SEND)             │ allowlisted SEND)
        │ updater:check,                │ crash:read,
        │ updater:install,              │ crash:open-dir,
        │ updater:get-state             │ crash:delete
        │                               │
        │ IPC (main→renderer,           │
        │ allowlisted RECEIVE)          │
        │ updater:status                │
        ▼                              ▼
┌─────────────────────────────────────────────────────┐
│  Renderer (preload bridge + React)                  │
│   - Update banner: "v5.0.2 available"               │
│   - Settings: Update channel radio                  │
│   - First-run wizard: skip-links, all optional      │
│   - Crash dialog: open dump dir, copy file          │
│   - Migration: first-launch indicator in settings   │
└─────────────────────────────────────────────────────┘
```

### Key boundaries

- **`src/main/updater/`** is a single new directory. `updater-service.js` owns the `electron-updater` lifecycle, never the renderer.
- **Renderer talks to updater over IPC only.** No direct `autoUpdater` import in preload. Channels must be in `ALLOWED_SEND_CHANNELS` / `ALLOWED_RECEIVE_CHANNELS`.
- **Channel switching is a settings change.** No restart required; the next `checkForUpdates()` reads the new feed URL.
- **Migration is idempotent.** Stores a `migration.version` key; skips if already at v5.
- **Crash writer never blocks startup.** Initialized in main entry, but a write failure is non-fatal.

## 3. Component breakdown

| Unit | What it does | How it's used | Depends on |
|---|---|---|---|
| `main/updater/updater-service.js` | Owns `electron-updater`; exposes check/download/install; emits status events | Main process singleton; started after `app.whenReady()` | `electron-updater`, `electron` |
| `main/updater/feed-config.js` | Maps channel setting → feed URL; reads from `app.getPath('userData')/settings.json` | Called by updater-service on each check | settings store |
| `main/updater/crash-writer.js` | Hooks `process.on('uncaughtException', …)`; writes minidump + stack to `app.getPath('userData')/crashDumps/{timestamp}.json` | Initialized in main entry, before anything else | `electron`, `app.getPath` |
| `main/updater/migration-runner.js` | Reads v4 settings; transforms to v5 schema; writes backup; updates `migration.version` | Run from main entry on `app.whenReady()` | `fs`, settings store |
| `main/ipc/updater-handlers.js` | IPC handlers: `updater:check`, `updater:install`, `updater:get-state` | Registered in main entry | updater-service |
| `main/ipc/crash-handlers.js` | IPC handlers: `crash:read`, `crash:open-dir` | Registered in main entry | crash-writer |
| `preload.js` (extension) | Add `updater.check()`, `updater.install()`, `crash.read()`, `crash.openDir()` to `electronAPI`; add channels to allowlist | Preload runs at boot | existing preload |
| `renderer/lib/updater-store.ts` | Zustand store mirroring updater state; subscribes to `updater:status` events | Renderer; consumed by banner, settings, modals | `zustand`, IPC bridge |
| `renderer/components/UpdateBanner.tsx` | Non-blocking banner shown when `updater-store.status` is `available | downloading | ready` | Mounted in `App.tsx` next to header | updater-store, sonner |
| `renderer/components/FirstRunWizard.tsx` | 3-step modal with skip links; opens on first launch when `app-store.firstRun === true` | Mounted in `App.tsx` | app-store, settings-store, command-store |
| `renderer/components/modals/SettingsModal.tsx` (extend) | Add "Updates" section: channel radio, "Check now" button, auto-check toggle | Mounted via `useAppStore.modal` | updater-store, settings-store |
| `renderer/components/modals/CrashReportModal.tsx` | List local crash dumps; "Open dump folder", "Copy to clipboard", "Delete" actions | Mounted via `useAppStore.modal` | crash ipc, sonner |
| `renderer/lib/migrations/v4-to-v5.ts` | Pure function: `(v4Settings) => v5Settings` | Called from `migration-runner` | zod schemas |

### Data flow — "user clicks Check for updates"

1. Settings panel: `useSettingsStore.getState().setSetting('updateChannel', 'github' | 'concreteinfo')`.
2. `SettingsModal` calls `await ipc.updater.check()`.
3. Preload `safeCall` → `window.electronAPI.updater.check()` → `ipcRenderer.invoke('updater:check')`.
4. Main handler asks `updater-service` to `autoUpdater.checkForUpdates()` with the channel's feed URL.
5. `updater-service` emits `'updater:status', { state: 'available', version: '5.0.2' }`.
6. Preload forwards to `updater-store` via `window.electronAPI.on('updater:status', cb)`.
7. `updater-store` state flips to `available`; `UpdateBanner` renders.
8. User clicks "View release notes" → opens `https://github.com/.../releases/tag/v5.0.2` via `ipc.app.openExternal`.
9. User clicks "Restart to update" → calls `ipc.updater.install()`. `updater-service` calls `autoUpdater.quitAndInstall()`. App quits, relaunches into v5.0.2.

## 4. Error handling

### Updater

- **No network:** `autoUpdater.checkForUpdates()` rejects with `ENOTFOUND` / `ETIMEDOUT`. We catch, log to main log, emit `updater:status { state: 'error', code: 'NETWORK' }`. Banner shows "Couldn't check for updates. Try again." Toast fires inline at the wire point in `UpdateBanner` / `SettingsModal` on retry, matching the existing pattern (`toasts-inline-at-wire-points`).
- **Feed 404 / signature missing (N/A in v5 since unsigned):** Treat as configuration error. Log to main log with full URL. Banner shows "Update feed is misconfigured. Report this on GitHub." Crash-log-style entry is written.
- **Update available but download fails:** Banner flips to "Download failed. Try again." Clicking "Try again" re-invokes `autoUpdater.downloadUpdate()`. Three consecutive failures show a "Report issue" link in the banner.
- **Update installs but launch fails:** Worst case. We catch the post-`quitAndInstall` crash via `crash-writer` and write a marker file `app.getPath('userData')/update-failed.json` with the previous version. On next boot, the user is offered to revert manually by re-downloading from the GitHub release page (a "rolled back" banner instead of the wizard).
- **Concurrent checks:** Debounce 60s. A second `checkForUpdates()` within 60s is a no-op; returns the current state. The Check-Now button is disabled during a check.

### Migration

- **v4 settings file missing/corrupt:** Treat as "nothing to migrate." App starts with v5 defaults. Toast: "Welcome to v5 — using default settings."
- **Migration throws mid-transform:** Original v4 file is preserved as `settings.v4.bak.json` (already on disk). App starts with v5 defaults. Toast: "Couldn't migrate v4 settings — your old settings are preserved at {path}."
- **`migration.version === 5`:** Skip entirely. No-op.

### Crash writer

- **Dump write fails (disk full, permissions):** Print to stderr; do not crash the app. Recovery is "user's problem" — we never block app startup on the crash writer.
- **No dumps in dir:** CrashReportModal shows empty state: "No crashes recorded — nice work!"

### First-run wizard

- **Skip clicked at any step:** Sets `app-store.firstRun = false` and proceeds. All defaults already match the unselected choice, so this is non-destructive.
- **Wizard cannot reach settings (corrupt store):** Falls back to defaults silently. Wizard still closes.

## 5. Testing

### Unit (Vitest, renderer-side)

- `useUpdaterStore`: state transitions on each `updater:status` event; debounce on `check()`; reject on missing channel.
- `FirstRunWizard`: each step's CTA writes the right slice; "Skip" leaves defaults; "Skip at step 1" still closes the wizard and sets `firstRun = false`.
- `migrations/v4-to-v5`: golden-file tests — every v4 shape we ship transforms to expected v5 output. Idempotency: running twice yields identical v5 settings.
- `feed-config`: each channel setting resolves to the right feed URL; missing/unknown channel falls back to GitHub.

### Component (Vitest + RTL)

- `UpdateBanner`: hidden when state is `idle` or `error-network`; visible with the right copy in `available`/`downloading`/`ready`; Restart button calls `ipc.updater.install()`; "View release notes" opens the right URL via `ipc.app.openExternal`.
- `FirstRunWizard`: skip links work; theme picker updates the store; channel picker persists; template picker inserts into the new buffer.
- `CrashReportModal`: lists dumps from the IPC response; "Open folder" invokes `crash.openDir`; delete removes the file.
- `SettingsModal > Updates`: channel radio flips `settings-store.updateChannel`; "Check now" fires `ipc.updater.check`; auto-check toggle persists.

### Integration (Vitest, full app)

- **Migration end-to-end:** pre-seed a v4 settings file in `app.getPath('userData')/settings.json`, launch the app, verify v5 file is written, v4 backup exists, `migration.version === 5`, and the wizard opens on first run.
- **Update flow mock:** stub `electron-updater` to emit `available` → `downloading` → `ready`; verify the banner appears, Restart click triggers `quitAndInstall`, and the IPC sequence matches the allowlist.

### E2E (Playwright + Electron, runs the live app)

- Open the app, verify the FirstRun wizard renders. Skip. Verify the editor is visible.
- Open Settings, switch update channel from GitHub to ConcreteInfo, click Check now. Stub the feed response. Verify the banner appears with the right version.
- Click Restart. Verify the app calls `quitAndInstall` (assert on a mocked `autoUpdater.quitAndInstall`).
- Trigger an unhandled rejection in the renderer. Verify a dump is written to `crashDumps/`. Open the CrashReportModal, verify it appears in the list.

### Coverage targets

- Updater service: ≥ 90% (small surface, hot path).
- Migration runner: 100% of branches (idempotency, corrupt file, missing file, transform failure).
- FirstRunWizard: ≥ 80%.
- Component tests above any preset.

## 6. Distribution feed contracts

### GitHub Releases (default)

Feed URL pattern:
```
https://github.com/{owner}/{repo}/releases/download/v{version}/
```

For v5.0.2:
```
https://github.com/{owner}/{repo}/releases/download/v5.0.2/latest-mac.yml
https://github.com/{owner}/{repo}/releases/download/v5.0.2/latest-linux.yml
https://github.com/{owner}/{repo}/releases/download/v5.0.2/latest-windows.yml
```

`electron-updater` reads these automatically given the GitHub owner/repo config. The release workflow already exists at `.github/workflows/release.yml` and builds `.dmg`, `.zip`, `.exe`, `.deb`, `.rpm`. We add `latest.yml` generation via `electron-builder --publish always` in the CI.

### ConcreteInfo feed

Feed URL:
```
https://updates.concreteinfo.co.in/v5/latest.yml
https://updates.concreteinfo.co.in/v5/latest-mac.yml
https://updates.concreteinfo.co.in/v5/latest-linux.yml
https://updates.concreteinfo.co.in/v5/latest-windows.yml
```

CI mirrors the GitHub Release artifacts to this path on every release. ConcreteInfo infra is documented in `~/.claude-mmax/CLAUDE.md`; the coolify server is `localhost:8000`. The mirror is a static-file route — no auth, just version-prefixed.

## 7. First-run wizard contract

Three steps. Each step has "Skip" and "Back" links. Final step is "Done."

1. **Theme:** Light / Dark / System. Default: System. Persists to `settings-store.theme`.
2. **Update channel:** GitHub Releases / ConcreteInfo. Default: GitHub Releases. Persists to `settings-store.updateChannel`.
3. **Starter template:** Blank / README / Meeting notes / Blog post. Default: Blank. On "Done," creates an untitled buffer with the chosen template content.

`firstRun` lives in `app-store` (not persisted across app data resets) and is checked on every launch. Setting it to `false` either explicitly (skip/done) or implicitly (v4 migration succeeded) prevents re-showing.

## 8. Settings migration contract (v4.4.1 → v5.0.0)

`migration-runner` runs once on first v5 launch. It:

1. Reads `app.getPath('userData')/settings.json` if it exists.
2. Validates the v4 shape with a zod schema (`v4SettingsSchema`).
3. If valid: transforms via `migrations/v4-to-v5.ts` and writes the v5 settings to `settings.json`. Backs up v4 to `settings.v4.bak.json`. Sets `migration.version = 5` in the v5 file.
4. If missing or invalid: writes a fresh v5 settings file with defaults. `migration.version = 5`.
5. If transform throws: leaves v4 file in place as the "backup." App starts with defaults. Toast warns the user.

The transform handles:

- v4 `theme` ('light' | 'dark' | 'auto') → v5 `theme` ('light' | 'dark' | 'system').
- v4 `customCss` string → v5 `customCssPath` file path or `null`.
- v4 `recentFiles: string[]` → v5 `recentFiles` (unchanged shape).
- v4 `editorFontSize: number` → v5 `editorFontSize` (unchanged shape).
- v4 `keyBindings: object` → v5 `userBindings` (keymap).
- v4 `snippets: array` → v5 `snippets` (unchanged shape).
- v4 `pdfExportOptions` etc. → v5 schema for the new export pipeline.

Anything not in the v4 schema is dropped. Defaults are taken from the v5 zod schema.

## 9. IPC allowlist additions

`src/preload.js` adds these to `ALLOWED_SEND_CHANNELS`:

```js
'updater:check',
'updater:install',
'updater:get-state',
'crash:read',
'crash:open-dir',
'crash:delete',
```

`ALLOWED_RECEIVE_CHANNELS`:

```js
'updater:status',
```

The `electronAPI` object gets:

```js
updater: {
  check: () => ipcRenderer.invoke('updater:check'),
  install: () => ipcRenderer.invoke('updater:install'),
  getState: () => ipcRenderer.invoke('updater:get-state'),
  onStatus: (cb) => ipcRenderer.on('updater:status', (_, payload) => cb(payload)),
},
crash: {
  read: () => ipcRenderer.invoke('crash:read'),
  openDir: () => ipcRenderer.send('crash:open-dir'),
  delete: (filename) => ipcRenderer.invoke('crash:delete', filename),
},
```

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| First-run wizard is annoying to long-time users | Skippable; only shows on first launch. `firstRun = false` is set permanently on first skip/done. |
| Auto-migration corrupts settings | Original v4 file is preserved as `settings.v4.bak.json`. Transform errors fall back to defaults and toast the user. |
| Crash writer fills disk | Cap at 20 dumps; oldest auto-pruned. |
| Update feed mirror drift between GitHub and CI | Mirror runs in CI on every release; manual `npm run publish:concreteinfo` available as fallback. |
| `electron-updater` is unsigned, so anyone can publish a "v5.0.2" to a mirror | We do not enable auto-install in v5 — every install is user-confirmed via the release-notes page. v5.1 adds signing. |
| First-run wizard blocks app start on a slow renderer | Wizard is non-blocking. App shell mounts and is interactive behind the modal. |
| Debounced `checkForUpdates()` may mask real errors | "Check now" button bypasses the debounce; debounce only applies to automatic checks. |
| CI release workflow is on a tag — broken tags must be re-tagged manually | Documented in CONTRIBUTING.md; pre-release tag re-runs the workflow. |

## 11. Out of scope (deferred)

- Code signing.
- Delta updates.
- Per-channel pre-release / beta tracks (only stable feeds in v5).
- Crash analytics / Sentry.
- Squirrel.Windows-specific quirks (we publish NSIS only).
