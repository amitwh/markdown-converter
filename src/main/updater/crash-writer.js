const fs = require('fs');
const path = require('path');
const MAX_DUMPS = 20;

class CrashWriter {
  constructor(dir) {
    this.dir = dir;
    this._counter = 0;
    fs.mkdirSync(dir, { recursive: true });
  }

  handleUncaught(err, kind) {
    try {
      const filename = `${Date.now()}-${++this._counter}-${kind}.json`;
      const payload = {
        kind,
        message: err && err.message,
        stack: err && err.stack,
        timestamp: new Date().toISOString(),
      };
      fs.writeFileSync(path.join(this.dir, filename), JSON.stringify(payload, null, 2));
      this._prune();
    } catch (writeErr) {
      console.error('[crash-writer] dump write failed:', writeErr.message);
    }
  }

  _prune() {
    const files = fs.readdirSync(this.dir).sort();
    while (files.length > MAX_DUMPS) {
      const oldest = files.shift();
      try {
        fs.unlinkSync(path.join(this.dir, oldest));
      } catch (_unlinkErr) {
        /* ignore */
      }
    }
  }

  list() {
    if (!fs.existsSync(this.dir)) return [];
    return fs
      .readdirSync(this.dir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse()
      .map((filename) => {
        const full = path.join(this.dir, filename);
        const data = JSON.parse(fs.readFileSync(full, 'utf-8'));
        return { filename, ...data };
      });
  }

  delete(filename) {
    const full = path.join(this.dir, filename);
    if (fs.existsSync(full)) fs.unlinkSync(full);
  }

  path() {
    return this.dir;
  }
}

module.exports = { CrashWriter };
