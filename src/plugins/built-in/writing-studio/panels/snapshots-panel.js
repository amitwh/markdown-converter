function renderSnapshotsPanel(container, { engines, editor }) {
  const snapshots = engines.snapshots.list();

  container.replaceChildren();

  const panel = document.createElement('div');
  panel.className = 'ws-panel';

  // Header with take snapshot button
  const section = document.createElement('div');
  section.className = 'ws-section';
  const btn = document.createElement('button');
  btn.className = 'ws-btn ws-btn-primary';
  btn.id = 'ws-take-snapshot';
  btn.textContent = 'Take Snapshot';
  section.appendChild(btn);
  const count = document.createElement('span');
  count.className = 'ws-muted';
  count.textContent = snapshots.length + ' snapshots';
  section.appendChild(count);
  panel.appendChild(section);

  // Snapshot list
  const list = document.createElement('div');
  list.className = 'ws-snapshot-list';
  for (const s of snapshots) {
    const item = document.createElement('div');
    item.className = 'ws-snapshot-item';

    const header = document.createElement('div');
    header.className = 'ws-snapshot-header';
    const sLabel = document.createElement('span');
    sLabel.className = 'ws-snapshot-label';
    sLabel.textContent = s.label;
    const sWords = document.createElement('span');
    sWords.textContent = s.wordCount + ' words';
    header.appendChild(sLabel);
    header.appendChild(sWords);
    item.appendChild(header);

    const time = document.createElement('div');
    time.className = 'ws-snapshot-time';
    time.textContent = new Date(s.timestamp).toLocaleString();
    item.appendChild(time);

    const actions = document.createElement('div');
    actions.className = 'ws-snapshot-actions';
    for (const [action, text, cls] of [['restore', 'Restore', ''], ['diff', 'Diff', ''], ['delete', 'Delete', 'ws-btn-danger']]) {
      const actionBtn = document.createElement('button');
      actionBtn.className = 'ws-btn ws-btn-sm' + (cls ? ' ' + cls : '');
      actionBtn.textContent = text;
      actionBtn.addEventListener('click', () => {
        if (action === 'restore') {
          const content = engines.snapshots.restore(s.id);
          editor.insertAtCursor(content);
        } else if (action === 'delete') {
          engines.snapshots.delete(s.id);
          renderSnapshotsPanel(container, { engines, editor });
        } else if (action === 'diff') {
          const current = editor.getContent() || '';
          const result = engines.snapshots.diff(s.id, current);
          alert('+' + result.added + ' lines added, -' + result.removed + ' lines removed');
        }
      });
      actions.appendChild(actionBtn);
    }
    item.appendChild(actions);
    list.appendChild(item);
  }
  panel.appendChild(list);
  container.appendChild(panel);

  // Take snapshot button handler
  container.querySelector('#ws-take-snapshot').addEventListener('click', () => {
    const content = editor.getContent() || '';
    engines.snapshots.create(content, 'manual');
    renderSnapshotsPanel(container, { engines, editor });
  });
}

module.exports = { renderSnapshotsPanel };
