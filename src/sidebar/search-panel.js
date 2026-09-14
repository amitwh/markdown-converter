/**
 * Sidebar panel: workspace content search + doc-aware Q&A.
 *
 * Two modes, one input box:
 *   - Search mode (default): enter a query, get ranked file hits. The query
 *     grammar is parsed on the main process (WorkspaceSearch); the renderer
 *     just displays what comes back.
 *   - Ask mode: prefix with "?" (or click the Ask toggle) to switch to
 *     chunk-level Q&A. Grammar noise (what/how/why/...) is stripped before
 *     ranking, and the response surfaces individual passages instead of
 *     whole-file hits.
 *
 * Click a result to open the file (and optionally jump to the chunk offset
 * for Q&A hits). The dir defaults to the same folder the Explorer is
 * looking at; the user can override.
 *
 * @param {HTMLElement} container Mount point inside the sidebar panel
 * @param {object} deps
 * @param {(args:{query,dir,limit}) => Promise<Array>} deps.search
 * @param {(args:{question,dir,topK}) => Promise<{question,chunks}>} deps.ask
 * @param {() => string|null} deps.getCurrentDir
 * @param {(filePath:string, offset?:number) => void} deps.onOpenFile
 */

function renderSearchPanel(container, { search, ask, getCurrentDir, onOpenFile }) {
  let mode = 'search'; // 'search' | 'ask'
  let lastResults = [];

  container.innerHTML = `
    <div class="search-panel">
      <div class="search-toolbar">
        <div class="search-mode-toggle" role="tablist">
          <button class="search-mode-btn active" data-mode="search" role="tab">Search</button>
          <button class="search-mode-btn" data-mode="ask" role="tab">Ask</button>
        </div>
      </div>
      <div class="search-input-row">
        <input type="text" class="search-input" id="search-input"
          placeholder="Search notes — try: rust #lang @project-x &quot;exact phrase&quot;"
          autocomplete="off">
        <button class="search-run-btn" id="search-run" title="Run (Enter)">&#x1F50D;</button>
      </div>
      <div class="search-dir-row">
        <input type="text" class="search-dir" id="search-dir"
          placeholder="Folder (defaults to current)"
          value="" readonly>
        <button class="search-clear-btn" id="search-clear" title="Clear results">Clear</button>
      </div>
      <div class="search-status" id="search-status"></div>
      <div class="search-results" id="search-results"></div>
    </div>
  `;

  const inputEl = container.querySelector('#search-input');
  const runBtn = container.querySelector('#search-run');
  const dirEl = container.querySelector('#search-dir');
  const clearBtn = container.querySelector('#search-clear');
  const statusEl = container.querySelector('#search-status');
  const resultsEl = container.querySelector('#search-results');
  const modeBtns = container.querySelectorAll('.search-mode-btn');

  // Seed the dir from the explorer when the panel first opens
  const initialDir = getCurrentDir && getCurrentDir();
  if (initialDir) dirEl.value = initialDir;
  else dirEl.placeholder = 'Folder (none — open one in Explorer first)';

  function setMode(next) {
    mode = next;
    modeBtns.forEach((b) => b.classList.toggle('active', b.dataset.mode === next));
    inputEl.placeholder =
      next === 'search'
        ? 'Search notes — try: rust #lang @project-x "exact phrase"'
        : 'Ask a question — try: what did I write about rust async';
  }

  modeBtns.forEach((b) => {
    b.addEventListener('click', () => {
      setMode(b.dataset.mode);
      inputEl.focus();
    });
  });

  function setStatus(text, kind = 'info') {
    if (!statusEl) return;
    statusEl.textContent = text || '';
    statusEl.dataset.kind = kind;
  }

  function basename(p) {
    if (typeof p !== 'string') return '';
    return p.split(/[/\\]/).pop() || p;
  }

  function escapeHtml(s) {
    return String(s).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  }

  function renderResults(items) {
    if (!resultsEl) return;
    if (!items || items.length === 0) {
      resultsEl.innerHTML = '<div class="search-empty">No matches.</div>';
      return;
    }
    resultsEl.innerHTML = items
      .map((r, i) => {
        const tagList = (r.matchedTags || []).map((t) => `#${t}`).join(' ');
        const linkList = (r.matchedLinks || []).map((l) => `[[${l}]]`).join(' ');
        const tagsHtml = tagList
          ? `<div class="search-result-tags">${escapeHtml(tagList)}</div>`
          : '';
        const linksHtml = linkList
          ? `<div class="search-result-links">${escapeHtml(linkList)}</div>`
          : '';
        const meta = [
          r.score !== undefined ? `score ${Number(r.score).toFixed(1)}` : '',
          r.offset ? `+${r.offset}` : '',
          r.matchedTerms && r.matchedTerms.length ? r.matchedTerms.join(', ') : '',
        ]
          .filter(Boolean)
          .join(' · ');
        return `
          <div class="search-result" data-idx="${i}" role="button" tabindex="0">
            <div class="search-result-name">${escapeHtml(basename(r.filePath))}</div>
            <div class="search-result-path">${escapeHtml(r.filePath)}</div>
            <div class="search-result-snippet">${escapeHtml(r.snippet || '')}</div>
            ${tagsHtml}${linksHtml}
            <div class="search-result-meta">${escapeHtml(meta)}</div>
          </div>
        `;
      })
      .join('');

    resultsEl.querySelectorAll('.search-result').forEach((el) => {
      el.addEventListener('click', () => {
        const r = lastResults[Number(el.dataset.idx)];
        if (r && onOpenFile) onOpenFile(r.filePath, r.offset || 0);
      });
      el.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          const r = lastResults[Number(el.dataset.idx)];
          if (r && onOpenFile) onOpenFile(r.filePath, r.offset || 0);
        }
      });
    });
  }

  async function runQuery() {
    const q = inputEl.value.trim();
    if (!q) {
      setStatus('Enter a query to search.', 'info');
      lastResults = [];
      renderResults([]);
      return;
    }
    const dir = dirEl.value.trim() || (getCurrentDir && getCurrentDir()) || '';
    if (!dir) {
      setStatus('No folder selected — open one in the Explorer first.', 'error');
      return;
    }
    setStatus('Searching…', 'working');
    runBtn.disabled = true;
    try {
      if (mode === 'ask') {
        const r = await ask({ question: q, dir, topK: 5 });
        lastResults = (r && r.chunks) || [];
        setStatus(
          `Asked: "${q}" — ${lastResults.length} passage${lastResults.length === 1 ? '' : 's'}`
        );
      } else {
        const r = await search({ query: q, dir, limit: 50 });
        lastResults = Array.isArray(r) ? r : [];
        setStatus(`Searched — ${lastResults.length} match${lastResults.length === 1 ? '' : 'es'}`);
      }
      renderResults(lastResults);
    } catch (err) {
      setStatus(`Error: ${err && err.message ? err.message : 'unknown'}`, 'error');
      lastResults = [];
      renderResults([]);
    } finally {
      runBtn.disabled = false;
    }
  }

  runBtn.addEventListener('click', runQuery);
  inputEl.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      runQuery();
    } else if (ev.key === 'Escape') {
      inputEl.value = '';
      lastResults = [];
      renderResults([]);
      setStatus('');
    }
  });
  clearBtn.addEventListener('click', () => {
    inputEl.value = '';
    lastResults = [];
    renderResults([]);
    setStatus('');
    inputEl.focus();
  });

  // Expose a small API so the host (renderer) can prefill the dir when the
  // Explorer navigates to a new folder.
  return {
    setDir(d) {
      if (typeof d === 'string') dirEl.value = d;
    },
    focus() {
      inputEl.focus();
    },
    clear() {
      inputEl.value = '';
      lastResults = [];
      renderResults([]);
      setStatus('');
    },
  };
}

module.exports = { renderSearchPanel };
