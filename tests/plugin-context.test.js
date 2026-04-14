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
      ipc: { invoke: jest.fn(), on: jest.fn() },
      exportHooks: { preHooks: [], postHooks: [] }
    };
    context = new PluginContext(mockDeps);
  });

  test('exposes sidebar.registerPanel with namespaced id', () => {
    const handler = jest.fn();
    context.sidebar.registerPanel('my-panel', { icon: 'test', title: 'Test', render: handler });
    expect(mockDeps.sidebar.registerPanel).toHaveBeenCalledWith('test-plugin:my-panel', { icon: 'test', title: 'Test', render: handler });
  });

  test('exposes commands.register with crash-safe wrapper', () => {
    const badHandler = () => { throw new Error('boom'); };
    context.commands.register('bad-cmd', 'Bad', badHandler, 'Ctrl+Alt+T');
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
    context.editor.getSelection();
    expect(mockDeps.editor.getContent).toHaveBeenCalled();
    expect(mockDeps.editor.getSelection).toHaveBeenCalled();
  });

  test('exposes events via event bus', () => {
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

  test('exposes ipc.invoke', () => {
    context.ipc.invoke('test:channel', { a: 1 });
    expect(mockDeps.ipc.invoke).toHaveBeenCalledWith('test:channel', { a: 1 });
  });

  test('exposes exports.registerPreHook', () => {
    const handler = jest.fn();
    context.exports.registerPreHook(handler);
    expect(mockDeps.exportHooks.preHooks).toContain(handler);
  });

  test('exposes exports.registerPostHook', () => {
    const handler = jest.fn();
    context.exports.registerPostHook(handler);
    expect(mockDeps.exportHooks.postHooks).toContain(handler);
  });
});
