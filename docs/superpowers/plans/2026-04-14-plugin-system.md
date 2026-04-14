# Plugin System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight plugin registry that allows built-in (and future third-party) plugins to register sidebar panels, commands, status bar indicators, settings, and export hooks through a unified context API.

**Architecture:** PluginLoader discovers manifests, PluginRegistry validates and stores them, PluginContext provides scoped API to each plugin. Plugins activate lazily — sidebar panels don't execute until clicked. All plugin handlers are wrapped for crash safety. Existing SidebarManager, CommandPalette, and status bar are extended, not replaced.

**Tech Stack:** Electron, electron-store (simple JSON store already in main.js), Node.js require() for plugin loading.

**Spec:** `docs/superpowers/specs/2026-04-14-v5-platform-design.md` — Section 1: Plugin System

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/plugins/plugin-api.js` | Base class with default no-op implementations for all extension points |
| `src/plugins/plugin-loader.js` | Discovers and validates manifest.json files from built-in + user directories |
| `src/plugins/plugin-registry.js` | Stores loaded plugins, manages lifecycle (init/activate/deactivate), wraps handlers in try/catch |
| `src/plugins/plugin-context.js` | Builds scoped context API for each plugin (sidebar, commands, statusBar, settings, editor, events, exports, ipc) |
| `src/plugins/event-bus.js` | Typed event emitter with versioned payloads, `hasHandler()` for cross-plugin capability checks |
| `src/plugins/settings-store.js` | Plugin-scoped settings using the existing main.js JSON store via IPC |
| `src/plugins/built-in/_sample/manifest.json` | Empty sample manifest documenting the schema |
| `src/plugins/built-in/_sample/index.js` | Minimal plugin that logs init — proves the system works |
| `tests/plugin-loader.test.js` | Tests for manifest discovery and validation |
| `tests/plugin-registry.test.js` | Tests for registration, lifecycle, crash safety |
| `tests/plugin-context.test.js` | Tests for scoped API surface |
| `tests/event-bus.test.js` | Tests for event emission, versioned payloads, hasHandler |

---

## Chunk 1: Event Bus

The event bus has zero dependencies on other plugin files. Everything else uses it.

### Task 1: EventBus class

**Files:**
- Create: `src/plugins/event-bus.js`
- Test: `tests/event-bus.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/event-bus.test.js
const { EventBus } = require('../src/plugins/event-bus');

describe('EventBus', () => {
  let bus;

  beforeEach(() => {
    bus = new EventBus();
  });

  test('on/emit — listener receives payload', () => {
    const received = [];
    bus.on('document:saved', (payload) => received.push(payload));
    bus.emit('document:saved', { filePath: '/test.md', tabId: 'tab1' });
    expect(received).toEqual([{ filePath: '/test.md', tabId: 'tab1' }]);
  });

  test('on — ignores events with no listeners', () => {
    expect(() => bus.emit('unknown:event', {})).not.toThrow();
  });

  test('off — removes specific listener', () => {
    const handler = jest.fn();
    bus.on('test:event', handler);
    bus.off('test:event', handler);
    bus.emit('test:event', {});
    expect(handler).not.toHaveBeenCalled();
  });

  test('off — removes all listeners for event when no handler given', () => {
    const h1 = jest.fn();
    const h2 = jest.fn();
    bus.on('test:event', h1);
    bus.on('test:event', h2);
    bus.off('test:event');
    bus.emit('test:event', {});
    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });

  test('hasHandler — returns true when listener exists', () => {
    bus.on('ai:analyze', () => {});
    expect(bus.hasHandler('ai:analyze')).toBe(true);
  });

  test('hasHandler — returns false when no listener exists', () => {
    expect(bus.hasHandler('ai:analyze')).toBe(false);
  });

  test('handler errors are caught and logged, not thrown', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    bus.on('bad:event', () => { throw new Error('boom'); });
    expect(() => bus.emit('bad:event', {})).not.toThrow();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test('multiple listeners all receive the event', () => {
    const results = [];
    bus.on('multi:event', () => results.push('a'));
    bus.on('multi:event', () => results.push('b'));
    bus.emit('multi:event', {});
    expect(results).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/event-bus.test.js --no-cache`
Expected: FAIL — cannot find module `../src/plugins/event-bus`

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/plugins/event-bus.js
class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(handler);
  }

  off(event, handler) {
    if (!handler) {
      this.listeners.delete(event);
      return;
    }
    const handlers = this.listeners.get(event);
    if (handlers) {
      const idx = handlers.indexOf(handler);
      if (idx !== -1) handlers.splice(idx, 1);
    }
  }

  emit(event, payload) {
    const handlers = this.listeners.get(event);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[EventBus] Error in handler for "${event}":`, err);
      }
    }
  }

  hasHandler(event) {
    const handlers = this.listeners.get(event);
    return handlers != null && handlers.length > 0;
  }
}

module.exports = { EventBus };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/event-bus.test.js --no-cache`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/plugins/event-bus.js tests/event-bus.test.js
git commit -m "feat(plugins): add EventBus with typed events and crash-safe handlers"
```

---

## Chunk 2: Plugin API Base Class + Manifest Schema

### Task 2: PluginAPI base class

**Files:**
- Create: `src/plugins/plugin-api.js`
- Test: `tests/plugin-api.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/plugin-api.test.js
const { PluginAPI } = require('../src/plugins/plugin-api');

describe('PluginAPI', () => {
  test('has default no-op lifecycle methods', () => {
    const plugin = new PluginAPI();
    expect(() => plugin.init({})).not.toThrow();
    expect(() => plugin.activate()).not.toThrow();
    expect(() => plugin.deactivate()).not.toThrow();
  });

  test('getManifest returns null by default', () => {
    const plugin = new PluginAPI();
    expect(plugin.getManifest()).toBeNull();
  });

  test('subclass can override init', () => {
    let called = false;
    class MyPlugin extends PluginAPI {
      init(context) {
        called = true;
        this.context = context;
      }
    }
    const p = new MyPlugin();
    p.init({ foo: 'bar' });
    expect(called).toBe(true);
    expect(p.context.foo).toBe('bar');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/plugin-api.test.js --no-cache`
Expected: FAIL — cannot find module

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/plugins/plugin-api.js
class PluginAPI {
  /**
   * Called when the plugin is discovered and loaded.
   * Receives a scoped context object with APIs.
   * @param {object} context - Plugin context (sidebar, commands, settings, etc.)
   */
  init(context) {
    this.context = context;
  }

  /** Called when the plugin is activated (e.g., sidebar panel clicked). */
  activate() {}

  /** Called when the plugin is deactivated. */
  deactivate() {}

  /** Returns the parsed manifest.json for this plugin. */
  getManifest() {
    return null;
  }
}

module.exports = { PluginAPI };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/plugin-api.test.js --no-cache`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/plugins/plugin-api.js tests/plugin-api.test.js
git commit -m "feat(plugins): add PluginAPI base class with no-op lifecycle"
```

---

## Chunk 3: Plugin Loader + Manifest Validation

### Task 3: PluginLoader discovers and validates manifests

**Files:**
- Create: `src/plugins/plugin-loader.js`
- Test: `tests/plugin-loader.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/plugin-loader.test.js
const path = require('path');
const fs = require('fs');
const os = require('os');
const { PluginLoader } = require('../src/plugins/plugin-loader');

describe('PluginLoader', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function writeManifest(dir, manifest) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  }

  test('discoverPlugins — finds manifests in built-in directory', () => {
    const pluginDir = path.join(tempDir, 'my-plugin');
    writeManifest(pluginDir, {
      id: 'my-plugin',
      name: 'My Plugin',
      version: '1.0.0',
      description: 'Test'
    });
    const loader = new PluginLoader([pluginDir]);
    const plugins = loader.discoverPlugins();
    expect(plugins).toHaveLength(1);
    expect(plugins[0].id).toBe('my-plugin');
  });

  test('discoverPlugins — skips directories without manifest.json', () => {
    const emptyDir = path.join(tempDir, 'no-manifest');
    fs.mkdirSync(emptyDir, { recursive: true });
    const loader = new PluginLoader([emptyDir]);
    const plugins = loader.discoverPlugins();
    expect(plugins).toHaveLength(0);
  });

  test('validateManifest — accepts valid manifest', () => {
    const manifest = {
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
      description: 'A test plugin'
    };
    const loader = new PluginLoader([]);
    expect(loader.validateManifest(manifest)).toBe(true);
  });

  test('validateManifest — rejects manifest missing id', () => {
    const manifest = { name: 'No ID', version: '1.0.0', description: 'x' };
    const loader = new PluginLoader([]);
    expect(() => loader.validateManifest(manifest)).toThrow(/id/);
  });

  test('validateManifest — rejects manifest missing name', () => {
    const manifest = { id: 'test', version: '1.0.0', description: 'x' };
    const loader = new PluginLoader([]);
    expect(() => loader.validateManifest(manifest)).toThrow(/name/);
  });

  test('validateManifest — rejects manifest with duplicate id (already loaded)', () => {
    const loader = new PluginLoader([]);
    loader.loadedIds = new Set(['existing-plugin']);
    expect(() => loader.validateManifest({ id: 'existing-plugin', name: 'Dup', version: '1.0.0', description: 'x' }))
      .toThrow(/duplicate/i);
  });

  test('discoverPlugins — loads index.js if present', () => {
    const pluginDir = path.join(tempDir, 'with-index');
    writeManifest(pluginDir, { id: 'with-index', name: 'With Index', version: '1.0.0', description: 'Test' });
    fs.writeFileSync(path.join(pluginDir, 'index.js'), 'module.exports = { PluginAPI }; const { PluginAPI } = require("../plugin-api"); class P extends PluginAPI {} module.exports = { Plugin: P };');
    const loader = new PluginLoader([pluginDir]);
    const plugins = loader.discoverPlugins();
    expect(plugins[0].PluginClass).toBeDefined();
  });

  test('discoverPlugins — continues if one plugin fails to load', () => {
    const badDir = path.join(tempDir, 'bad');
    writeManifest(badDir, { id: 'bad', name: 'Bad', version: '1.0.0', description: 'Broken' });
    fs.writeFileSync(path.join(badDir, 'index.js'), 'throw new Error("broken");');

    const goodDir = path.join(tempDir, 'good');
    writeManifest(goodDir, { id: 'good', name: 'Good', version: '1.0.0', description: 'Works' });

    const loader = new PluginLoader([badDir, goodDir]);
    const plugins = loader.discoverPlugins();
    expect(plugins).toHaveLength(1);
    expect(plugins[0].id).toBe('good');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/plugin-loader.test.js --no-cache`
Expected: FAIL — cannot find module

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/plugins/plugin-loader.js
const fs = require('fs');
const path = require('path');

class PluginLoader {
  /**
   * @param {string[]} searchDirs - Directories to scan for plugin folders
   */
  constructor(searchDirs = []) {
    this.searchDirs = searchDirs;
    this.loadedIds = new Set();
  }

  /**
   * Discover plugins by scanning searchDirs for manifest.json files.
   * Returns array of { id, name, version, description, manifest, PluginClass, dir }
   */
  discoverPlugins() {
    const plugins = [];
    for (const dir of this.searchDirs) {
      if (!fs.existsSync(dir)) continue;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const pluginDir = path.join(dir, entry.name);
        const manifestPath = path.join(pluginDir, 'manifest.json');
        if (!fs.existsSync(manifestPath)) continue;
        try {
          const raw = fs.readFileSync(manifestPath, 'utf-8');
          const manifest = JSON.parse(raw);
          this.validateManifest(manifest);
          let PluginClass = null;
          const indexPath = path.join(pluginDir, 'index.js');
          if (fs.existsSync(indexPath)) {
            try {
              const loaded = require(indexPath);
              PluginClass = loaded.Plugin || loaded.default || null;
            } catch (err) {
              console.error(`[PluginLoader] Failed to load index.js for "${manifest.id}":`, err.message);
              continue;
            }
          }
          plugins.push({
            id: manifest.id,
            name: manifest.name,
            version: manifest.version,
            description: manifest.description,
            manifest,
            PluginClass,
            dir: pluginDir
          });
          this.loadedIds.add(manifest.id);
        } catch (err) {
          console.error(`[PluginLoader] Skipping plugin in ${pluginDir}:`, err.message);
        }
      }
    }
    return plugins;
  }

  /**
   * Validate a manifest object. Throws on invalid.
   */
  validateManifest(manifest) {
    if (!manifest.id) throw new Error('Manifest missing required field: id');
    if (!manifest.name) throw new Error('Manifest missing required field: name');
    if (!manifest.version) throw new Error('Manifest missing required field: version');
    if (!manifest.description) throw new Error('Manifest missing required field: description');
    if (this.loadedIds.has(manifest.id)) {
      throw new Error(`Duplicate plugin id: "${manifest.id}"`);
    }
    return true;
  }
}

module.exports = { PluginLoader };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/plugin-loader.test.js --no-cache`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/plugins/plugin-loader.js tests/plugin-loader.test.js
git commit -m "feat(plugins): add PluginLoader with manifest discovery and validation"
```

---

## Chunk 4: Plugin Context

### Task 4: PluginContext builds scoped API for each plugin

**Files:**
- Create: `src/plugins/plugin-context.js`
- Test: `tests/plugin-context.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/plugin-context.test.js
const { PluginContext } = require('../src/plugins/plugin-context');
const { EventBus } = require('../src/plugins/event-bus');

describe('PluginContext', () => {
  let context;
  let mockDeps;

  beforeEach(() => {
    mockDeps = {
      pluginId: 'test-plugin',
      sidebar: { registerPanel: jest.fn() },
      commands: { register: jest.fn() },
      statusBar: { registerIndicator: jest.fn() },
      eventBus: new EventBus(),
      settings: { get: jest.fn(), set: jest.fn(), onChanged: jest.fn() },
      editor: { getContent: jest.fn(), getSelection: jest.fn(), insertAtCursor: jest.fn(), onContentChanged: jest.fn() },
      ipc: { invoke: jest.fn(), on: jest.fn() }
    };
    context = new PluginContext(mockDeps);
  });

  test('exposes sidebar.registerPanel', () => {
    const handler = jest.fn();
    context.sidebar.registerPanel('my-panel', { icon: 'test', title: 'Test', render: handler });
    expect(mockDeps.sidebar.registerPanel).toHaveBeenCalledWith('test-plugin:my-panel', { icon: 'test', title: 'Test', render: handler });
  });

  test('exposes commands.register', () => {
    const handler = jest.fn();
    context.commands.register('do-thing', 'Do Thing', handler, 'Ctrl+Alt+T');
    expect(mockDeps.commands.register).toHaveBeenCalledWith('test-plugin:do-thing', 'Do Thing', expect.any(Function), 'Ctrl+Alt+T');
  });

  test('command handler is wrapped in try/catch', () => {
    const badHandler = () => { throw new Error('boom'); };
    context.commands.register('bad-cmd', 'Bad', badHandler);
    const registeredHandler = mockDeps.commands.register.mock.calls[0][2];
    expect(() => registeredHandler()).not.toThrow();
  });

  test('exposes settings.get/set scoped to plugin', () => {
    context.settings.get('myKey');
    context.settings.set('myKey', 'myValue');
    expect(mockDeps.settings.get).toHaveBeenCalledWith('plugins.test-plugin.myKey');
    expect(mockDeps.settings.set).toHaveBeenCalledWith('plugins.test-plugin.myKey', 'myValue');
  });

  test('exposes editor methods', () => {
    context.editor.getContent();
    expect(mockDeps.editor.getContent).toHaveBeenCalled();
    context.editor.getSelection();
    expect(mockDeps.editor.getSelection).toHaveBeenCalled();
  });

  test('exposes events.on and events.emit via event bus', () => {
    const handler = jest.fn();
    context.events.on('test:event', handler);
    context.events.emit('test:event', { data: 1 });
    expect(handler).toHaveBeenCalledWith({ data: 1 });
  });

  test('exposes events.hasHandler', () => {
    expect(context.events.hasHandler('no:such')).toBe(false);
    context.events.on('exists:event', () => {});
    expect(context.events.hasHandler('exists:event')).toBe(true);
  });

  test('exposes ipc.invoke and ipc.on', () => {
    context.ipc.invoke('test:channel', { a: 1 });
    expect(mockDeps.ipc.invoke).toHaveBeenCalledWith('test:channel', { a: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/plugin-context.test.js --no-cache`
Expected: FAIL — cannot find module

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/plugins/plugin-context.js
class PluginContext {
  /**
   * @param {object} deps - Injected dependencies
   * @param {string} deps.pluginId - Plugin's unique ID (for namespacing)
   * @param {object} deps.sidebar - SidebarManager.registerPanel
   * @param {object} deps.commands - CommandPalette.register
   * @param {object} deps.statusBar - StatusBar.registerIndicator
   * @param {object} deps.eventBus - EventBus instance
   * @param {object} deps.settings - { get, set, onChanged }
   * @param {object} deps.editor - { getContent, getSelection, insertAtCursor, onContentChanged }
   * @param {object} deps.ipc - { invoke, on }
   */
  constructor(deps) {
    const { pluginId, sidebar, commands, statusBar, eventBus, settings, editor, ipc } = deps;

    this.sidebar = {
      registerPanel: (id, opts) => sidebar.registerPanel(`${pluginId}:${id}`, opts)
    };

    this.commands = {
      register: (id, label, handler, shortcut) => {
        const safeHandler = (...args) => {
          try {
            handler(...args);
          } catch (err) {
            console.error(`[Plugin:${pluginId}] Command "${id}" error:`, err);
          }
        };
        commands.register(`${pluginId}:${id}`, label, safeHandler, shortcut);
      }
    };

    this.statusBar = {
      registerIndicator: (id, opts) => statusBar.registerIndicator(`${pluginId}:${id}`, opts)
    };

    this.settings = {
      get: (key) => settings.get(`plugins.${pluginId}.${key}`),
      set: (key, value) => settings.set(`plugins.${pluginId}.${key}`, value),
      onChanged: (key, cb) => settings.onChanged(`plugins.${pluginId}.${key}`, cb)
    };

    this.editor = {
      getContent: () => editor.getContent(),
      getSelection: () => editor.getSelection(),
      insertAtCursor: (text) => editor.insertAtCursor(text),
      onContentChanged: (cb) => editor.onContentChanged(cb)
    };

    this.events = {
      on: (event, handler) => eventBus.on(event, handler),
      off: (event, handler) => eventBus.off(event, handler),
      emit: (event, payload) => eventBus.emit(event, payload),
      hasHandler: (event) => eventBus.hasHandler(event)
    };

    this.ipc = {
      invoke: (channel, ...args) => ipc.invoke(channel, ...args),
      on: (channel, handler) => ipc.on(channel, handler)
    };
  }
}

module.exports = { PluginContext };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/plugin-context.test.js --no-cache`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/plugins/plugin-context.js tests/plugin-context.test.js
git commit -m "feat(plugins): add PluginContext with scoped, crash-safe API"
```

---

## Chunk 5: Plugin Registry

### Task 5: PluginRegistry manages plugin lifecycle

**Files:**
- Create: `src/plugins/plugin-registry.js`
- Test: `tests/plugin-registry.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/plugin-registry.test.js
const path = require('path');
const fs = require('fs');
const os = require('os');
const { PluginRegistry } = require('../src/plugins/plugin-registry');
const { PluginAPI } = require('../src/plugins/plugin-api');
const { EventBus } = require('../src/plugins/event-bus');

class TestPlugin extends PluginAPI {
  init(context) { this.initialized = true; this.ctx = context; }
  activate() { this.activated = true; }
  deactivate() { this.deactivated = true; }
}

describe('PluginRegistry', () => {
  let registry;
  let mockDeps;

  beforeEach(() => {
    mockDeps = {
      sidebar: { registerPanel: jest.fn() },
      commands: { register: jest.fn() },
      statusBar: { registerIndicator: jest.fn() },
      eventBus: new EventBus(),
      settings: { get: jest.fn(), set: jest.fn(), onChanged: jest.fn() },
      editor: { getContent: jest.fn(() => ''), getSelection: jest.fn(() => ''), insertAtCursor: jest.fn(), onContentChanged: jest.fn() },
      ipc: { invoke: jest.fn(), on: jest.fn() }
    };
    registry = new PluginRegistry(mockDeps);
  });

  test('register — stores plugin and calls init', () => {
    const plugin = new TestPlugin();
    registry.register({
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      description: 'desc',
      manifest: {},
      PluginClass: TestPlugin,
      dir: '/tmp/test'
    });
    expect(plugin.initialized).toBe(true);
    expect(registry.getPlugin('test')).toBeDefined();
  });

  test('register — works without PluginClass (manifest-only plugin)', () => {
    expect(() => {
      registry.register({
        id: 'manifest-only',
        name: 'Manifest Only',
        version: '1.0.0',
        description: 'desc',
        manifest: {},
        PluginClass: null,
        dir: '/tmp/test'
      });
    }).not.toThrow();
    expect(registry.getPlugin('manifest-only')).toBeDefined();
  });

  test('register — plugin init error does not crash registry', () => {
    class BadPlugin extends PluginAPI {
      init() { throw new Error('init fail'); }
    }
    expect(() => {
      registry.register({
        id: 'bad',
        name: 'Bad',
        version: '1.0.0',
        description: 'desc',
        manifest: {},
        PluginClass: BadPlugin,
        dir: '/tmp/test'
      });
    }).not.toThrow();
    // Plugin should NOT be registered since init failed
    expect(registry.getPlugin('bad')).toBeUndefined();
  });

  test('getPlugin — returns undefined for unknown plugin', () => {
    expect(registry.getPlugin('nope')).toBeUndefined();
  });

  test('getAll — returns all registered plugins', () => {
    registry.register({ id: 'a', name: 'A', version: '1', description: '', manifest: {}, PluginClass: null, dir: '' });
    registry.register({ id: 'b', name: 'B', version: '1', description: '', manifest: {}, PluginClass: null, dir: '' });
    expect(registry.getAll()).toHaveLength(2);
  });

  test('activate — calls activate on plugin instance', () => {
    const plugin = new TestPlugin();
    registry.register({ id: 'test', name: 'Test', version: '1', description: '', manifest: {}, PluginClass: TestPlugin, dir: '' });
    registry.activate('test');
    const instance = registry.getPlugin('test').instance;
    expect(instance.activated).toBe(true);
  });

  test('deactivate — calls deactivate on plugin instance', () => {
    registry.register({ id: 'test', name: 'Test', version: '1', description: '', manifest: {}, PluginClass: TestPlugin, dir: '' });
    registry.deactivate('test');
    const instance = registry.getPlugin('test').instance;
    expect(instance.deactivated).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/plugin-registry.test.js --no-cache`
Expected: FAIL — cannot find module

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/plugins/plugin-registry.js
const { PluginContext } = require('./plugin-context');
const { PluginAPI } = require('./plugin-api');

class PluginRegistry {
  constructor(deps) {
    this.deps = deps;
    this.plugins = new Map();
  }

  /**
   * Register a discovered plugin. Creates instance, builds context, calls init.
   * If init throws, plugin is NOT registered.
   */
  register(pluginInfo) {
    const { id, name, version, description, manifest, PluginClass, dir } = pluginInfo;

    let instance = null;
    if (PluginClass) {
      instance = new PluginClass();
      instance._manifest = manifest;
    } else {
      instance = new PluginAPI();
      instance._manifest = manifest;
    }

    const context = new PluginContext({
      pluginId: id,
      sidebar: this.deps.sidebar,
      commands: this.deps.commands,
      statusBar: this.deps.statusBar,
      eventBus: this.deps.eventBus,
      settings: this.deps.settings,
      editor: this.deps.editor,
      ipc: this.deps.ipc
    });

    try {
      instance.init(context);
    } catch (err) {
      console.error(`[PluginRegistry] Plugin "${id}" init failed:`, err.message);
      return;
    }

    this.plugins.set(id, { id, name, version, description, manifest, instance, dir, context });
    console.log(`[PluginRegistry] Registered plugin: ${name} v${version}`);
  }

  getPlugin(id) {
    return this.plugins.get(id);
  }

  getAll() {
    return Array.from(this.plugins.values());
  }

  activate(id) {
    const plugin = this.plugins.get(id);
    if (plugin?.instance) {
      try {
        plugin.instance.activate();
      } catch (err) {
        console.error(`[PluginRegistry] Plugin "${id}" activate error:`, err.message);
      }
    }
  }

  deactivate(id) {
    const plugin = this.plugins.get(id);
    if (plugin?.instance) {
      try {
        plugin.instance.deactivate();
      } catch (err) {
        console.error(`[PluginRegistry] Plugin "${id}" deactivate error:`, err.message);
      }
    }
  }
}

module.exports = { PluginRegistry };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/plugin-registry.test.js --no-cache`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/plugins/plugin-registry.js tests/plugin-registry.test.js
git commit -m "feat(plugins): add PluginRegistry with lifecycle and crash-safe init"
```

---

## Chunk 6: Settings Store (IPC bridge)

### Task 6: SettingsStore — plugin-scoped settings via IPC

**Files:**
- Create: `src/plugins/settings-store.js`
- Test: `tests/settings-store.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/settings-store.test.js
const { SettingsStore } = require('../src/plugins/settings-store');

describe('SettingsStore', () => {
  let store;
  let data;

  beforeEach(() => {
    data = {};
    store = new SettingsStore({
      get: (key) => data[key],
      set: (key, value) => { data[key] = value; }
    });
  });

  test('get returns value for full key', () => {
    data['plugins.my-plugin.myKey'] = 'myValue';
    expect(store.get('plugins.my-plugin.myKey')).toBe('myValue');
  });

  test('get returns undefined for missing key', () => {
    expect(store.get('plugins.my-plugin.missing')).toBeUndefined();
  });

  test('set stores value', () => {
    store.set('plugins.my-plugin.myKey', 42);
    expect(data['plugins.my-plugin.myKey']).toBe(42);
  });

  test('set overwrites existing value', () => {
    data['plugins.my-plugin.myKey'] = 'old';
    store.set('plugins.my-plugin.myKey', 'new');
    expect(data['plugins.my-plugin.myKey']).toBe('new');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/settings-store.test.js --no-cache`
Expected: FAIL — cannot find module

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/plugins/settings-store.js
class SettingsStore {
  /**
   * @param {object} backend - { get(key), set(key, value) } backed by main process store
   */
  constructor(backend) {
    this.backend = backend;
  }

  get(key) {
    return this.backend.get(key);
  }

  set(key, value) {
    this.backend.set(key, value);
  }

  onChanged(key, callback) {
    // Future: watch for settings changes via IPC
    // For now, settings are read-once. Change notifications will be added when needed.
  }
}

module.exports = { SettingsStore };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/settings-store.test.js --no-cache`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/plugins/settings-store.js tests/settings-store.test.js
git commit -m "feat(plugins): add SettingsStore for plugin-scoped settings"
```

---

## Chunk 6.5: Export Hooks + Settings onChanged

### Task 6.5: Export hooks registration and settings change notifications

**Files:**
- Modify: `src/plugins/plugin-context.js` — add exports API
- Modify: `src/plugins/plugin-registry.js` — store export hooks
- Modify: `src/renderer.js` — call export hooks during export flow
- Test: `tests/plugin-context.test.js` — add export hook test

- [ ] **Step 1: Add exports API to PluginContext test**

Add to `tests/plugin-context.test.js`:
```javascript
test('exposes exports.registerPreHook and registerPostHook', () => {
  const exportHooks = { preHooks: [], postHooks: [] };
  const ctx = new PluginContext({ ...mockDeps, exportHooks });
  const handler = jest.fn();
  ctx.exports.registerPreHook(handler);
  expect(exportHooks.preHooks).toContain(handler);
});
```

- [ ] **Step 2: Add exportHooks to PluginContext constructor**

In `src/plugins/plugin-context.js`, add to constructor deps and expose:
```javascript
this.exports = {
  registerPreHook: (handler) => deps.exportHooks.preHooks.push(handler),
  registerPostHook: (handler) => deps.exportHooks.postHooks.push(handler)
};
```

- [ ] **Step 3: Add exportHooks to PluginRegistry**

In `src/plugins/plugin-registry.js`, initialize and pass to context:
```javascript
constructor(deps) {
  // ...existing...
  this.exportHooks = { preHooks: [], postHooks: [] };
}

// In register(), add to context deps:
const context = new PluginContext({
  // ...existing...
  exportHooks: this.exportHooks
});
```

- [ ] **Step 4: Wire export hooks into export flow**

In `src/renderer.js`, find the export function (search for `export-with-options` IPC send). Before sending the IPC, call pre-hooks. After completion, call post-hooks:

```javascript
// Before export
pluginRegistry.exportHooks.preHooks.forEach(hook => {
  try { hook({ format, filePath }); } catch (e) { console.error('[ExportHook]', e); }
});
```

- [ ] **Step 5: Run all tests**

Run: `npx jest --no-cache`
Expected: All existing + new tests pass

- [ ] **Step 6: Commit**

```bash
git add src/plugins/plugin-context.js src/plugins/plugin-registry.js src/renderer.js tests/plugin-context.test.js
git commit -m "feat(plugins): add export hooks and wire into export flow"
```

**Note on settings onChanged:** The `onChanged` API is deferred. For v5.0 MVP, plugins read settings on init and when their panels are activated. Full change notification requires an IPC watcher in main process — add when a plugin actually needs it.

---

## Chunk 7: Sample Plugin + Integration Wiring

### Task 7: Sample built-in plugin that proves the system works

**Files:**
- Create: `src/plugins/built-in/_sample/manifest.json`
- Create: `src/plugins/built-in/_sample/index.js`

- [ ] **Step 1: Create sample manifest**

```json
{
  "id": "_sample",
  "name": "Sample Plugin",
  "version": "1.0.0",
  "description": "Demonstrates the plugin system. Safe to delete.",
  "icon": "puzzle",
  "extensionPoints": {
    "commands": [
      { "id": "hello", "label": "Sample: Hello World", "shortcut": "" }
    ]
  },
  "settings": []
}
```

- [ ] **Step 2: Create sample plugin implementation**

```javascript
// src/plugins/built-in/_sample/index.js
const { PluginAPI } = require('../../plugin-api');

class SamplePlugin extends PluginAPI {
  init(context) {
    this.context = context;
    context.commands.register('hello', 'Sample: Hello World', () => {
      console.log('[SamplePlugin] Hello from the plugin system!');
    });
  }
}

module.exports = { Plugin: SamplePlugin };
```

- [ ] **Step 3: Commit**

```bash
git add src/plugins/built-in/_sample/
git commit -m "feat(plugins): add sample plugin demonstrating the system"
```

### Task 8: Wire plugin system into renderer.js initialization

**Files:**
- Modify: `src/renderer.js` (around line 1475 where SidebarManager is initialized)
- Modify: `src/main.js` (add IPC handlers for plugin settings)

- [ ] **Step 1: Add plugin initialization function in renderer.js**

Find the section around line 1475 where `sidebarManager` and `commandPalette` are created. After the existing panel registrations (around line 1530), add:

```javascript
// --- Plugin System ---
const { PluginLoader } = require('./plugins/plugin-loader');
const { PluginRegistry } = require('./plugins/plugin-registry');
const { EventBus } = require('./plugins/event-bus');
const { SettingsStore } = require('./plugins/settings-store');
const path = require('path');

const pluginEventBus = new EventBus();
const pluginSettings = new SettingsStore({
  get: (key) => window.electronAPI.invoke('plugin-settings:get', key),
  set: (key, value) => window.electronAPI.invoke('plugin-settings:set', { key, value })
});

const pluginRegistry = new PluginRegistry({
  sidebar: sidebarManager,
  commands: commandPalette,
  statusBar: {
    registerIndicator: (id, opts) => {
      const statusBarRight = document.querySelector('.status-bar-right');
      if (!statusBarRight) return;
      let indicator = document.getElementById(`plugin-indicator-${id}`);
      if (!indicator) {
        indicator = document.createElement('span');
        indicator.className = 'status-item';
        indicator.id = `plugin-indicator-${id}`;
        // Insert before the last separator or at the end
        statusBarRight.appendChild(document.createTextNode('|'));
        statusBarRight.appendChild(indicator);
      }
      if (opts.render) opts.render(indicator);
    }
  },
  eventBus: pluginEventBus,
  settings: pluginSettings,
  editor: {
    getContent: () => tabManager.getCurrentContent(),
    getSelection: () => tabManager.getSelection(),
    insertAtCursor: (text) => tabManager.insertAtCursor(text),
    onContentChanged: (cb) => pluginEventBus.on('document:changed', cb)
  },
  ipc: {
    invoke: (ch, data) => window.electronAPI.invoke(ch, data),
    on: (ch, cb) => window.electronAPI.on(ch, cb)
  }
});

const builtInDir = path.join(__dirname, 'plugins', 'built-in');
const loader = new PluginLoader([builtInDir]);
const discovered = loader.discoverPlugins();
discovered.forEach(p => pluginRegistry.register(p));
console.log(`[Plugins] Loaded ${discovered.length} plugins`);
```

- [ ] **Step 2: Add IPC channels in preload.js**

Add to `ALLOWED_SEND_CHANNELS`:
```javascript
'plugin-settings:get',
'plugin-settings:set',
```

- [ ] **Step 3: Add IPC handlers in main.js**

Find the IPC handler section and add:
```javascript
ipcMain.handle('plugin-settings:get', (event, key) => {
  return store.get(key);
});

ipcMain.handle('plugin-settings:set', (event, { key, value }) => {
  store.set(key, value);
});
```

- [ ] **Step 4: Verify app starts without errors**

Run: `npm start`
Expected: App opens normally, console shows `[Plugins] Loaded X plugins`. All existing features work.

- [ ] **Step 5: Commit**

```bash
git add src/renderer.js src/preload.js src/main.js
git commit -m "feat(plugins): wire plugin system into app initialization"
```

---

## Chunk 8: Run Full Test Suite

### Task 9: Verify all tests pass together

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All existing + new plugin tests pass (no regressions)

- [ ] **Step 2: Run linter**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 3: Manual smoke test**

Run: `npm start`
Verify:
- App opens normally
- All sidebar panels work (Explorer, Git, Snippets, Templates, Outline)
- Command palette opens (Ctrl+Shift+P)
- Existing keyboard shortcuts work
- Console shows plugin system initialized

- [ ] **Step 4: Commit any fixes**
