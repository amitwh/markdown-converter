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
