/**
 * CodeMirror 6 smart-paste extension.
 *
 * When the pasted text is a single URL (or a URL surrounded only by
 * whitespace), intercept it and ask the main process for the page title
 * via the `url-title:fetch` IPC channel. Replace the paste with a
 * markdown link "[Title](url)" if a title is found, or leave the URL
 * untouched if the fetch fails or returns no title.
 *
 * Other paste content passes through unchanged — we never want to mangle
 * a multi-line paste just because one token looks URL-ish.
 *
 * @param {object} deps
 * @param {(args:{url:string,timeoutMs?:number}) => Promise<{url:string,title:string}|null>} deps.fetchTitle
 * @returns {import('@codemirror/view').Extension}
 */
const { EditorView } = require('@codemirror/view');
const { csvToTable, looksLikeCsv } = require('../utils/csv-to-table');

const URL_ONLY_RE = /^\s*(https?:\/\/[^\s]+)\s*$/i;
const TIMEOUT_MS = 4000;

function smartPaste(deps) {
  const { fetchTitle } = deps || {};
  if (typeof fetchTitle !== 'function') {
    // No-op extension if no IPC bridge was passed in
    return [];
  }
  return EditorView.domEventHandlers({
    paste(event, view) {
      const text = event.clipboardData && event.clipboardData.getData('text/plain');
      if (!text) return;

      // CSV/TSV flavor first — it's instant and self-contained (no async).
      if (looksLikeCsv(text)) {
        event.preventDefault();
        const table = csvToTable(text);
        if (!table) return;
        const head = view.state.selection.main.head;
        view.dispatch({
          changes: { from: head, insert: table },
          selection: { anchor: head + table.length },
        });
        return;
      }

      // URL flavor — paste the URL immediately, then rewrite with the title.
      const urlMatch = URL_ONLY_RE.exec(text);
      if (!urlMatch) return; // not our department — let the default handler run

      const url = urlMatch[1];
      event.preventDefault();
      const head = view.state.selection.main.head;
      const from = head;

      view.dispatch({
        changes: { from, insert: url },
        selection: { anchor: from + url.length },
      });

      Promise.race([
        fetchTitle({ url, timeoutMs: TIMEOUT_MS }),
        new Promise((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
      ])
        .then((result) => {
          if (!result || !result.title) return;
          const currentLen = view.state.doc.length;
          const rewriteTo = Math.min(from + url.length, currentLen);
          if (rewriteTo <= from) return;
          const replacement = `[${result.title}](${url})`;
          view.dispatch({
            changes: { from, to: rewriteTo, insert: replacement },
            selection: { anchor: from + replacement.length },
          });
        })
        .catch(() => {
          /* leave URL as-is */
        });
    },
  });
}

module.exports = { smartPaste, URL_ONLY_RE };