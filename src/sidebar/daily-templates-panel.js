/**
 * Sidebar panel: daily-note template gallery.
 *
 * Lists every .md in <userData>/notes/templates/, lets the user pick one
 * before opening today's daily note, and exposes create/edit/delete.
 *
 * Pure DOM module — same pattern as the other sidebar panels.
 *
 * @param {HTMLElement} container
 * @param {object} deps
 * @param {() => Promise<Array<{name:string,label:string,content:string}>>} deps.listTemplates
 * @param {({name:string, content:string}) => Promise<{name:string,label:string,content:string}>} deps.saveTemplate
 * @param {({name:string}) => Promise<boolean>} deps.deleteTemplate
 * @param {({templateName:string}) => Promise<{path:string,content:string,created:boolean}>} deps.applyTemplate
 * @param {(filePath:string) => void} deps.onOpenFile
 */
function renderDailyTemplatesPanel(container, deps) {
  const { listTemplates, saveTemplate, deleteTemplate, applyTemplate, onOpenFile } = deps;
  let entries = [];

  container.innerHTML = `
    <div class="daily-templates-panel">
      <div class="daily-templates-toolbar">
        <button class="daily-templates-new-btn" id="daily-templates-new">+ New Template</button>
        <button class="daily-templates-refresh-btn" id="daily-templates-refresh" title="Reload">↻</button>
      </div>
      <div class="daily-templates-status" id="daily-templates-status"></div>
      <div class="daily-templates-list" id="daily-templates-list"></div>
    </div>
  `;

  const newBtn = container.querySelector('#daily-templates-new');
  const refreshBtn = container.querySelector('#daily-templates-refresh');
  const statusEl = container.querySelector('#daily-templates-status');
  const listEl = container.querySelector('#daily-templates-list');

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text || '';
  }

  function renderList() {
    if (!listEl) return;
    if (!entries || entries.length === 0) {
      listEl.innerHTML =
        '<div class="daily-templates-empty">No templates yet. Press <b>+ New Template</b> to create one.</div>';
      return;
    }
    listEl.innerHTML = entries
      .map(
        (t, i) =>
          `<div class="daily-templates-item" data-idx="${i}">
        <div class="daily-templates-row">
          <div class="daily-templates-label"></div>
          <div class="daily-templates-actions">
            <button class="daily-templates-apply-btn" data-action="apply" data-idx="${i}" title="Use this template for today's note">Use</button>
            <button class="daily-templates-delete-btn" data-action="delete" data-idx="${i}" title="Delete template">×</button>
          </div>
        </div>
      </div>`
      )
      .join('');
    listEl.querySelectorAll('.daily-templates-item').forEach((el) => {
      const idx = Number(el.dataset.idx);
      const t = entries[idx];
      el.querySelector('.daily-templates-label').textContent = t.label;
    });
    listEl.querySelectorAll('[data-action="apply"]').forEach((btn) => {
      btn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const idx = Number(btn.dataset.idx);
        const t = entries[idx];
        await useTemplate(t);
      });
    });
    listEl.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const idx = Number(btn.dataset.idx);
        const t = entries[idx];
        await removeTemplate(t);
      });
    });
  }

  async function useTemplate(t) {
    if (typeof applyTemplate !== 'function') {
      setStatus('Template application is unavailable.');
      return;
    }
    setStatus(`Using "${t.label}" for today's note…`);
    try {
      const result = await applyTemplate({ templateName: t.name });
      if (result && result.path && onOpenFile) onOpenFile(result.path);
      setStatus(result && result.created ? 'Created today.' : 'Today already exists.');
    } catch (err) {
      setStatus(`Error: ${err && err.message ? err.message : 'unknown'}`);
    }
  }

  async function removeTemplate(t) {
    // Don't allow deleting the only template — would break the daily-notes
    // default. The user can add more first.
    if (entries.length <= 1) {
      setStatus('Keep at least one template (the default daily.md).');
      return;
    }
    if (typeof deleteTemplate !== 'function') return;
    try {
      await deleteTemplate({ name: t.name });
      setStatus(`Deleted "${t.label}".`);
      await refresh({ keepStatus: true });
    } catch (err) {
      setStatus(`Error: ${err && err.message ? err.message : 'unknown'}`);
    }
  }

  function promptForName(defaultName) {
    // Vanilla prompt is sufficient here — this is a small modal one-liner.
    const answer = window.prompt('Template file name (.md added if missing):', defaultName);
    if (typeof answer !== 'string') return null;
    const trimmed = answer.trim();
    if (!trimmed) return null;
    return trimmed;
  }

  function promptForContent(defaultContent) {
    const answer = window.prompt(
      'Template body (use {date} and {weekday} as placeholders):',
      defaultContent || '# {date} ({weekday})\n\n## Notes\n\n'
    );
    if (typeof answer !== 'string') return null;
    return answer;
  }

  newBtn.addEventListener('click', async () => {
    if (typeof saveTemplate !== 'function') return;
    const name = promptForName('morning-pages.md');
    if (!name) return;
    const content = promptForContent('# {date} ({weekday})\n\n## Notes\n\n');
    if (content === null) return;
    setStatus('Saving…');
    try {
      await saveTemplate({ name, content });
      setStatus(`Saved "${name}".`);
      await refresh({ keepStatus: true });
    } catch (err) {
      setStatus(`Error: ${err && err.message ? err.message : 'unknown'}`);
    }
  });

  refreshBtn.addEventListener('click', () => refresh());

  async function refresh({ keepStatus = false } = {}) {
    if (typeof listTemplates !== 'function') {
      setStatus('Template list is unavailable.');
      return;
    }
    if (!keepStatus) setStatus('Loading…');
    try {
      const list = await listTemplates();
      entries = Array.isArray(list) ? list : [];
      renderList();
      if (!keepStatus)
        setStatus(
          entries.length === 0 ? '' : `${entries.length} template${entries.length === 1 ? '' : 's'}`
        );
    } catch (err) {
      setStatus(`Error: ${err && err.message ? err.message : 'unknown'}`);
      entries = [];
      renderList();
    }
  }

  refresh();
  return { refresh };
}

module.exports = { renderDailyTemplatesPanel };
