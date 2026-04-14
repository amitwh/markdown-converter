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
    registry.register({
      id: 'test', name: 'Test', version: '1.0.0', description: 'desc',
      manifest: {}, PluginClass: TestPlugin, dir: '/tmp/test'
    });
    const entry = registry.getPlugin('test');
    expect(entry).toBeDefined();
    expect(entry.instance.initialized).toBe(true);
  });

  test('register — works without PluginClass', () => {
    registry.register({
      id: 'manifest-only', name: 'Manifest Only', version: '1.0.0', description: 'desc',
      manifest: {}, PluginClass: null, dir: '/tmp/test'
    });
    expect(registry.getPlugin('manifest-only')).toBeDefined();
  });

  test('register — init error does not crash, plugin not registered', () => {
    class BadPlugin extends PluginAPI {
      init() { throw new Error('init fail'); }
    }
    expect(() => {
      registry.register({
        id: 'bad', name: 'Bad', version: '1.0.0', description: 'desc',
        manifest: {}, PluginClass: BadPlugin, dir: '/tmp/test'
      });
    }).not.toThrow();
    expect(registry.getPlugin('bad')).toBeUndefined();
  });

  test('getPlugin — returns undefined for unknown', () => {
    expect(registry.getPlugin('nope')).toBeUndefined();
  });

  test('getAll — returns all registered plugins', () => {
    registry.register({ id: 'a', name: 'A', version: '1', description: '', manifest: {}, PluginClass: null, dir: '' });
    registry.register({ id: 'b', name: 'B', version: '1', description: '', manifest: {}, PluginClass: null, dir: '' });
    expect(registry.getAll()).toHaveLength(2);
  });

  test('activate — calls activate on plugin instance', () => {
    registry.register({ id: 'test', name: 'Test', version: '1', description: '', manifest: {}, PluginClass: TestPlugin, dir: '' });
    registry.activate('test');
    expect(registry.getPlugin('test').instance.activated).toBe(true);
  });

  test('deactivate — calls deactivate on plugin instance', () => {
    registry.register({ id: 'test', name: 'Test', version: '1', description: '', manifest: {}, PluginClass: TestPlugin, dir: '' });
    registry.deactivate('test');
    expect(registry.getPlugin('test').instance.deactivated).toBe(true);
  });

  test('exportHooks are available and populated', () => {
    registry.register({ id: 'test', name: 'Test', version: '1', description: '', manifest: {}, PluginClass: TestPlugin, dir: '' });
    const handler = jest.fn();
    registry.getPlugin('test').instance.ctx.exports.registerPreHook(handler);
    expect(registry.exportHooks.preHooks).toContain(handler);
  });
});
