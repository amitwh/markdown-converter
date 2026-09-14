/**
 * Daily notes — Zettelkasten/journal entry helper.
 *
 * Convention: a folder of YYYY-MM-DD.md files (PKM/Obsidian/Logseq style).
 * `pathFor(date, dir)` returns the absolute path for a given date. The
 * template loader returns a starting skeleton the user can fill in; if the
 * file already exists, we return its current content instead (no clobber).
 *
 * Implementation is pure (no fs/IPC coupling) — main.js wires the IO and
 * template path. Tests inject a virtual fs + path util.
 */

const DEFAULT_TEMPLATE_NAME = 'daily.md';

/**
 * Format a Date as YYYY-MM-DD in local time (matches the on-disk filename).
 * Returns 'YYYY-MM-DD' string. Today (no arg) defaults to new Date().
 */
function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Absolute path for the daily note of `date` inside `dir`. Pure.
 */
function pathFor(date, dir, pathUtil) {
  return pathUtil.join(dir, `${dateKey(date)}.md`);
}

/**
 * Read the daily note skeleton. Looks in `templateDir` for a file named
 * `templateName` (default 'daily.md'); if missing, returns a built-in
 * default so the feature works out-of-the-box without setup.
 *
 * Returns the template string with any {date}/{weekday} placeholders
 * substituted.
 */
function loadTemplate({
  date,
  templateDir,
  templateName = DEFAULT_TEMPLATE_NAME,
  fs,
  pathUtil,
  now = new Date(),
}) {
  let body = `# ${dateKey(date)}\n\n## Notes\n\n`;
  if (templateDir && fs) {
    const templatePath = pathUtil.join(templateDir, templateName);
    try {
      body = fs.readFileSync(templatePath, 'utf-8');
    } catch {
      /* fall through to default */
    }
  }
  return body
    .replace(/\{date\}/g, dateKey(date))
    .replace(/\{weekday\}/g, now.toLocaleDateString('en-US', { weekday: 'long' }));
}

/**
 * Open or create the daily note for `date` inside `dir`. Returns
 * { path, content, created: boolean }.
 *
 * Behavior:
 *   - If <dir>/<date>.md exists, return its content (created: false).
 *   - Otherwise load the template, write it, and return it (created: true).
 *
 * Caller (main.js IPC handler) decides what to do with `created` —
 * typically: open in the existing tab if any, else createNewTab.
 */
function openOrCreate({ date, dir, templateDir, fs, pathUtil, now = new Date(), seedContent }) {
  if (!dir) throw new Error('DailyNotes: dir is required');
  fs.mkdirSync(dir, { recursive: true });
  const notePath = pathFor(date, dir, pathUtil);
  let content;
  let created = false;
  try {
    content = fs.readFileSync(notePath, 'utf-8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    // Use the explicit seedContent when provided (e.g. a non-default
    // template chosen via the gallery); otherwise fall back to the
    // template-loader (which honors templateDir + the built-in default).
    content = typeof seedContent === 'string' && seedContent.length > 0
      ? seedContent
      : loadTemplate({ date, templateDir, fs, pathUtil, now });
    fs.writeFileSync(notePath, content, 'utf-8');
    created = true;
  }
  return { path: notePath, content, created };
}

/**
 * List existing daily-note filenames in `dir`, newest first.
 * Returns ['2026-09-13.md', '2026-09-12.md', ...] — only entries that
 * match the YYYY-MM-DD.md shape so a stray readme.md in the folder is
 * ignored.
 */
function listExisting({ dir, fs }) {
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  // Strict-enough date pattern: year-month-day with month 01-12 and day 01-31.
  // We don't enforce real-calendar validity (Feb 30 still matches) — that's
  // the user's problem to fix, not ours to silently drop.
  const pattern = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\.md$/;
  return entries.filter((name) => pattern.test(name)).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

/**
 * Validate a `dir` candidate for daily notes. Used by the IPC handler so a
 * renderer compromise can't point this at /etc or other sensitive paths —
 * any path outside userData/templates is rejected by main.js's existing
 * validatePath() before we get here.
 */
function isValidDir(dir) {
  return typeof dir === 'string' && dir.length > 0 && !dir.includes('\0');
}

module.exports = {
  dateKey,
  pathFor,
  loadTemplate,
  openOrCreate,
  listExisting,
  isValidDir,
  DEFAULT_TEMPLATE_NAME,
};
