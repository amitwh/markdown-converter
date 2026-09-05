/**
 * Local document version history ("timemachine lite").
 *
 * Every time a file is saved, the previous on-disk content is snapshotted to
 * <userData>/versions/<hash-of-path>/<timestamp>.md plus a meta.json index.
 * Users browse/restore/diff versions from the History sidebar panel —
 * recovery from a bad edit no longer depends on Git.
 *
 * Design notes:
 *   - Versions store the content that is about to be REPLACED (pre-save), so
 *     the newest version is always the last state before the current one.
 *   - `maxKeep` prunes oldest entries per document (default 20).
 *   - Version ids are `<ms-timestamp>-<suffix>`; strict format validation on
 *     read prevents path traversal via crafted ids.
 *   - All fs/path access is injectable for unit tests.
 *
 * @module VersionHistory
 */

const DEFAULT_MAX_KEEP = 20;

/** Inject a crypto-like object (Node's crypto by default). */
function defaultCrypto() {
  return require('crypto');
}

/**
 * Stable per-document storage folder name: first 16 hex chars of the sha1 of
 * the absolute path. Avoids OS path-length and illegal-character issues.
 */
function folderFor(docPath, pathUtil, crypto) {
  const hash = crypto.createHash('sha1').update(String(docPath)).digest('hex').slice(0, 16);
  return pathUtil.join('by-path', hash);
}

/** Build a fresh version id for "now" (sortable + filesystem-safe). */
function newVersionId(now = Date.now()) {
  return `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Version ids must be strictly alphanumeric-dash to stay inside the folder. */
function isValidVersionId(id) {
  return typeof id === 'string' && /^[a-z0-9-]{6,64}$/.test(id);
}

/**
 * Snapshot one version of a document.
 *
 * @param {object} args
 * @param {string} args.docPath Absolute path of the document
 * @param {string} args.content The content to snapshot
 * @param {string} [args.label='auto-save'] How it was captured
 * @param {number} [args.maxKeep] Prune to this many versions per document
 * @param {object} args.io { rootDir, fs, pathUtil, crypto } — rootDir is the
 *   versions root (main passes <userData>/versions)
 * @returns {{id, createdAt, label, wordCount}} the stored version meta
 */
function saveVersion({ docPath, content, label = 'auto-save', maxKeep = DEFAULT_MAX_KEEP, io }) {
  const { rootDir, fs, pathUtil, crypto = defaultCrypto() } = io;
  const dir = pathUtil.join(rootDir, folderFor(docPath, pathUtil, crypto));
  fs.mkdirSync(dir, { recursive: true });

  const id = newVersionId();
  const createdAt = Date.now();
  const wordCount = String(content || '')
    .split(/\s+/)
    .filter(Boolean).length;

  // meta.json is the index; the .md blob is the content
  const metaPath = pathUtil.join(dir, 'meta.json');
  let meta = { doc: docPath, versions: [] };
  try {
    meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  } catch {
    /* first version for this document */
  }
  if (!Array.isArray(meta.versions)) meta.versions = [];

  const entry = { id, createdAt, label, wordCount };
  meta.versions.unshift(entry);
  // Prune oldest beyond maxKeep (entries are newest-first)
  if (meta.versions.length > maxKeep) {
    for (const removed of meta.versions.slice(maxKeep)) {
      try {
        fs.unlinkSync(pathUtil.join(dir, `${removed.id}.md`));
      } catch {
        /* already gone */
      }
    }
    meta.versions = meta.versions.slice(0, maxKeep);
  }

  fs.writeFileSync(pathUtil.join(dir, `${id}.md`), String(content ?? ''), 'utf-8');
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
  return entry;
}

/**
 * List versions for a document, newest first.
 * @returns {Array<{id, createdAt, label, wordCount}>}
 */
function listVersions({ docPath, io }) {
  const { rootDir, fs, pathUtil, crypto = defaultCrypto() } = io;
  const metaPath = pathUtil.join(rootDir, folderFor(docPath, pathUtil, crypto), 'meta.json');
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    return Array.isArray(meta.versions) ? meta.versions : [];
  } catch {
    return [];
  }
}

/**
 * Read one version's content.
 * @throws when the id is malformed or the version is missing
 */
function readVersion({ docPath, id, io }) {
  if (!isValidVersionId(id)) throw new Error('Invalid version id');
  const { rootDir, fs, pathUtil, crypto = defaultCrypto() } = io;
  const file = pathUtil.join(rootDir, folderFor(docPath, pathUtil, crypto), `${id}.md`);
  return fs.readFileSync(file, 'utf-8');
}

/**
 * Delete one version (also repairs the index if a blob is already gone).
 * @returns {boolean} whether the version was found and removed
 */
function deleteVersion({ docPath, id, io }) {
  if (!isValidVersionId(id)) return false;
  const { rootDir, fs, pathUtil, crypto = defaultCrypto() } = io;
  const dir = pathUtil.join(rootDir, folderFor(docPath, pathUtil, crypto));
  const metaPath = pathUtil.join(dir, 'meta.json');
  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  } catch {
    return false;
  }
  const before = meta.versions?.length || 0;
  meta.versions = (meta.versions || []).filter((v) => v.id !== id);
  if (meta.versions.length === before) return false;
  try {
    fs.unlinkSync(pathUtil.join(dir, `${id}.md`));
  } catch {
    /* blob already missing — index repair is the important part */
  }
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
  return true;
}

module.exports = {
  DEFAULT_MAX_KEEP,
  saveVersion,
  listVersions,
  readVersion,
  deleteVersion,
  newVersionId,
  isValidVersionId,
  folderFor,
};
