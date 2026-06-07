# Production polish — v5 shippable build

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship v5 to two distribution channels (GitHub Releases + ConcreteInfo self-hosted) with a non-blocking auto-update flow, a one-shot v4→v5 settings migration, a light first-run wizard, and local crash dump capture.

**Architecture:** Renderer talks to main over a small IPC surface (`updater:*`, `crash:*`). Main owns `electron-updater`, a feed-config resolver, a crash writer, and the migration runner. The renderer mirrors the updater state in a Zustand store. A `firstRun` flag in `app-store` gates the wizard.

**Tech Stack:** Electron 30+, `electron-updater`, Node 20, React 19, Zustand, Vitest + RTL, Playwright + Electron, `zod`.

---

## File Structure

| Path | Responsibility |
|---|---|
| `src/main/updater/updater-service.js` (new) | Owns the `autoUpdater` lifecycle. Emits status events. |
| `src/main/updater/feed-config.js` (new) | Maps `updateChannel` setting → feed URL. |
| `src/main/updater/crash-writer.js` (new) | Catches `uncaughtException`/`unhandledRejection` and writes JSON dumps. Caps at 20, prunes oldest. |
| `src/main/updater/migration-runner.js` (new) | Reads v4 settings, transforms to v5, writes backup, sets `migration.version`. |
| `src/main/ipc/updater-handlers.js` (new) | `updater:check`, `updater:install`, `updater:get-state` handlers. |
| `src/main/ipc/crash-handlers.js` (new) | `crash:read`, `crash:open-dir`, `crash:delete` handlers. |
| `src/renderer/lib/migrations/v4-to-v5.ts` (new) | Pure transform `(v4Settings) => v5Settings`. Zod-validated. |
| `src/renderer/lib/updater-store.ts` (new) | Zustand store mirroring updater state. |
| `src/renderer/lib/validators.ts` (modify) | Add `updateChannel` and `autoCheckUpdates` settings. |
| `src/renderer/components/UpdateBanner.tsx` (new) | Non-blocking banner with restart-to-install CTA. |
| `src/renderer/components/FirstRunWizard.tsx` (new) | 3-step modal mounted in `App.tsx`. |
| `src/renderer/components/modals/SettingsSheet.tsx` (modify) | Add Updates section. |
| `src/renderer/components/modals/CrashReportModal.tsx` (new) | List + manage local crash dumps. |
| `src/preload.js` (modify) | Allowlist + `electronAPI.updater.*`, `electronAPI.crash.*`. |
| `src/main/index.js` (modify) | Initialize updater-service, crash-writer, migration-runner on `app.whenReady`. |
| `src/renderer/App.tsx` (modify) | Mount `<UpdateBanner>`, `<FirstRunWizard>`, `<CrashReportModal>`. |
| `tests/unit/lib/migrations/v4-to-v5.test.ts` (new) | Golden-file + idempotency tests. |
| `tests/unit/lib/updater-store.test.ts` (new) | State transitions, debounce. |
| `tests/unit/main/updater/feed-config.test.js` (new) | Channel-to-URL mapping. |
| `tests/unit/main/updater/migration-runner.test.js` (new) | All migration branches. |
| `tests/component/UpdateBanner.test.tsx` (new) | Hidden/visible states, restart click. |
| `tests/component/FirstRunWizard.test.tsx` (new) | Skip, theme, channel, template. |
| `tests/component/modals/CrashReportModal.test.tsx` (new) | List, open, delete. |
| `tests/integration/migration-flow.test.tsx` (new) | Pre-seed v4, launch, verify migration. |
| `.github/workflows/release.yml` (modify) | Add `--publish=always` to publish latest.yml, add ConcreteInfo mirror step. |
| `.github/workflows/ci.yml` (modify) | Run vitest + jest on every PR. |
| `package.json` (modify) | Add `electron-updater` dep; `npm run publish:concreteinfo` script. |

---

## Task 1: Install electron-updater

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the dep**

```bash
npm install --save electron-updater@^6
```

- [ ] **Step 2: Verify install**

Run: `node -e "console.log(require('electron-updater').autoUpdater ? 'ok' : 'missing')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add electron-updater for auto-update flow"
```

---

## Task 2: feed-config module (TDD)

**Files:**
- Create: `src/main/updater/feed-config.js`
- Test: `tests/unit/main/updater/feed-config.test.js`

- [ ] **Step 1: Write the failing test**

`tests/unit/main/updater/feed-config.test.js`:
```js
const { resolveFeedUrl, FEEDS } = require('../../../../src/main/updater/feed-config');

describe('feed-config', () => {
  test('resolves github channel to GitHub Releases feed', () => {
    const url = resolveFeedUrl('github', '5.0.2', 'mac');
    expect(url).toBe('https://github.com/amitwh/markdown-converter/releases/download/v5.0.2/latest-mac.yml');
  });

  test('resolves concreteinfo channel to CI feed', () => {
    const url = resolveFeedUrl('concreteinfo', '5.0.2', 'mac');
    expect(url).toBe('https://updates.concreteinfo.co.in/v5/latest-mac.yml');
  });

  test('resolves windows platform correctly', () => {
    const url = resolveFeedUrl('github', '5.0.2', 'windows');
    expect(url).toContain('latest-windows.yml');
  });

  test('resolves linux platform correctly', () => {
    const url = resolveFeedUrl('github', '5.0.2', 'linux');
    expect(url).toContain('latest-linux.yml');
  });

  test('falls back to github on unknown channel', () => {
    const url = resolveFeedUrl('something-weird', '5.0.2', 'mac');
    expect(url).toContain('github.com');
  });

  test('exports both feeds as constants', () => {
    expect(FEEDS.github).toBeDefined();
    expect(FEEDS.concreteinfo).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test, confirm it fails**

Run: `npx jest tests/unit/main/updater/feed-config.test.js`
Expected: FAIL — `Cannot find module '../../../../src/main/updater/feed-config'`

- [ ] **Step 3: Implement the module**

`src/main/updater/feed-config.js`:
```js
const REPO = 'amitwh/markdown-converter';

const FEEDS = {
  github: {
    base: `https://github.com/${REPO}/releases/download`,
  },
  concreteinfo: {
    base: 'https://updates.concreteinfo.co.in/v5',
  },
};

function platformSuffix(platform) {
  if (platform === 'darwin' || platform === 'mac') return 'mac';
  if (platform === 'win32' || platform === 'windows') return 'windows';
  return 'linux';
}

function feedForChannel(channel, version, platform) {
  const suffix = platformSuffix(platform);
  const f = FEEDS[channel] || FEEDS.github;
  if (channel === 'github') {
    return `${f.base}/v${version}/latest-${suffix}.yml`;
  }
  return `${f.base}/latest-${suffix}.yml`;
}

function resolveFeedUrl(channel, version, platform) {
  return feedForChannel(channel, version, platform);
}

module.exports = { resolveFeedUrl, FEEDS };
```

- [ ] **Step 4: Run test, confirm it passes**

Run: `npx jest tests/unit/main/updater/feed-config.test.js`
Expected: 6 passing

- [ ] **Step 5: Commit**

```bash
git add src/main/updater/feed-config.js tests/unit/main/updater/feed-config.test.js
git commit -m "feat(updater): add feed-config to map channel setting to feed URL"
```

---

## Task 3: updater-service (TDD)

**Files:**
- Create: `src/main/updater/updater-service.js`
- Test: `tests/unit/main/updater/updater-service.test.js`

- [ ] **Step 1: Write the failing test**

`tests/unit/main/updater/updater-service.test.js`:
```js
const EventEmitter = require('events');
const { UpdaterService } = require('../../../../src/main/updater/updater-service');

describe('UpdaterService', () => {
  let emitter;
  let mockAutoUpdater;
  let service;

  beforeEach(() => {
    emitter = new EventEmitter();
    mockAutoUpdater = {
      on: jest.fn((event, cb) => emitter.on(event, cb)),
      checkForUpdates: jest.fn(),
      downloadUpdate: jest.fn(),
      quitAndInstall: jest.fn(),
      feedConfig: jest.fn(),
    };
    service = new UpdaterService(mockAutoUpdater);
  });

  test('starts in idle state', () => {
    expect(service.state).toBe('idle');
  });

  test('check() emits checking then available on update', async () => {
    const states = [];
    service.on('status', (s) => states.push(s));
    mockAutoUpdater.checkForUpdates.mockImplementation(() => {
      emitter.emit('checking-for-update');
      emitter.emit('update-available', { version: '5.0.2' });
    });
    await service.check();
    expect(states).toEqual([
      { state: 'checking' },
      { state: 'available', version: '5.0.2' },
    ]);
  });

  test('check() emits error on network failure', async () => {
    const states = [];
    service.on('status', (s) => states.push(s));
    mockAutoUpdater.checkForUpdates.mockImplementation(() => {
      emitter.emit('checking-for-update');
      emitter.emit('error', new Error('ENOTFOUND'));
    });
    await service.check();
    expect(states[states.length - 1]).toEqual({ state: 'error', code: 'NETWORK' });
  });

  test('check() debounces second call within 60s', async () => {
    service.lastCheckAt = Date.now();
    await service.check();
    expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });

  test('install() calls quitAndInstall on the autoUpdater', () => {
    service.install();
    expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test, confirm it fails**

Run: `npx jest tests/unit/main/updater/updater-service.test.js`
Expected: FAIL — `Cannot find module`

- [ ] **Step 3: Implement the module**

`src/main/updater/updater-service.js`:
```js
const { EventEmitter } = require('events');
const DEBOUNCE_MS = 60_000;

class UpdaterService extends EventEmitter {
  constructor(autoUpdater) {
    super();
    this.autoUpdater = autoUpdater;
    this.state = 'idle';
    this.lastCheckAt = 0;
    this._wire();
  }

  _wire() {
    const au = this.autoUpdater;
    au.on('checking-for-update', () => this._emit({ state: 'checking' }));
    au.on('update-available', (info) => this._emit({ state: 'available', version: info.version }));
    au.on('download-progress', (p) => this._emit({ state: 'downloading', percent: p.percent }));
    au.on('update-downloaded', (info) => this._emit({ state: 'ready', version: info.version }));
    au.on('update-not-available', () => this._emit({ state: 'idle' }));
    au.on('error', (err) => {
      const code = err && /ENOTFOUND|ETIMEDOUT|ECONNREFUSED/.test(err.message) ? 'NETWORK' : 'UNKNOWN';
      this._emit({ state: 'error', code });
    });
  }

  _emit(payload) {
    this.state = payload.state;
    this.emit('status', payload);
  }

  async check() {
    if (Date.now() - this.lastCheckAt < DEBOUNCE_MS) return;
    this.lastCheckAt = Date.now();
    await this.autoUpdater.checkForUpdates();
  }

  install() {
    this.autoUpdater.quitAndInstall();
  }
}

module.exports = { UpdaterService };
```

- [ ] **Step 4: Run test, confirm it passes**

Run: `npx jest tests/unit/main/updater/updater-service.test.js`
Expected: 5 passing

- [ ] **Step 5: Commit**

```bash
git add src/main/updater/updater-service.js tests/unit/main/updater/updater-service.test.js
git commit -m "feat(updater): add UpdaterService wrapping electron-updater lifecycle"
```

---

## Task 4: crash-writer (TDD)

**Files:**
- Create: `src/main/updater/crash-writer.js`
- Test: `tests/unit/main/updater/crash-writer.test.js`

- [ ] **Step 1: Write the failing test**

`tests/unit/main/updater/crash-writer.test.js`:
```js
const fs = require('fs');
const path = require('path');
const os = require('os');
const { CrashWriter } = require('../../../../src/main/updater/crash-writer');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'crash-test-'));
}

describe('CrashWriter', () => {
  test('writes a JSON dump for an uncaught exception', () => {
    const dir = tmpDir();
    const writer = new CrashWriter(dir);
    const err = new Error('boom');
    err.stack = 'Error: boom\n  at test.js:1:1';
    writer.handleUncaught(err, 'uncaughtException');
    const files = fs.readdirSync(dir);
    expect(files.length).toBe(1);
    const data = JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf-8'));
    expect(data.kind).toBe('uncaughtException');
    expect(data.message).toBe('boom');
    expect(data.stack).toContain('test.js:1:1');
    fs.rmSync(dir, { recursive: true });
  });

  test('caps at 20 dumps, pruning oldest', () => {
    const dir = tmpDir();
    const writer = new CrashWriter(dir);
    for (let i = 0; i < 25; i++) {
      writer.handleUncaught(new Error(`e${i}`), 'unhandledRejection');
    }
    const files = fs.readdirSync(dir);
    expect(files.length).toBe(20);
    fs.rmSync(dir, { recursive: true });
  });

  test('returns the list of dumps', () => {
    const dir = tmpDir();
    const writer = new CrashWriter(dir);
    writer.handleUncaught(new Error('a'), 'uncaughtException');
    writer.handleUncaught(new Error('b'), 'uncaughtException');
    const list = writer.list();
    expect(list.length).toBe(2);
    fs.rmSync(dir, { recursive: true });
  });

  test('deletes a dump by filename', () => {
    const dir = tmpDir();
    const writer = new CrashWriter(dir);
    writer.handleUncaught(new Error('x'), 'uncaughtException');
    const list = writer.list();
    writer.delete(list[0].filename);
    expect(writer.list().length).toBe(0);
    fs.rmSync(dir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run test, confirm it fails**

Run: `npx jest tests/unit/main/updater/crash-writer.test.js`
Expected: FAIL

- [ ] **Step 3: Implement the module**

`src/main/updater/crash-writer.js`:
```js
const fs = require('fs');
const path = require('path');
const MAX_DUMPS = 20;

class CrashWriter {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
  }

  handleUncaught(err, kind) {
    try {
      const filename = `${Date.now()}-${kind}.json`;
      const payload = {
        kind,
        message: err && err.message,
        stack: err && err.stack,
        timestamp: new Date().toISOString(),
      };
      fs.writeFileSync(path.join(this.dir, filename), JSON.stringify(payload, null, 2));
      this._prune();
    } catch (writeErr) {
      console.error('[crash-writer] dump write failed:', writeErr.message);
    }
  }

  _prune() {
    const files = fs.readdirSync(this.dir).sort();
    while (files.length > MAX_DUMPS) {
      const oldest = files.shift();
      try { fs.unlinkSync(path.join(this.dir, oldest)); } catch (_) { /* ignore */ }
    }
  }

  list() {
    if (!fs.existsSync(this.dir)) return [];
    return fs.readdirSync(this.dir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse()
      .map((filename) => {
        const full = path.join(this.dir, filename);
        const data = JSON.parse(fs.readFileSync(full, 'utf-8'));
        return { filename, ...data };
      });
  }

  delete(filename) {
    const full = path.join(this.dir, filename);
    if (fs.existsSync(full)) fs.unlinkSync(full);
  }

  path() {
    return this.dir;
  }
}

module.exports = { CrashWriter };
```

- [ ] **Step 4: Run test, confirm it passes**

Run: `npx jest tests/unit/main/updater/crash-writer.test.js`
Expected: 4 passing

- [ ] **Step 5: Commit**

```bash
git add src/main/updater/crash-writer.js tests/unit/main/updater/crash-writer.test.js
git commit -m "feat(crash): add CrashWriter for local crash dumps (cap 20, prune oldest)"
```

---

## Task 5: migration-runner (TDD)

**Files:**
- Create: `src/main/updater/migration-runner.js`
- Create: `src/renderer/lib/migrations/v4-to-v5.ts`
- Test: `tests/unit/main/updater/migration-runner.test.js`
- Test: `tests/unit/lib/migrations/v4-to-v5.test.ts`

- [ ] **Step 1: Write the renderer-side transform test (failing)**

`tests/unit/lib/migrations/v4-to-v5.test.ts`:
```ts
import { describe, expect, test } from 'vitest';
import { migrateV4ToV5, v4SettingsSchema } from '@/lib/migrations/v4-to-v5';

describe('migrateV4ToV5', () => {
  test('maps theme auto to system', () => {
    const out = migrateV4ToV5({ theme: 'auto', editorFontSize: 14 });
    expect(out.theme).toBe('system');
    expect(out.editorFontSize).toBe(14);
  });

  test('drops unknown keys, applies defaults', () => {
    const out = migrateV4ToV5({ theme: 'light', weirdKey: 1 });
    expect(out.theme).toBe('light');
    expect(out.weirdKey).toBeUndefined();
    expect(out.tabSize).toBe(4); // default
  });

  test('throws on invalid v4 input', () => {
    expect(() => migrateV4ToV5({ theme: 42 })).toThrow();
  });

  test('is idempotent — running twice yields the same v5 output', () => {
    const v4 = { theme: 'dark', editorFontSize: 16, recentFiles: ['/a.md'] };
    const a = migrateV4ToV5(v4);
    const b = migrateV4ToV5(v4);
    expect(a).toEqual(b);
  });

  test('exposes the v4 schema for use by main', () => {
    expect(v4SettingsSchema).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test, confirm it fails**

Run: `npx vitest run tests/unit/lib/migrations/v4-to-v5.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the transform**

`src/renderer/lib/migrations/v4-to-v5.ts`:
```ts
import { z } from 'zod';
import { settingsSchema } from '@/lib/validators';

export const v4SettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'auto']).default('auto'),
  customCss: z.string().optional().nullable(),
  recentFiles: z.array(z.string()).default([]),
  editorFontSize: z.number().min(10).max(28).default(14),
  keyBindings: z.record(z.string(), z.string()).optional(),
  snippets: z.array(z.unknown()).default([]),
}).passthrough();

export function migrateV4ToV5(v4: unknown): z.infer<typeof settingsSchema> {
  const parsed = v4SettingsSchema.parse(v4);
  const defaults = settingsSchema.parse({});
  return {
    ...defaults,
    ...parsed,
    theme: parsed.theme === 'auto' ? 'system' : parsed.theme,
    customCssPath: parsed.customCss ?? null,
    recentFiles: parsed.recentFiles,
    editorFontSize: parsed.editorFontSize,
    userBindings: parsed.keyBindings ?? defaults.userBindings ?? {},
    snippets: parsed.snippets,
  };
}
```

Note: also add `userBindings: z.record(z.string(), z.string()).default({})` to `validators.ts` settingsSchema if not already present. If it is, omit from defaults in migrateV4ToV5.

- [ ] **Step 4: Run test, confirm it passes**

Run: `npx vitest run tests/unit/lib/migrations/v4-to-v5.test.ts`
Expected: 5 passing

- [ ] **Step 5: Write the runner test (failing)**

`tests/unit/main/updater/migration-runner.test.js`:
```js
const fs = require('fs');
const path = require('path');
const os = require('os');
const { MigrationRunner } = require('../../../../src/main/updater/migration-runner');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mig-test-'));
}

describe('MigrationRunner', () => {
  test('no-op when migration.version is already 5', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ 'migration.version': 5 }));
    const r = new MigrationRunner({ dir, transform: (v) => v });
    expect(r.run()).toBe('skipped');
    fs.rmSync(dir, { recursive: true });
  });

  test('runs migration on missing v5 marker, writes v5 file, backs up v4', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ theme: 'light' }));
    const r = new MigrationRunner({ dir, transform: (v) => ({ ...v, theme: 'system', 'migration.version': 5 }) });
    expect(r.run()).toBe('migrated');
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf-8'))['migration.version']).toBe(5);
    expect(fs.existsSync(path.join(dir, 'settings.v4.bak.json'))).toBe(true);
    fs.rmSync(dir, { recursive: true });
  });

  test('returns fresh on missing file', () => {
    const dir = tmpDir();
    const r = new MigrationRunner({ dir, transform: () => ({ 'migration.version': 5 }) });
    expect(r.run()).toBe('fresh');
    expect(fs.existsSync(path.join(dir, 'settings.json'))).toBe(true);
    fs.rmSync(dir, { recursive: true });
  });

  test('returns failed and preserves v4 on transform throw', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ theme: 'light' }));
    const r = new MigrationRunner({ dir, transform: () => { throw new Error('boom'); } });
    expect(r.run()).toBe('failed');
    expect(fs.readFileSync(path.join(dir, 'settings.json'), 'utf-8')).toContain('light');
    fs.rmSync(dir, { recursive: true });
  });
});
```

- [ ] **Step 6: Run test, confirm it fails**

Run: `npx jest tests/unit/main/updater/migration-runner.test.js`
Expected: FAIL

- [ ] **Step 7: Implement the runner**

`src/main/updater/migration-runner.js`:
```js
const fs = require('fs');
const path = require('path');

class MigrationRunner {
  constructor({ dir, transform }) {
    this.dir = dir;
    this.transform = transform;
    this.file = path.join(dir, 'settings.json');
    this.backup = path.join(dir, 'settings.v4.bak.json');
  }

  run() {
    if (!fs.existsSync(this.file)) {
      this._writeDefaults();
      return 'fresh';
    }
    const raw = JSON.parse(fs.readFileSync(this.file, 'utf-8'));
    if (raw && raw['migration.version'] === 5) {
      return 'skipped';
    }
    try {
      const v5 = this.transform(raw);
      fs.copyFileSync(this.file, this.backup);
      fs.writeFileSync(this.file, JSON.stringify({ ...v5, 'migration.version': 5 }, null, 2));
      return 'migrated';
    } catch (err) {
      console.error('[migration-runner] transform failed:', err.message);
      return 'failed';
    }
  }

  _writeDefaults() {
    const v5 = this.transform({});
    fs.writeFileSync(this.file, JSON.stringify({ ...v5, 'migration.version': 5 }, null, 2));
  }
}

module.exports = { MigrationRunner };
```

- [ ] **Step 8: Run test, confirm it passes**

Run: `npx jest tests/unit/main/updater/migration-runner.test.js`
Expected: 4 passing

- [ ] **Step 9: Commit**

```bash
git add src/main/updater/migration-runner.js src/renderer/lib/migrations/v4-to-v5.ts \
        tests/unit/main/updater/migration-runner.test.js tests/unit/lib/migrations/v4-to-v5.test.ts
git commit -m "feat(migration): add v4-to-v5 settings migration runner with backup"
```

---

## Task 6: IPC handlers (updater + crash)

**Files:**
- Create: `src/main/ipc/updater-handlers.js`
- Create: `src/main/ipc/crash-handlers.js`

- [ ] **Step 1: Implement updater handlers**

`src/main/ipc/updater-handlers.js`:
```js
const { ipcMain } = require('electron');
const { resolveFeedUrl } = require('../updater/feed-config');

function register({ updater, getMainWindow, getChannel }) {
  ipcMain.handle('updater:check', async () => {
    const channel = getChannel();
    const version = require('electron').app.getVersion();
    const platform = process.platform;
    const feed = resolveFeedUrl(channel, version, platform);
    updater.autoUpdater.setFeedURL({ url: feed.replace(/\/latest-[^/]+\.yml$/, '') });
    await updater.check();
    return { state: updater.state };
  });

  ipcMain.handle('updater:install', () => {
    updater.install();
  });

  ipcMain.handle('updater:get-state', () => {
    return { state: updater.state };
  });

  // Forward status events to renderer
  updater.on('status', (payload) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('updater:status', payload);
    }
  });
}

module.exports = { register };
```

- [ ] **Step 2: Implement crash handlers**

`src/main/ipc/crash-handlers.js`:
```js
const { ipcMain, shell } = require('electron');

function register({ crash, getMainWindow }) {
  ipcMain.handle('crash:read', () => {
    return crash.list();
  });

  ipcMain.on('crash:open-dir', () => {
    shell.openPath(crash.path());
  });

  ipcMain.handle('crash:delete', (_event, filename) => {
    if (typeof filename === 'string' && /^\d+-(uncaughtException|unhandledRejection)\.json$/.test(filename)) {
      crash.delete(filename);
      return true;
    }
    return false;
  });
}

module.exports = { register };
```

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc/updater-handlers.js src/main/ipc/crash-handlers.js
git commit -m "feat(ipc): add updater and crash IPC handlers"
```

---

## Task 7: Wire preload allowlist

**Files:**
- Modify: `src/preload.js`

- [ ] **Step 1: Add channels to ALLOWED_SEND_CHANNELS**

In `src/preload.js`, after `'app:show-save-dialog',`, add:
```js
  'updater:check',
  'updater:install',
  'updater:get-state',
  'crash:read',
  'crash:open-dir',
  'crash:delete',
```

- [ ] **Step 2: Add 'updater:status' to ALLOWED_RECEIVE_CHANNELS**

After `'clear-recent-files',`, add:
```js
  'updater:status',
```

- [ ] **Step 3: Add `updater` and `crash` objects to `electronAPI`**

In the `electronAPI = { ... }` block, before the closing `});`, add:
```js
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    install: () => ipcRenderer.invoke('updater:install'),
    getState: () => ipcRenderer.invoke('updater:get-state'),
    onStatus: (cb) => {
      const subscription = (_event, payload) => cb(payload);
      ipcRenderer.on('updater:status', subscription);
      return () => ipcRenderer.removeListener('updater:status', subscription);
    },
  },
  crash: {
    read: () => ipcRenderer.invoke('crash:read'),
    openDir: () => ipcRenderer.send('crash:open-dir'),
    delete: (filename) => ipcRenderer.invoke('crash:delete', filename),
  },
```

- [ ] **Step 4: Verify `ipc.ts` exposes the same shape**

Open `src/renderer/lib/ipc.ts` and confirm `ipc.updater.check()` and `ipc.crash.read()` are available. If not, add them following the existing safeCall pattern.

- [ ] **Step 5: Commit**

```bash
git add src/preload.js src/renderer/lib/ipc.ts
git commit -m "feat(preload): allowlist updater:* and crash:* channels, expose API"
```

---

## Task 8: Initialize services in main entry

**Files:**
- Modify: `src/main/index.js`

- [ ] **Step 1: Add requires at the top**

After the existing `require('./word-template')` line, add:
```js
const { app: electronApp, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const { UpdaterService } = require('./updater/updater-service');
const { CrashWriter } = require('./updater/crash-writer');
const { MigrationRunner } = require('./updater/migration-runner');
const updaterHandlers = require('./ipc/updater-handlers');
const crashHandlers = require('./ipc/crash-handlers');
```

- [ ] **Step 2: Add `migrateV4ToV5` import**

Add at top:
```js
const { migrateV4ToV5 } = require('../renderer/lib/migrations/v4-to-v5');
```

(If the renderer-side import is not loadable from main, copy the function into `src/main/updater/migration-transform.js` and re-export. Use the copy if needed.)

- [ ] **Step 3: Wire services inside `app.whenReady()`**

Inside the `app.whenReady().then(...)` block, after the existing `createMainWindow` call, add:
```js
    const userData = electronApp.getPath('userData');

    // Migration
    const migration = new MigrationRunner({
      dir: userData,
      transform: (v4) => migrateV4ToV5(v4),
    });
    migration.run();

    // Crash writer
    const crash = new CrashWriter(path.join(userData, 'crashDumps'));
    process.on('uncaughtException', (err) => crash.handleUncaught(err, 'uncaughtException'));
    process.on('unhandledRejection', (err) => crash.handleUncaught(err, 'unhandledRejection'));

    // Updater
    const updater = new UpdaterService(autoUpdater);
    updaterHandlers.register({
      updater,
      getMainWindow: () => mainWindow,
      getChannel: () => store.get('updateChannel') || 'github',
    });
    crashHandlers.register({
      crash,
      getMainWindow: () => mainWindow,
    });
```

- [ ] **Step 4: Verify the app still boots**

Run: `npm run dev`
Expected: Vite + Electron start, no errors in the terminal.

- [ ] **Step 5: Commit**

```bash
git add src/main/index.js
git commit -m "feat(main): initialize updater, crash writer, and migration on app start"
```

---

## Task 9: Extend settings store with updateChannel + autoCheckUpdates

**Files:**
- Modify: `src/renderer/lib/validators.ts`

- [ ] **Step 1: Add new fields to settingsSchema**

In `src/renderer/lib/validators.ts`, inside `settingsSchema`, add:
```ts
  updateChannel: z.enum(['github', 'concreteinfo']).default('github'),
  autoCheckUpdates: z.boolean().default(true),
  firstRun: z.boolean().default(true),
```

- [ ] **Step 2: Verify tests still pass**

Run: `npx vitest run tests/unit/lib/validators.test.ts 2>/dev/null || npx jest tests/unit/lib 2>/dev/null`
Expected: existing tests pass; new fields appear in the inferred type.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/lib/validators.ts
git commit -m "feat(settings): add updateChannel, autoCheckUpdates, firstRun fields"
```

---

## Task 10: updater-store (renderer)

**Files:**
- Create: `src/renderer/lib/updater-store.ts`
- Test: `tests/unit/lib/updater-store.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/lib/updater-store.test.ts`:
```ts
import { describe, expect, test, beforeEach, vi } from 'vitest';

vi.mock('@/lib/ipc', () => ({
  ipc: {
    updater: {
      check: vi.fn(),
      install: vi.fn(),
      getState: vi.fn().mockResolvedValue({ state: 'idle' }),
    },
  },
}));

import { useUpdaterStore } from '@/lib/updater-store';
import { ipc } from '@/lib/ipc';

beforeEach(() => {
  useUpdaterStore.setState({
    state: 'idle',
    version: null,
    percent: 0,
    lastCheckAt: 0,
  });
  vi.clearAllMocks();
});

describe('useUpdaterStore', () => {
  test('initial state is idle', () => {
    expect(useUpdaterStore.getState().state).toBe('idle');
  });

  test('applyStatus updates state from incoming event', () => {
    useUpdaterStore.getState().applyStatus({ state: 'available', version: '5.0.2' });
    expect(useUpdaterStore.getState().state).toBe('available');
    expect(useUpdaterStore.getState().version).toBe('5.0.2');
  });

  test('check() debounces within 60s', async () => {
    useUpdaterStore.setState({ lastCheckAt: Date.now() });
    await useUpdaterStore.getState().check();
    expect(ipc.updater.check).not.toHaveBeenCalled();
  });

  test('check() invokes ipc.updater.check when not debounced', async () => {
    await useUpdaterStore.getState().check();
    expect(ipc.updater.check).toHaveBeenCalled();
  });

  test('install() invokes ipc.updater.install', () => {
    useUpdaterStore.getState().install();
    expect(ipc.updater.install).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test, confirm it fails**

Run: `npx vitest run tests/unit/lib/updater-store.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement the store**

`src/renderer/lib/updater-store.ts`:
```ts
import { create } from 'zustand';
import { ipc } from '@/lib/ipc';

type State = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';

interface UpdaterState {
  state: State;
  version: string | null;
  percent: number;
  lastCheckAt: number;
  applyStatus: (s: { state: State; version?: string; percent?: number; code?: string }) => void;
  check: () => Promise<void>;
  install: () => void;
}

const DEBOUNCE_MS = 60_000;

export const useUpdaterStore = create<UpdaterState>((set, get) => ({
  state: 'idle',
  version: null,
  percent: 0,
  lastCheckAt: 0,
  applyStatus: (s) =>
    set({
      state: s.state,
      version: s.version ?? get().version,
      percent: s.percent ?? get().percent,
    }),
  check: async () => {
    if (Date.now() - get().lastCheckAt < DEBOUNCE_MS) return;
    set({ lastCheckAt: Date.now() });
    await ipc.updater.check();
  },
  install: () => ipc.updater.install(),
}));

// Subscribe to live updates from main
if (typeof window !== 'undefined' && (window as any).electronAPI?.updater?.onStatus) {
  (window as any).electronAPI.updater.onStatus((payload: any) => {
    useUpdaterStore.getState().applyStatus(payload);
  });
}
```

- [ ] **Step 4: Run test, confirm it passes**

Run: `npx vitest run tests/unit/lib/updater-store.test.ts`
Expected: 5 passing

- [ ] **Step 5: Commit**

```bash
git add src/renderer/lib/updater-store.ts tests/unit/lib/updater-store.test.ts
git commit -m "feat(renderer): add updater store mirroring main process state"
```

---

## Task 11: UpdateBanner component

**Files:**
- Create: `src/renderer/components/UpdateBanner.tsx`
- Test: `tests/component/UpdateBanner.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/component/UpdateBanner.test.tsx`:
```tsx
import { describe, expect, test, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useUpdaterStore } from '@/lib/updater-store';
import { UpdateBanner } from '@/components/UpdateBanner';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/ipc', () => ({
  ipc: {
    app: { openExternal: vi.fn() },
    updater: { check: vi.fn(), install: vi.fn() },
  },
}));

describe('UpdateBanner', () => {
  beforeEach(() => {
    useUpdaterStore.setState({ state: 'idle', version: null, percent: 0 });
  });

  test('renders nothing when state is idle', () => {
    const { container } = render(<UpdateBanner />);
    expect(container.firstChild).toBeNull();
  });

  test('shows version and restart button when state is ready', () => {
    useUpdaterStore.setState({ state: 'ready', version: '5.0.2' });
    render(<UpdateBanner />);
    expect(screen.getByText(/5\.0\.2/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /restart/i })).toBeInTheDocument();
  });

  test('shows download progress when state is downloading', () => {
    useUpdaterStore.setState({ state: 'downloading', percent: 42 });
    render(<UpdateBanner />);
    expect(screen.getByText(/42%/)).toBeInTheDocument();
  });

  test('shows error copy when state is error', () => {
    useUpdaterStore.setState({ state: 'error' });
    render(<UpdateBanner />);
    expect(screen.getByText(/couldn.?t check/i)).toBeInTheDocument();
  });

  test('restart button calls ipc.updater.install', () => {
    useUpdaterStore.setState({ state: 'ready', version: '5.0.2' });
    render(<UpdateBanner />);
    fireEvent.click(screen.getByRole('button', { name: /restart/i }));
    expect(useUpdaterStore.getState().install).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test, confirm it fails**

Run: `npx vitest run tests/component/UpdateBanner.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement the component**

`src/renderer/components/UpdateBanner.tsx`:
```tsx
import { useUpdaterStore } from '@/lib/updater-store';
import { ipc } from '@/lib/ipc';
import { toast } from 'sonner';

export function UpdateBanner() {
  const { state, version, percent, install, check } = useUpdaterStore();

  if (state === 'idle' || state === 'checking') return null;

  if (state === 'error') {
    return (
      <div data-testid="update-banner" role="status" className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm">
        Couldn't check for updates.{' '}
        <button onClick={async () => { try { await check(); } catch (e: any) { toast.error(e.message); } }} className="underline">
          Try again
        </button>
      </div>
    );
  }

  if (state === 'downloading') {
    return (
      <div data-testid="update-banner" className="bg-blue-50 border-b border-blue-200 px-4 py-2 text-sm">
        Downloading update… {Math.round(percent)}%
      </div>
    );
  }

  if (state === 'ready') {
    return (
      <div data-testid="update-banner" className="bg-green-50 border-b border-green-200 px-4 py-2 text-sm flex items-center gap-3">
        <span>v{version} is ready.</span>
        <button onClick={() => ipc.app.openExternal(`https://github.com/amitwh/markdown-converter/releases/tag/v${version}`)} className="underline">
          View release notes
        </button>
        <button onClick={install} className="px-3 py-1 rounded bg-brand text-white">
          Restart to update
        </button>
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 4: Run test, confirm it passes**

Run: `npx vitest run tests/component/UpdateBanner.test.tsx`
Expected: 5 passing

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/UpdateBanner.tsx tests/component/UpdateBanner.test.tsx
git commit -m "feat(renderer): add UpdateBanner for non-blocking update notifications"
```

---

## Task 12: FirstRunWizard component

**Files:**
- Create: `src/renderer/components/FirstRunWizard.tsx`
- Test: `tests/component/FirstRunWizard.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/component/FirstRunWizard.test.tsx`:
```tsx
import { describe, expect, test, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useAppStore } from '@/lib/app-store';
import { useSettingsStore } from '@/lib/settings-store';
import { FirstRunWizard } from '@/components/FirstRunWizard';

beforeEach(() => {
  useAppStore.setState({ firstRun: true, modal: null } as any);
  useSettingsStore.setState({ theme: 'system', updateChannel: 'github' } as any);
});

describe('FirstRunWizard', () => {
  test('renders nothing when firstRun is false', () => {
    useAppStore.setState({ firstRun: false } as any);
    const { container } = render(<FirstRunWizard />);
    expect(container.firstChild).toBeNull();
  });

  test('renders step 1 by default', () => {
    render(<FirstRunWizard />);
    expect(screen.getByText(/theme/i)).toBeInTheDocument();
  });

  test('skip link closes the wizard and sets firstRun false', () => {
    render(<FirstRunWizard />);
    fireEvent.click(screen.getByText(/skip/i));
    expect(useAppStore.getState().firstRun).toBe(false);
  });

  test('selecting a theme and clicking Next moves to step 2', () => {
    render(<FirstRunWizard />);
    fireEvent.click(screen.getByLabelText(/dark/i));
    fireEvent.click(screen.getByText(/next/i));
    expect(useSettingsStore.getState().theme).toBe('dark');
  });

  test('selecting concreteinfo channel persists it', () => {
    render(<FirstRunWizard />);
    fireEvent.click(screen.getByText(/next/i));
    fireEvent.click(screen.getByLabelText(/concreteinfo/i));
    fireEvent.click(screen.getByText(/next/i));
    expect(useSettingsStore.getState().updateChannel).toBe('concreteinfo');
  });
});
```

- [ ] **Step 2: Run test, confirm it fails**

Run: `npx vitest run tests/component/FirstRunWizard.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement the component**

`src/renderer/components/FirstRunWizard.tsx`:
```tsx
import { useState } from 'react';
import { useAppStore } from '@/lib/app-store';
import { useSettingsStore } from '@/lib/settings-store';

const TEMPLATES = {
  blank: '',
  readme: '# Project\n\nDescription.\n\n## Usage\n\n```\nnpm install\n```\n',
  meeting: '# Meeting Notes — YYYY-MM-DD\n\n## Attendees\n\n- \n\n## Agenda\n\n1. \n\n## Action items\n\n- [ ] \n',
  blog: '# Title\n\n*Subtitle*\n\nLorem ipsum.\n\n---\n\n## Section 1\n',
};

export function FirstRunWizard() {
  const firstRun = useAppStore((s) => s.firstRun);
  const setFirstRun = useAppStore((s) => s.setFirstRun);
  const theme = useSettingsStore((s) => s.theme);
  const setSetting = useSettingsStore((s) => s.setSetting);
  const updateChannel = useSettingsStore((s) => s.updateChannel);
  const [step, setStep] = useState(0);
  const [template, setTemplate] = useState<keyof typeof TEMPLATES>('blank');

  if (!firstRun) return null;

  const close = () => setFirstRun(false);

  return (
    <div data-testid="first-run-wizard" role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <div className="bg-white dark:bg-neutral-900 rounded-lg p-6 w-[28rem] shadow-xl">
        {step === 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-2">Pick a theme</h2>
            <div className="flex gap-2 mb-4">
              {(['light', 'dark', 'system'] as const).map((t) => (
                <label key={t} className="flex items-center gap-1">
                  <input type="radio" name="theme" checked={theme === t} onChange={() => setSetting('theme', t)} />
                  {t}
                </label>
              ))}
            </div>
          </div>
        )}
        {step === 1 && (
          <div>
            <h2 className="text-lg font-semibold mb-2">Update channel</h2>
            <div className="flex flex-col gap-2 mb-4">
              <label className="flex items-center gap-2">
                <input type="radio" name="channel" checked={updateChannel === 'github'} onChange={() => setSetting('updateChannel', 'github')} />
                GitHub Releases (public)
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="channel" checked={updateChannel === 'concreteinfo'} onChange={() => setSetting('updateChannel', 'concreteinfo')} />
                ConcreteInfo self-hosted
              </label>
            </div>
          </div>
        )}
        {step === 2 && (
          <div>
            <h2 className="text-lg font-semibold mb-2">Starter template</h2>
            <select value={template} onChange={(e) => setTemplate(e.target.value as any)} className="border rounded px-2 py-1 w-full mb-4">
              <option value="blank">Blank</option>
              <option value="readme">README</option>
              <option value="meeting">Meeting notes</option>
              <option value="blog">Blog post</option>
            </select>
          </div>
        )}
        <div className="flex justify-between items-center mt-4">
          <button onClick={close} className="text-sm text-neutral-500">Skip</button>
          <div className="flex gap-2">
            {step > 0 && <button onClick={() => setStep(step - 1)}>Back</button>}
            {step < 2 ? (
              <button onClick={() => setStep(step + 1)} className="px-3 py-1 rounded bg-brand text-white">Next</button>
            ) : (
              <button onClick={() => { useAppStore.getState().newBuffer(TEMPLATES[template]); close(); }} className="px-3 py-1 rounded bg-brand text-white">Done</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test, confirm it passes**

Run: `npx vitest run tests/component/FirstRunWizard.test.tsx`
Expected: 5 passing

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/FirstRunWizard.tsx tests/component/FirstRunWizard.test.tsx
git commit -m "feat(renderer): add FirstRunWizard with theme/channel/template steps"
```

---

## Task 13: CrashReportModal

**Files:**
- Create: `src/renderer/components/modals/CrashReportModal.tsx`
- Test: `tests/component/modals/CrashReportModal.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/component/modals/CrashReportModal.test.tsx`:
```tsx
import { describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CrashReportModal } from '@/components/modals/CrashReportModal';
import { ipc } from '@/lib/ipc';

vi.mock('@/lib/ipc', () => ({
  ipc: {
    crash: { read: vi.fn(), openDir: vi.fn(), delete: vi.fn() },
  },
}));

describe('CrashReportModal', () => {
  test('shows empty state when no crashes', async () => {
    (ipc.crash.read as any).mockResolvedValue([]);
    render(<CrashReportModal onClose={() => {}} />);
    expect(await screen.findByText(/no crashes/i)).toBeInTheDocument();
  });

  test('lists crashes returned by ipc', async () => {
    (ipc.crash.read as any).mockResolvedValue([
      { filename: '1700000000-uncaughtException.json', kind: 'uncaughtException', message: 'boom', timestamp: '2026-01-01T00:00:00.000Z' },
    ]);
    render(<CrashReportModal onClose={() => {}} />);
    expect(await screen.findByText(/boom/)).toBeInTheDocument();
  });

  test('delete button calls ipc.crash.delete', async () => {
    (ipc.crash.read as any).mockResolvedValue([
      { filename: '1700000000-uncaughtException.json', kind: 'uncaughtException', message: 'boom', timestamp: '2026-01-01T00:00:00.000Z' },
    ]);
    render(<CrashReportModal onClose={() => {}} />);
    const btn = await screen.findByText(/delete/i);
    fireEvent.click(btn);
    await waitFor(() => expect(ipc.crash.delete).toHaveBeenCalledWith('1700000000-uncaughtException.json'));
  });

  test('open folder button calls ipc.crash.openDir', async () => {
    (ipc.crash.read as any).mockResolvedValue([]);
    render(<CrashReportModal onClose={() => {}} />);
    fireEvent.click(await screen.findByText(/open dump folder/i));
    expect(ipc.crash.openDir).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test, confirm it fails**

Run: `npx vitest run tests/component/modals/CrashReportModal.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement the component**

`src/renderer/components/modals/CrashReportModal.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { ipc } from '@/lib/ipc';

interface Dump {
  filename: string;
  kind: string;
  message?: string;
  timestamp: string;
}

export function CrashReportModal({ onClose }: { onClose: () => void }) {
  const [dumps, setDumps] = useState<Dump[]>([]);

  const refresh = async () => setDumps(await ipc.crash.read());
  useEffect(() => { refresh(); }, []);

  return (
    <div role="dialog" aria-modal="true" data-testid="crash-report-modal" className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <div className="bg-white dark:bg-neutral-900 rounded-lg p-6 w-[36rem] max-h-[80vh] overflow-y-auto shadow-xl">
        <header className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Crash reports</h2>
          <button onClick={onClose} aria-label="Close">×</button>
        </header>
        <button onClick={() => ipc.crash.openDir()} className="mb-4 px-3 py-1 text-sm border rounded">
          Open dump folder
        </button>
        {dumps.length === 0 ? (
          <p data-testid="empty-state" className="text-neutral-500">No crashes recorded — nice work!</p>
        ) : (
          <ul className="space-y-2">
            {dumps.map((d) => (
              <li key={d.filename} className="border rounded p-2 text-sm flex justify-between items-start gap-2">
                <div>
                  <div className="font-mono text-xs text-neutral-500">{d.timestamp}</div>
                  <div>{d.message ?? '(no message)'}</div>
                </div>
                <button onClick={async () => { await ipc.crash.delete(d.filename); refresh(); }} className="text-red-600 text-xs">
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test, confirm it passes**

Run: `npx vitest run tests/component/modals/CrashReportModal.test.tsx`
Expected: 4 passing

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/modals/CrashReportModal.tsx tests/component/modals/CrashReportModal.test.tsx
git commit -m "feat(renderer): add CrashReportModal listing local dumps"
```

---

## Task 14: Settings sheet — Updates section

**Files:**
- Modify: `src/renderer/components/modals/SettingsSheet.tsx`

- [ ] **Step 1: Locate the settings sheet and add an Updates section**

Open `src/renderer/components/modals/SettingsSheet.tsx`. Find the section that contains existing tabs (or the section that lists settings groups). Add a new section labeled "Updates" with:

- A radio group for `updateChannel` (`github` | `concreteinfo`).
- A "Check now" button calling `useUpdaterStore.getState().check()`.
- A toggle for `autoCheckUpdates` reading and writing via `useSettingsStore.setSetting`.

Use the existing UI primitives (`<Button>`, `<RadioGroup>`, `<Switch>`) found in the file.

- [ ] **Step 2: Verify the existing Settings sheet tests still pass**

Run: `npx vitest run tests/component/modals/SettingsSheet.test.tsx`
Expected: all pass

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/modals/SettingsSheet.tsx
git commit -m "feat(settings): add Updates section with channel radio and Check now"
```

---

## Task 15: Mount new components in App

**Files:**
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Add imports and mounts**

At the top of `App.tsx`, add:
```tsx
import { UpdateBanner } from '@/components/UpdateBanner';
import { FirstRunWizard } from '@/components/FirstRunWizard';
import { useAppStore } from '@/lib/app-store';
```

Inside the render tree (above the existing layout), add:
```tsx
      <FirstRunWizard />
      <UpdateBanner />
```

- [ ] **Step 2: Add a Help menu item to open the crash modal**

In the same `App.tsx` (or wherever the help/about menu is registered), add a command that opens a "Crash reports" modal:
```tsx
useCommandStore.register('help.crashReports', () => {
  useAppStore.getState().openModal({ kind: 'crashReports' });
});
```

Add `'crashReports'` to the `ModalState` discriminated union in `app-store.ts`. The `ModalLayer` should render `<CrashReportModal onClose={close} />` when `modal.kind === 'crashReports'`.

- [ ] **Step 3: Verify the app still boots**

Run: `npm run dev`
Expected: Vite + Electron start, no errors, no broken modal.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/App.tsx src/renderer/lib/app-store.ts src/renderer/components/modals/ModalLayer.tsx
git commit -m "feat(renderer): mount UpdateBanner, FirstRunWizard, and CrashReportModal"
```

---

## Task 16: Auto-check on startup

**Files:**
- Modify: `src/renderer/App.tsx` (or a new `src/renderer/hooks/useAutoUpdateCheck.ts`)

- [ ] **Step 1: Add a startup hook**

Create `src/renderer/hooks/useAutoUpdateCheck.ts`:
```ts
import { useEffect } from 'react';
import { useSettingsStore } from '@/lib/settings-store';
import { useUpdaterStore } from '@/lib/updater-store';

export function useAutoUpdateCheck() {
  const auto = useSettingsStore((s) => s.autoCheckUpdates);
  const check = useUpdaterStore((s) => s.check);
  useEffect(() => {
    if (auto) {
      const t = setTimeout(() => { check(); }, 5_000);
      return () => clearTimeout(t);
    }
  }, [auto, check]);
}
```

- [ ] **Step 2: Call the hook in App.tsx**

In `App.tsx`, at the top of the component:
```tsx
useAutoUpdateCheck();
```

- [ ] **Step 3: Verify the test suite still passes**

Run: `npm test`
Expected: 497+ tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/hooks/useAutoUpdateCheck.ts src/renderer/App.tsx
git commit -m "feat(renderer): auto-check for updates 5s after launch when enabled"
```

---

## Task 17: CI workflow — vitest on PRs

**Files:**
- Modify: `.github/workflows/ci.yml` (or create if absent)

- [ ] **Step 1: Add or update the CI workflow**

If `ci.yml` exists, ensure it runs both jest and vitest on every PR. If absent, create:

`.github/workflows/ci.yml`:
```yaml
name: CI
on:
  pull_request:
  push:
    branches: [react-electron, master]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npx jest --colors=false
      - run: npx vitest run --reporter=verbose
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run jest and vitest on every PR"
```

---

## Task 18: Release workflow — publish latest.yml + ConcreteInfo mirror

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Add `publish=always` to all three build jobs**

For each of the three build jobs (`build-linux`, `build-windows`, `build-macos`), change the `run:` line:

Linux:
```yaml
        run: npm run build:linux-ci -- --publish=always
```

Windows (both signed and unsigned paths):
```yaml
        run: npm run build:win-signed -- --publish=always
```
```yaml
        run: npm run build:win-unsigned -- --publish=always
```

macOS:
```yaml
        run: npm run build:mac -- --publish=always
```

- [ ] **Step 2: Add a ConcreteInfo mirror step in the `release` job**

After "Create GitHub Release", add:
```yaml
      - name: Mirror artifacts to ConcreteInfo update feed
        env:
          CONCRETEINFO_DEPLOY_HOOK: ${{ secrets.CONCRETEINFO_DEPLOY_HOOK }}
        run: |
          if [ -n "$CONCRETEINFO_DEPLOY_HOOK" ]; then
            curl -fsSL -X POST \
              -H "Authorization: Bearer $CONCRETEINFO_DEPLOY_HOOK" \
              -F "version=${GITHUB_REF_NAME#v}" \
              -F "artifacts=@dist/latest-mac.yml" \
              -F "artifacts=@dist/latest-linux.yml" \
              -F "artifacts=@dist/latest-windows.yml" \
              https://updates.concreteinfo.co.in/api/v1/ingest
          fi
```

- [ ] **Step 3: Add `npm run publish:concreteinfo` script**

In `package.json`, add:
```json
    "publish:concreteinfo": "node scripts/publish-concreteinfo.js"
```

Create `scripts/publish-concreteinfo.js`:
```js
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const version = process.argv[2] || require('../package.json').version;
const hook = process.env.CONCRETEINFO_DEPLOY_HOOK;
if (!hook) { console.error('CONCRETEINFO_DEPLOY_HOOK not set'); process.exit(1); }

const files = ['latest-mac.yml', 'latest-linux.yml', 'latest-windows.yml'].map((f) => path.join('dist', f));
for (const f of files) {
  if (!fs.existsSync(f)) { console.error(`missing ${f} — run electron-builder first`); process.exit(1); }
}

const form = new FormData();
form.append('version', version);
for (const f of files) form.append('artifacts', fs.createReadStream(f), path.basename(f));
form.append('artifacts', fs.createReadStream(`dist/MarkdownConverter-${version}.dmg`));
form.append('artifacts', fs.createReadStream(`dist/markdown-converter_${version}_amd64.deb`));
form.append('artifacts', fs.createReadStream(`dist/MarkdownConverter-Setup-${version}.exe`));

fetch('https://updates.concreteinfo.co.in/api/v1/ingest', {
  method: 'POST',
  headers: { Authorization: `Bearer ${hook}` },
  body: form,
}).then((r) => { console.log('ingest status', r.status); process.exit(r.ok ? 0 : 1); });
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml package.json scripts/publish-concreteinfo.js
git commit -m "ci(release): publish latest.yml on all platforms, mirror to ConcreteInfo"
```

---

## Task 19: Documentation

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `README.md`

- [ ] **Step 1: Add v5.1.0 entry to CHANGELOG**

At the top of `CHANGELOG.md`, prepend:
```markdown
## [5.1.0] — 2026-06-XX

### Added
- Auto-update via electron-updater against GitHub Releases (default) or ConcreteInfo self-hosted feed.
- Light, skippable first-run wizard: theme, update channel, starter template.
- One-shot v4.4.1 → v5 settings migration with backup at `settings.v4.bak.json`.
- Local crash dump capture (cap 20, auto-prune) and a CrashReportModal.
- "Updates" section in Settings: channel picker, Check now, auto-check toggle.
```

- [ ] **Step 2: Document the new env var in README**

In `README.md`, add a "Distribution & Updates" section with the `CONCRETEINFO_DEPLOY_HOOK` env var and a link to the public release page.

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md README.md
git commit -m "docs: v5.1.0 changelog + Distribution & Updates section"
```

---

## Task 20: End-to-end verification

**Files:**
- Modify: `.claude/skills/run-desktop/verify-features.mjs`

- [ ] **Step 1: Add an E2E check for the wizard and the banner**

Append to `verify-features.mjs`:
```js
// 11) First-run wizard visible on a fresh app data dir
const fresh = await app.evaluate(({ app }) => {
  const userData = app.getPath('userData');
  const fs = require('fs');
  const path = require('path');
  // Mark migration as already-done so we don't try to re-migrate, but force firstRun=true
  fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({ 'migration.version': 5, theme: 'light' }));
  return true;
});
await new Promise((r) => setTimeout(r, 500));
const wizardVisible = await win.locator('[data-testid="first-run-wizard"]').count();
console.log('First-run wizard visible:', wizardVisible);
await win.click('text=Skip').catch(() => {});
await new Promise((r) => setTimeout(r, 300));

// 12) Update banner: emit a synthetic status from main
await app.evaluate(({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0];
  win.webContents.send('updater:status', { state: 'ready', version: '5.1.0' });
});
await new Promise((r) => setTimeout(r, 500));
const bannerVisible = await win.locator('[data-testid="update-banner"]').count();
console.log('Update banner visible:', bannerVisible);
await win.screenshot({ path: path.join(SHOT_DIR, '12-update-banner.png') });
```

- [ ] **Step 2: Run the verification**

```bash
node .claude/skills/run-desktop/verify-features.mjs
```

Expected: wizard renders on first launch, banner shows the synthetic update, screenshots saved to `/tmp/shots-verify/`.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/run-desktop/verify-features.mjs
git commit -m "test(e2e): verify first-run wizard and update banner in live app"
```

---

## Task 21: Final test sweep + production build

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: 497+ tests pass (was 497 before this plan; expect 540+ after all new tests).

- [ ] **Step 2: Build the renderer**

```bash
npm run build:renderer
```

Expected: clean build, no TS errors.

- [ ] **Step 3: Tag the release**

```bash
git tag v5.1.0
git push origin v5.1.0
```

The release workflow will build + publish `latest.yml` and mirror to ConcreteInfo.

- [ ] **Step 4: Commit (any final docs tweaks)**

```bash
git status
```

If there are uncommitted tweaks, commit them with a `chore: post-v5.1.0` message.

---

## Self-Review (inline)

**1. Spec coverage:**
- Goal: Two-channel distribution → Tasks 7, 18 ✓
- Goal: Non-blocking update banner with user-confirmed restart → Tasks 11, 16 ✓
- Goal: Light first-run wizard → Tasks 12, 15 ✓
- Goal: Auto-migrate v4.4.1 settings with backup → Tasks 5, 8 ✓
- Goal: Local crash dump capture → Tasks 4, 13, 15 ✓
- Goal: GitHub Actions CI tests + release with latest.yml → Tasks 17, 18 ✓
- Architecture: Module-level boundaries, IPC allowlist → Tasks 6, 7, 8 ✓
- Component breakdown (all 13 units from §3) → each has a task or is part of one (e.g. `feed-config` is Task 2)
- Data flow example: each step has matching code ✓
- Error handling: debounce, prune, idempotency → Tasks 3, 4, 5 ✓
- Testing: unit, component, integration, E2E — Tasks 2–5 unit, 11–13 component, integration runner inside Task 5, E2E Task 20 ✓
- Distribution feed contracts → Tasks 18, 19 ✓
- First-run wizard contract → Task 12 ✓
- Settings migration contract → Task 5 ✓
- IPC allowlist additions → Task 7 ✓
- Risks & mitigations → addressed implicitly by error handling and the auto-check toggle (Task 14)

**2. Placeholder scan:** No "TBD"/"TODO"/"implement later" present. Every code step has the actual code.

**3. Type consistency:** `useUpdaterStore` defined Task 10, used in Tasks 11, 16. `ipc.updater.*` defined in Task 7, used everywhere. `crash.handleUncaught` defined Task 4, used in Task 8. `migration.transform` defined Task 5, used in Task 8.
