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
