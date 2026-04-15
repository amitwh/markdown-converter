function renderProofreadPanel(container, { events, editor }) {
  const hasAI = events.hasHandler('ai:analyze');

  container.replaceChildren();

  const panel = document.createElement('div');
  panel.className = 'ws-panel';

  const section = document.createElement('div');
  section.className = 'ws-section';

  const btn = document.createElement('button');
  btn.className = 'ws-btn ws-btn-primary';
  btn.id = 'ws-proofread';
  btn.textContent = hasAI ? 'Check Document' : 'AI Plugin Required';
  btn.disabled = !hasAI;
  section.appendChild(btn);

  if (!hasAI) {
    const note = document.createElement('p');
    note.className = 'ws-muted';
    note.textContent = 'Install the AI Assistant plugin to enable proofreading.';
    section.appendChild(note);
  }
  panel.appendChild(section);

  const issuesList = document.createElement('div');
  issuesList.className = 'ws-issues-list';
  issuesList.id = 'ws-issues';
  panel.appendChild(issuesList);

  container.appendChild(panel);

  if (!hasAI) return;

  container.querySelector('#ws-proofread').addEventListener('click', () => {
    const content = editor.getContent() || '';
    events.emit('ai:analyze', {
      text: content,
      type: 'grammar',
      callback: (result) => {
        if (result && result.issues) {
          renderIssues(issuesList, result.issues);
        }
      }
    });
  });
}

function renderIssues(container, issues) {
  container.replaceChildren();
  if (!issues || issues.length === 0) {
    const p = document.createElement('p');
    p.className = 'ws-muted';
    p.textContent = 'No issues found.';
    container.appendChild(p);
    return;
  }
  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    const item = document.createElement('div');
    item.className = 'ws-issue-item';

    const type = document.createElement('div');
    type.className = 'ws-issue-type';
    type.textContent = (issue.type || 'grammar').toUpperCase();
    item.appendChild(type);

    const text = document.createElement('div');
    text.className = 'ws-issue-text';
    text.textContent = issue.message || issue.text || '';
    item.appendChild(text);

    if (issue.suggestion) {
      const sug = document.createElement('div');
      sug.className = 'ws-issue-suggestion';
      sug.textContent = 'Suggestion: ' + issue.suggestion;
      item.appendChild(sug);
    }

    const actions = document.createElement('div');
    actions.className = 'ws-issue-actions';
    for (const [action, label] of [['accept', 'Accept'], ['dismiss', 'Dismiss']]) {
      const actionBtn = document.createElement('button');
      actionBtn.className = 'ws-btn ws-btn-sm';
      actionBtn.textContent = label;
      actionBtn.addEventListener('click', () => {
        item.remove();
      });
      actions.appendChild(actionBtn);
    }
    item.appendChild(actions);
    container.appendChild(item);
  }
}

module.exports = { renderProofreadPanel };
