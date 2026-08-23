/**
 * FormatRegistry — tracks export formats registered by plugins via
 * `context.formats.registerExportFormat(id, opts)`.
 *
 * Mirrors the simple Map-backed storage pattern used by PluginRegistry
 * (see plugin-registry.js), scoped to a single concern: export format
 * metadata + handler functions rather than whole plugin instances.
 */
class FormatRegistry {
  constructor() {
    this.formats = new Map();
  }

  /**
   * Register (or overwrite) an export format entry.
   * @param {string} id - Fully-namespaced format id, e.g. "writing-studio:sprint-summary"
   * @param {object} opts - { label, extension, handler: async (markdownContent, outputPath, options) => void }
   */
  register(id, opts) {
    this.formats.set(id, opts);
  }

  /**
   * Look up a single registered format entry by its namespaced id.
   * @param {string} id
   * @returns {object|undefined}
   */
  get(id) {
    return this.formats.get(id);
  }

  /**
   * Return all registered formats as an array of { id, ...opts }.
   */
  getAll() {
    return Array.from(this.formats.entries()).map(([id, opts]) => ({ id, ...opts }));
  }
}

module.exports = { FormatRegistry };
