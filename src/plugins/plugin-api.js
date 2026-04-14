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
    return this._manifest || null;
  }
}

module.exports = { PluginAPI };
