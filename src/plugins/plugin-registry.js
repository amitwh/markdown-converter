const { PluginContext } = require('./plugin-context');
const { PluginAPI } = require('./plugin-api');

class PluginRegistry {
  constructor(deps) {
    this.deps = deps;
    this.plugins = new Map();
    this.exportHooks = { preHooks: [], postHooks: [] };
  }

  /**
   * Register a discovered plugin. Creates instance, builds context, calls init.
   * If init throws, plugin is NOT registered.
   */
  register(pluginInfo) {
    const { id, name, version, description, manifest, PluginClass, dir } = pluginInfo;

    let instance;
    if (PluginClass) {
      instance = new PluginClass();
    } else {
      instance = new PluginAPI();
    }
    instance._manifest = manifest;

    const context = new PluginContext({
      pluginId: id,
      sidebar: this.deps.sidebar,
      commands: this.deps.commands,
      statusBar: this.deps.statusBar,
      eventBus: this.deps.eventBus,
      settings: this.deps.settings,
      editor: this.deps.editor,
      ipc: this.deps.ipc,
      exportHooks: this.exportHooks
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
