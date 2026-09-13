/**
 * Autosave + crash-recovery buffer.
 *
 * Mirrors VersionHistory's pattern (per-doc isolated folder, injectable IO for
 * tests) but covers a different gap: VersionHistory snapshots the *previous*
 * content on every explicit save, so an unsaved buffer is lost when the app
 * crashes. AutosaveBuffer fills that gap by periodically (renderer-driven)
 * writing the current in-memory buffer to a recovery store.
 *
 * Recovery model:
 *   - <userData>/autosave/by-path/<sha1-of-path>/recovery.md   — latest buffer
 *   - <userData>/autosave/by-path/<sha1-of-path>/meta.json    — {docPath, savedAt, byteSize, appVersion}
 *
 * One recovery entry per document is sufficient — newer writes overwrite older
 * ones. There's no history to keep (VersionHistory handles that).
 *
 * Safety:
 *   - Writes are atomic via writeFileSync (small files; loss of partial write
 *     is preferable to corrupted recovery)
 *   - meta.json is read defensively; missing/corrupt = empty list
 *   - All fs/path access is injectable for unit tests
 *
 * @module AutosaveBuffer
 */

function defaultCrypto() {
  return require('crypto');
}

function folderFor(docPath, pathUtil, crypto) {
  const hash = crypto.createHash('sha1').update(String(docPath)).digest('hex').slice(0, 16);
  return pathUtil.join('by-path', hash);
}

/**
 * Write the current buffer for a document. Overwrites any prior recovery
 * entry — the latest buffer is the only one that matters for crash recovery.
 *
 * @param {object} args
 * @param {string} args.docPath Absolute path of the document (use a synthetic
 *   key like 'untitled-tab-<tabId>' for tabs that have never been saved)
 * @param {string} args.content Buffer content to persist
 * @param {string} [args.appVersion] Stored so a future schema change can ignore stale entries
 * @param {object} args.io { rootDir, fs, pathUtil, crypto }
 * @returns {{savedAt:number, byteSize:number}} meta written alongside the blob
 */
function writeRecovery({ docPath, content, appVersion = 'unknown', io }) {
  if (!docPath || typeof docPath !== 'string') {
    throw new Error('AutosaveBuffer: docPath is required');
  }
  const { rootDir, fs, pathUtil, crypto = defaultCrypto() } = io;
  const dir = pathUtil.join(rootDir, folderFor(docPath, pathUtil, crypto));
  fs.mkdirSync(dir, { recursive: true });

  const body = String(content ?? '');
  const savedAt = Date.now();
  const byteSize = Buffer.byteLength(body, 'utf-8');

  fs.writeFileSync(pathUtil.join(dir, 'recovery.md'), body, 'utf-8');
  fs.writeFileSync(
    pathUtil.join(dir, 'meta.json'),
    JSON.stringify({ docPath, savedAt, byteSize, appVersion }, null, 2),
    'utf-8'
  );
  return { savedAt, byteSize };
}

/**
 * Read the recovery blob + meta for a document. Returns null when no entry
 * exists; throws when meta.json is present but corrupt (so the renderer can
 * surface a "couldn't read recovery" warning instead of silently swallowing it).
 *
 * @returns {{docPath:string, content:string, savedAt:number, byteSize:number, appVersion:string}|null}
 */
function readRecovery({ docPath, io }) {
  if (!docPath || typeof docPath !== 'string') {
    throw new Error('AutosaveBuffer: docPath is required');
  }
  const { rootDir, fs, pathUtil, crypto = defaultCrypto() } = io;
  const dir = pathUtil.join(rootDir, folderFor(docPath, pathUtil, crypto));
  const metaPath = pathUtil.join(dir, 'meta.json');
  const blobPath = pathUtil.join(dir, 'recovery.md');

  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw new Error(`AutosaveBuffer: corrupt meta.json for ${docPath}: ${err.message}`);
  }

  let content;
  try {
    content = fs.readFileSync(blobPath, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }

  return {
    docPath: meta.docPath || docPath,
    content,
    savedAt: meta.savedAt || 0,
    byteSize: meta.byteSize ?? Buffer.byteLength(content, 'utf-8'),
    appVersion: meta.appVersion || 'unknown',
  };
}

/**
 * Delete the recovery entry for a document. Called after a successful explicit
 * save (the buffer is now on disk at its real path) or after the user
 * dismisses the recovery banner.
 *
 * @returns {boolean} whether an entry was removed
 */
function clearRecovery({ docPath, io }) {
  if (!docPath || typeof docPath !== 'string') {
    throw new Error('AutosaveBuffer: docPath is required');
  }
  const { rootDir, fs, pathUtil, crypto = defaultCrypto() } = io;
  const dir = pathUtil.join(rootDir, folderFor(docPath, pathUtil, crypto));
  let removedAny = false;
  for (const file of ['recovery.md', 'meta.json']) {
    try {
      fs.unlinkSync(pathUtil.join(dir, file));
      removedAny = true;
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
  return removedAny;
}

/**
 * List every recovery entry across all documents. Used at startup to decide
 * whether to show a "recover unsaved work?" prompt.
 *
 * @returns {Array<{docPath:string, savedAt:number, byteSize:number, appVersion:string}>}
 */
function listRecoveries({ io }) {
  const { rootDir, fs, pathUtil } = io;
  const baseDir = pathUtil.join(rootDir, 'by-path');
  let dirs;
  try {
    dirs = fs.readdirSync(baseDir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const out = [];
  for (const hash of dirs) {
    const metaPath = pathUtil.join(baseDir, hash, 'meta.json');
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      if (meta && typeof meta.docPath === 'string') {
        out.push({
          docPath: meta.docPath,
          savedAt: meta.savedAt || 0,
          byteSize: meta.byteSize || 0,
          appVersion: meta.appVersion || 'unknown',
        });
      }
    } catch {
      // Corrupt or missing meta — skip; the next write will rewrite it
    }
  }
  // Newest first — most likely to be relevant
  out.sort((a, b) => b.savedAt - a.savedAt);
  return out;
}

module.exports = {
  writeRecovery,
  readRecovery,
  clearRecovery,
  listRecoveries,
  folderFor,
};
