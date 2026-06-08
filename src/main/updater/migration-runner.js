const fs = require('fs');
const path = require('path');

class MigrationRunner {
  constructor({ dir, transform }) {
    this.dir = dir;
    this.transform = transform;
    this.file = path.join(dir, 'settings.json');
    this.backup = path.join(dir, 'settings.v4.bak.json');
  }

  run() {
    if (!fs.existsSync(this.file)) {
      this._writeDefaults();
      return 'fresh';
    }
    const raw = JSON.parse(fs.readFileSync(this.file, 'utf-8'));
    if (raw && raw['migration.version'] === 5) {
      return 'skipped';
    }
    try {
      const v5 = this.transform(raw);
      fs.copyFileSync(this.file, this.backup);
      fs.writeFileSync(this.file, JSON.stringify({ ...v5, 'migration.version': 5 }, null, 2));
      return 'migrated';
    } catch (err) {
      console.error('[migration-runner] transform failed:', err.message);
      // Back up the original and write v5 marker so future launches skip migration.
      // Without this, every launch would fail again and the user stays on defaults.
      fs.copyFileSync(this.file, this.backup);
      fs.writeFileSync(this.file, JSON.stringify({ ...raw, 'migration.version': 5 }, null, 2));
      return 'failed';
    }
  }

  _writeDefaults() {
    const v5 = this.transform({});
    fs.writeFileSync(this.file, JSON.stringify({ ...v5, 'migration.version': 5 }, null, 2));
  }
}

module.exports = { MigrationRunner };
