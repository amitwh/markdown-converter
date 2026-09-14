/**
 * Daily-note template gallery.
 *
 * The user can keep multiple daily-note skeletons in
 * <userData>/notes/templates/ — each .md file in that directory is one
 * template. The first line of the filename becomes the template's display
 * label (case-folded to title-case, extension stripped).
 *
 * Pure module: takes a `rootDir` and injectable IO so it stays unit-testable.
 *
 * @module DailyNotesTemplates
 */

/** Title-case a name. "morning-pages.md" → "Morning Pages". */
function labelFor(filename) {
  if (typeof filename !== 'string' || filename.length === 0) return '';
  const stem = filename.replace(/\.md$/i, '');
  return stem
    .split(/[-_\s]+/)
    .filter((s) => s.length > 0)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
    .join(' ');
}

/** Read the template files in `dir` (non-recursive). */
function listTemplates({ dir, fs, pathUtil }) {
  if (!dir) return [];
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const out = [];
  for (const name of entries) {
    if (!/\.md$/i.test(name)) continue;
    let content;
    try {
      content = fs.readFileSync(pathUtil.join(dir, name), 'utf-8');
    } catch {
      continue;
    }
    out.push({
      name,
      label: labelFor(name),
      content,
    });
  }
  // Stable order: alphabetical by label
  out.sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  return out;
}

/** Write a new template file. Returns the saved entry. */
function saveTemplate({ dir, name, content, fs, pathUtil }) {
  if (!dir) throw new Error('DailyNotesTemplates: dir is required');
  if (!name || typeof name !== 'string') throw new Error('name is required');
  if (!/\.md$/i.test(name)) name = `${name}.md`;
  fs.mkdirSync(dir, { recursive: true });
  const fullPath = pathUtil.join(dir, name);
  fs.writeFileSync(fullPath, String(content || ''), 'utf-8');
  return { name, label: labelFor(name), content: String(content || '') };
}

/** Delete a template file. Returns true if removed. */
function deleteTemplate({ dir, name, fs, pathUtil }) {
  if (!dir || !name) return false;
  try {
    fs.unlinkSync(pathUtil.join(dir, name));
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

module.exports = {
  labelFor,
  listTemplates,
  saveTemplate,
  deleteTemplate,
};
