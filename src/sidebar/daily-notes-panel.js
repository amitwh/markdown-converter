/**
 * Sidebar panel: daily notes journal browser.
 *
 * Lists the YYYY-MM-DD.md files in <userData>/notes/daily/ newest-first,
 * lets the user click one to open it, and surfaces a "Today" button that
 * creates/opens today's note. Pure DOM module — same pattern as
 * snippets-panel.js / search-panel.js.
 *
 * @param {HTMLElement} container
 * @param {object} deps
 * @param {() => Promise<Array<{docPath:string, savedAt:number, byteSize:number, appVersion:string}>>} [deps.listPendingRecoveries]
 * @param {(args:{date?:string}) => Promise<{path:string, content:string, created:boolean}>} deps.openToday
 * @param {() => Promise<string[]>} deps.listExisting
 * @param {(filePath:string) => void} deps.onOpenFile
 * @param {(filePath:string) => Promise<void>} [deps.deleteEntry]   optional — deletes a daily note
 */
function renderDailyNotesPanel(container, deps) {
  const { openToday, listExisting, onOpenFile } = deps;
  let entries = []; // [{ path, name }]

  container.innerHTML = `
    <div class="daily-notes-panel">
      <div class="daily-notes-toolbar">
        <button class="daily-notes-today-btn" id="daily-notes-today">Today</button>
        <button class="daily-notes-refresh-btn" id="daily-notes-refresh" title="Reload list">↻</button>
      </div>
      <div class="daily-notes-status" id="daily-notes-status"></div>
      <div class="daily-notes-list" id="daily-notes-list"></div>
    </div>
  `;

  const todayBtn = container.querySelector('#daily-notes-today');
  const refreshBtn = container.querySelector('#daily-notes-refresh');
  const statusEl = container.querySelector('#daily-notes-status');
  const listEl = container.querySelector('#daily-notes-list');

  function basename(p) {
    return String(p).split(/[/\\]/).pop();
  }

  function statusOf(name) {
    // YYYY-MM-DD.md → "Sun, 13 Sep 2026" (or local equivalent)
    const m = /^(\d{4})-(\d{2})-(\d{2})\.md$/.exec(name);
    if (!m) return name;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (Number.isNaN(d.getTime())) return name;
    return d.toLocaleDateString(undefined, {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text || '';
  }

  function renderList() {
    if (!listEl) return;
    if (!entries || entries.length === 0) {
      listEl.innerHTML =
        '<div class="daily-notes-empty">No daily notes yet. Press <b>Today</b> to start.</div>';
      return;
    }
    listEl.innerHTML = entries
      .map((entry, i) => {
        return `<div class="daily-notes-item" role="button" tabindex="0" data-idx="${i}">
          <div class="daily-notes-name"></div>
          <div class="daily-notes-sub"></div>
        </div>`;
      })
      .join('');
    // Set dynamic content via textContent so a malicious filename can't
    // inject HTML.
    listEl.querySelectorAll('.daily-notes-item').forEach((el) => {
      const idx = Number(el.dataset.idx);
      const entry = entries[idx];
      el.querySelector('.daily-notes-name').textContent = entry.name.replace(/\.md$/, '');
      el.querySelector('.daily-notes-sub').textContent = statusOf(entry.name);
      el.addEventListener('click', () => {
        if (onOpenFile) onOpenFile(entry.path);
      });
      el.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          el.click();
        }
      });
    });
  }

  async function refresh({ keepStatus = false } = {}) {
    if (typeof listExisting !== 'function') {
      setStatus('Daily notes list is unavailable.');
      return;
    }
    if (!keepStatus) setStatus('Loading…');
    try {
      const list = await listExisting();
      // listExisting returns absolute paths (newest first). Pair each path
      // with its basename for display.
      const paths = Array.isArray(list) ? list : [];
      entries = paths.filter((p) => /\.md$/i.test(p)).map((p) => ({ path: p, name: basename(p) }));
      renderList();
      if (!keepStatus)
        setStatus(
          entries.length === 0 ? '' : `${entries.length} note${entries.length === 1 ? '' : 's'}`
        );
    } catch (err) {
      setStatus(`Error: ${err && err.message ? err.message : 'unknown'}`);
      renderList();
    }
  }

  todayBtn.addEventListener('click', async () => {
    setStatus('Opening today…');
    todayBtn.disabled = true;
    try {
      const result = await openToday({});
      if (result && result.path && onOpenFile) onOpenFile(result.path);
      setStatus(result && result.created ? 'Created today.' : 'Today already exists.');
      await refresh({ keepStatus: true });
    } catch (err) {
      setStatus(`Error: ${err && err.message ? err.message : 'unknown'}`);
    } finally {
      todayBtn.disabled = false;
    }
  });

  refreshBtn.addEventListener('click', () => {
    refresh();
  });

  refresh();
  return {
    refresh,
    basename,
  };
}

module.exports = { renderDailyNotesPanel };
