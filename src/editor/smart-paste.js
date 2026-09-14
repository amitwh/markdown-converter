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
      const match = text && URL_ONLY_RE.exec(text);
      if (!match) return; // not a URL-only paste — let the default handler run

      const url = match[1];
      event.preventDefault();

      // Insert the URL immediately so the paste isn't lost on slow networks,
      // then async-fetch the title and rewrite the just-pasted range.
      const head = view.state.selection.main.head;
      const from = head;

      view.dispatch({
        changes: { from, insert: url },
        selection: { anchor: from + url.length },
      });

      // Best-effort fetch; if it fails, leave the URL as-is.
      Promise.race([
        fetchTitle({ url, timeoutMs: TIMEOUT_MS }),
        new Promise((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
      ])
        .then((result) => {
          if (!result || !result.title) return;
          // The user may have continued typing in the meantime. Cap the
          // rewrite at the original insertion length so we don't clobber
          // anything else.
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