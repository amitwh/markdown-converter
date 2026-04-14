class PluginContext {
  /**
   * @param {object} deps - Injected dependencies
   * @param {string} deps.pluginId - Plugin unique ID (for namespacing)
   * @param {object} deps.sidebar - SidebarManager.registerPanel
   * @param {object} deps.commands - CommandPalette.register
   * @param {object} deps.statusBar - StatusBar.registerIndicator
   * @param {object} deps.eventBus - EventBus instance
   * @param {object} deps.settings - { get, set, onChanged }
   * @param {object} deps.editor - { getContent, getSelection, insertAtCursor, onContentChanged }
   * @param {object} deps.ipc - { invoke, on }
   * @param {object} deps.exportHooks - { preHooks: [], postHooks: [] }
   */
  constructor(deps) {
    const { pluginId, sidebar, commands, statusBar, eventBus, settings, editor, ipc, exportHooks } = deps;

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

    this.exports = {
      registerPreHook: (handler) => { if (exportHooks) exportHooks.preHooks.push(handler); },
      registerPostHook: (handler) => { if (exportHooks) exportHooks.postHooks.push(handler); }
    };
  }
}

module.exports = { PluginContext };
