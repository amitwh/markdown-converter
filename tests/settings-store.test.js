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
