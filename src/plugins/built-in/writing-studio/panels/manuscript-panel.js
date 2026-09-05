/**
 * Manuscript sidebar panel (writing-studio).
 *
 * All project/settings access is async (IPC-backed store), and the
 * "New Project" flow uses an inline dialog — Electron renderers have no
 * window.prompt, so the old prompt() call threw on click.
 */
async function renderManuscriptPanel(container, { engines, editor, settings }) {
  const projectDir = await settings.get('projectDir');

  container.replaceChildren();
  const panel = document.createElement('div');
  panel.className = 'ws-panel';

  if (!projectDir) {
    const empty = document.createElement('div');
    empty.className = 'ws-empty';
    const p = document.createElement('p');
    p.textContent = 'No manuscript project open';
    empty.appendChild(p);
    const btn = document.createElement('button');
    btn.className = 'ws-btn ws-btn-primary';
    btn.id = 'ws-new-project';
    btn.textContent = 'New Project';
    btn.addEventListener('click', () => {
      // Inline name input (window.prompt is unavailable in Electron)
      const name = askForProjectName();
      name.then((result) => {
        if (!result) return;
        settings.set('projectDir', result).then(() => {
          renderManuscriptPanel(container, { engines, editor, settings });
        });
      });
    });
    empty.appendChild(btn);
    panel.appendChild(empty);
    container.appendChild(panel);
    return;
  }

  const project = await engines.projects.loadProject(projectDir);
  if (!project) {
    const empty = document.createElement('div');
    empty.className = 'ws-empty';
    const p = document.createElement('p');
    p.textContent = 'Project not found at ' + projectDir;
    empty.appendChild(p);
    const btn = document.createElement('button');
    btn.className = 'ws-btn';
    btn.id = 'ws-clear-project';
    btn.textContent = 'Clear Project';
    btn.addEventListener('click', () => {
      settings.set('projectDir', null).then(() => {
        renderManuscriptPanel(container, { engines, editor, settings });
      });
    });
    empty.appendChild(btn);
    panel.appendChild(empty);
    container.appendChild(panel);
    return;
  }

  const stats = await engines.projects.getStats(projectDir);

  // Project title + progress
  const section1 = document.createElement('div');
  section1.className = 'ws-section';
  const heading = document.createElement('h3');
  heading.className = 'ws-heading';
  heading.textContent = project.title;
  section1.appendChild(heading);

  const bar = document.createElement('div');
  bar.className = 'ws-progress-bar';
  const fill = document.createElement('div');
  fill.className = 'ws-progress-fill';
  fill.style.width = stats.pctComplete + '%';
  bar.appendChild(fill);
  section1.appendChild(bar);

  const row = document.createElement('div');
  row.className = 'ws-stat-row';
  const label = document.createElement('span');
  label.textContent =
    stats.totalWords.toLocaleString() + ' / ' + stats.targetWords.toLocaleString() + ' words';
  const pct = document.createElement('span');
  pct.className = 'ws-pct';
  pct.textContent = stats.pctComplete + '%';
  row.appendChild(label);
  row.appendChild(pct);
  section1.appendChild(row);
  panel.appendChild(section1);

  // Chapters list
  const section2 = document.createElement('div');
  section2.className = 'ws-section';
  const heading2 = document.createElement('h3');
  heading2.className = 'ws-heading';
  heading2.textContent = 'Chapters (' + project.chapters.length + ')';
  section2.appendChild(heading2);

  const chList = document.createElement('div');
  chList.className = 'ws-chapter-list';
  for (const ch of project.chapters) {
    const item = document.createElement('div');
    item.className = 'ws-chapter-item';
    const title = document.createElement('span');
    title.className = 'ws-chapter-title';
    title.textContent = ch.title || ch.file;
    const status = document.createElement('span');
    status.className = 'ws-chapter-status ws-status-' + (ch.status || 'draft');
    status.textContent = ch.status || 'draft';
    item.appendChild(title);
    item.appendChild(status);
    chList.appendChild(item);
  }
  section2.appendChild(chList);
  panel.appendChild(section2);

  // Compile button
  const section3 = document.createElement('div');
  section3.className = 'ws-section';
  const compileBtn = document.createElement('button');
  compileBtn.className = 'ws-btn ws-btn-primary';
  compileBtn.id = 'ws-compile';
  compileBtn.textContent = 'Compile Manuscript';
  compileBtn.addEventListener('click', async () => {
    const compiled = await engines.projects.compileManuscript(projectDir);
    editor.insertAtCursor(compiled);
  });
  section3.appendChild(compileBtn);
  panel.appendChild(section3);

  container.appendChild(panel);
}

/**
 * Minimal promise-based name input (Electron has no window.prompt).
 * @returns {Promise<string|null>} project name, or null when cancelled
 */
function askForProjectName() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'ai-settings-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="ai-settings-dialog">
        <h3>New manuscript project</h3>
        <input type="text" data-role="name" placeholder="Project name" aria-label="Project name" />
        <div class="ai-settings-actions">
          <button type="button" data-role="ok">Create</button>
          <button type="button" data-role="cancel">Cancel</button>
        </div>
      </div>`;
    const input = overlay.querySelector('[data-role="name"]');
    const done = (value) => {
      overlay.remove();
      resolve(value);
    };
    overlay.querySelector('[data-role="ok"]').addEventListener('click', () => done(input.value.trim() || null));
    overlay.querySelector('[data-role="cancel"]').addEventListener('click', () => done(null));
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) done(null);
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') done(input.value.trim() || null);
      if (event.key === 'Escape') done(null);
    });
    document.body.appendChild(overlay);
    input.focus();
  });
}

module.exports = { renderManuscriptPanel };
