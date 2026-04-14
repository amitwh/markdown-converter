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
    const loader = new PluginLoader([tempDir]);
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

  test('validateManifest — rejects manifest with duplicate id', () => {
    const loader = new PluginLoader([]);
    loader.loadedIds = new Set(['existing-plugin']);
    expect(() => loader.validateManifest({ id: 'existing-plugin', name: 'Dup', version: '1.0.0', description: 'x' }))
      .toThrow(/duplicate/i);
  });

  test('discoverPlugins — loads index.js Plugin export if present', () => {
    const pluginDir = path.join(tempDir, 'with-index');
    writeManifest(pluginDir, { id: 'with-index', name: 'With Index', version: '1.0.0', description: 'Test' });
    // Write a simple index.js with a Plugin export
    fs.writeFileSync(path.join(pluginDir, 'index.js'), `
class SimplePlugin { init() {} }
module.exports = { Plugin: SimplePlugin };
`);
    const loader = new PluginLoader([tempDir]);
    const plugins = loader.discoverPlugins();
    expect(plugins).toHaveLength(1);
    expect(plugins[0].PluginClass).toBeDefined();
    expect(plugins[0].PluginClass.name).toBe('SimplePlugin');
  });

  test('discoverPlugins — continues if one plugin fails to load', () => {
    const badDir = path.join(tempDir, 'bad');
    writeManifest(badDir, { id: 'bad', name: 'Bad', version: '1.0.0', description: 'Broken' });
    fs.writeFileSync(path.join(badDir, 'index.js'), 'throw new Error("broken");');

    const goodDir = path.join(tempDir, 'good');
    writeManifest(goodDir, { id: 'good', name: 'Good', version: '1.0.0', description: 'Works' });

    const loader = new PluginLoader([tempDir]);
    const plugins = loader.discoverPlugins();
    expect(plugins).toHaveLength(1);
    expect(plugins[0].id).toBe('good');
  });
});
