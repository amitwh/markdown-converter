/**
 * Minimal LCS-based line diff for the Document Compare dialog.
 * Textbook dynamic-programming formulation — the app has no diff library and
 * document-sized inputs keep the (n+1) x (m+1) table affordable.
 */

function splitLines(text) {
  if (typeof text !== 'string' || text === '') return [];
  const lines = text.split(/\r?\n/);
  // Editor convention: "a\n" is one line, not a line plus an empty one — drop the
  // trailing split artifact so purely trailing-newline differences stay invisible.
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/**
 * Compare two texts line by line.
 * @param {string} oldText - Original text.
 * @param {string} newText - Revised text.
 * @returns {Array<{type: 'added'|'removed'|'unchanged', text: string}>} Edit script in
 *   reading order; within a change block, removals are emitted before additions.
 */
function computeLineDiff(oldText, newText) {
  const a = splitLines(oldText);
  const b = splitLines(newText);
  const n = a.length;
  const m = b.length;

  // lcs[i][j] = length of the longest common subsequence of a[i..] and b[j..]
  const lcs = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const result = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      result.push({ type: 'unchanged', text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      result.push({ type: 'removed', text: a[i] });
      i++;
    } else {
      result.push({ type: 'added', text: b[j] });
      j++;
    }
  }
  while (i < n) result.push({ type: 'removed', text: a[i++] });
  while (j < m) result.push({ type: 'added', text: b[j++] });
  return result;
}

module.exports = { computeLineDiff };
