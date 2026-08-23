// Escape repo-derived strings (branch/file names, commit messages, git stderr) before
// interpolating them into innerHTML. Quotes are included so attribute contexts
// (data-file, data-branch) cannot be broken out of.
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderGitPanel(
  container,
  { gitStatus, gitDiff, gitStage, gitCommit, gitLog, gitBranches, gitCheckout, gitPush, gitPull }
) {
  container.innerHTML = `
        <div class="git-panel">
            <div class="git-section">
                <h4 class="git-section-title">Branches</h4>
                <div class="git-branches" id="git-branches">
                    <p class="git-loading">Loading...</p>
                </div>
                <div class="git-branch-new">
                    <input type="text" class="git-branch-input" id="git-branch-input" placeholder="New branch name..." />
                    <button class="git-branch-create-btn" id="git-branch-create-btn">Create</button>
                </div>
                <div class="git-remote-actions">
                    <button class="git-push-btn" id="git-push-btn">Push</button>
                    <button class="git-pull-btn" id="git-pull-btn">Pull</button>
                </div>
                <p class="git-remote-status" id="git-remote-status"></p>
            </div>
            <div class="git-section">
                <h4 class="git-section-title">Changes</h4>
                <div class="git-changes" id="git-changes">
                    <p class="git-loading">Loading...</p>
                </div>
                <pre class="git-diff-view" id="git-diff-view" style="display:none;"></pre>
            </div>
            <div class="git-section">
                <h4 class="git-section-title">Commit</h4>
                <textarea class="git-commit-input" id="git-commit-msg" placeholder="Commit message..." rows="3"></textarea>
                <button class="git-commit-btn" id="git-commit-btn">Commit</button>
            </div>
            <div class="git-section">
                <h4 class="git-section-title">Recent Commits</h4>
                <div class="git-log" id="git-log"></div>
            </div>
        </div>
    `;

  loadGitStatus();
  loadGitBranches();

  async function loadGitStatus() {
    const status = await gitStatus();
    const changesEl = document.getElementById('git-changes');
    if (!status || !changesEl) return;

    if (status.error) {
      changesEl.innerHTML = `<p class="git-info">${escapeHtml(status.error)}</p>`;
      return;
    }

    const files = [
      ...status.modified.map((f) => ({ file: f, status: 'M', color: '#f59e0b' })),
      ...status.not_added.map((f) => ({ file: f, status: '?', color: '#6b7280' })),
      ...status.created.map((f) => ({ file: f, status: 'A', color: '#10b981' })),
      ...status.deleted.map((f) => ({ file: f, status: 'D', color: '#ef4444' })),
      ...status.staged.map((f) => ({ file: f, status: 'S', color: '#3b82f6' })),
    ];

    if (files.length === 0) {
      changesEl.innerHTML = '<p class="git-info">No changes</p>';
    } else {
      changesEl.innerHTML = files
        .map(
          (f) => `
                <div class="git-file" data-file="${escapeHtml(f.file)}">
                    <span class="git-file-status" style="color:${f.color}">${f.status}</span>
                    <span class="git-file-name">${escapeHtml(f.file)}</span>
                    <button class="git-diff-btn" data-file="${escapeHtml(f.file)}" title="View diff">diff</button>
                    <button class="git-stage-btn" data-file="${escapeHtml(f.file)}" title="Stage file">+</button>
                </div>
            `
        )
        .join('');

      changesEl.querySelectorAll('.git-stage-btn').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await gitStage([btn.dataset.file]);
          loadGitStatus();
        });
      });

      changesEl.querySelectorAll('.git-diff-btn').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await showDiff(btn.dataset.file);
        });
      });
    }

    // Load log
    const log = await gitLog();
    const logEl = document.getElementById('git-log');
    if (log && logEl) {
      logEl.innerHTML =
        (log.all || [])
          .slice(0, 10)
          .map(
            (entry) => `
                <div class="git-log-entry">
                    <div class="git-log-msg">${escapeHtml(entry.message)}</div>
                    <div class="git-log-meta">${entry.date?.substring(0, 10) || ''} &middot; ${escapeHtml(entry.author_name || '')}</div>
                </div>
            `
          )
          .join('') || '<p class="git-info">No commits</p>';
    }
  }

  async function showDiff(file) {
    const diffView = document.getElementById('git-diff-view');
    if (!diffView || !gitDiff) return;
    const result = await gitDiff(file);
    diffView.textContent =
      result && result.error ? result.error : result && result.length ? result : 'No changes';
    diffView.style.display = 'block';
  }

  async function loadGitBranches() {
    const branchesEl = document.getElementById('git-branches');
    if (!gitBranches || !branchesEl) return;

    const result = await gitBranches();
    if (!result) return;

    if (result.error) {
      branchesEl.innerHTML = `<p class="git-info">${escapeHtml(result.error)}</p>`;
      return;
    }

    const names = result.all || [];
    const current = result.current;

    if (names.length === 0) {
      branchesEl.innerHTML = '<p class="git-info">No branches</p>';
      return;
    }

    branchesEl.innerHTML = names
      .map(
        (name) => `
                <div class="git-branch-item${name === current ? ' git-branch-current' : ''}" data-branch="${escapeHtml(name)}">
                    <span class="git-branch-name">${name === current ? '&#9679; ' : ''}${escapeHtml(name)}</span>
                    ${name === current ? '' : `<button class="git-checkout-btn" data-branch="${escapeHtml(name)}" title="Checkout branch">checkout</button>`}
                </div>
            `
      )
      .join('');

    branchesEl.querySelectorAll('.git-checkout-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const result = await gitCheckout(btn.dataset.branch, false);
        if (result && result.error) {
          const statusEl = document.getElementById('git-remote-status');
          if (statusEl) statusEl.textContent = `Checkout failed: ${result.error}`;
        }
        loadGitBranches();
        loadGitStatus();
      });
    });
  }

  document.getElementById('git-commit-btn')?.addEventListener('click', async () => {
    const msg = document.getElementById('git-commit-msg')?.value?.trim();
    if (!msg) return;
    await gitCommit(msg);
    document.getElementById('git-commit-msg').value = '';
    loadGitStatus();
  });

  document.getElementById('git-branch-create-btn')?.addEventListener('click', async () => {
    const input = document.getElementById('git-branch-input');
    const name = input?.value?.trim();
    if (!name || !gitCheckout) return;
    const result = await gitCheckout(name, true);
    const statusEl = document.getElementById('git-remote-status');
    if (result && result.error) {
      if (statusEl) statusEl.textContent = `Create branch failed: ${result.error}`;
    } else {
      input.value = '';
      if (statusEl) statusEl.textContent = '';
    }
    loadGitBranches();
    loadGitStatus();
  });

  document.getElementById('git-push-btn')?.addEventListener('click', async () => {
    const statusEl = document.getElementById('git-remote-status');
    if (!gitPush) return;
    const result = await gitPush();
    if (statusEl) {
      statusEl.textContent =
        result && result.error ? `Push failed: ${result.error}` : 'Push complete';
    }
  });

  document.getElementById('git-pull-btn')?.addEventListener('click', async () => {
    const statusEl = document.getElementById('git-remote-status');
    if (!gitPull) return;
    const result = await gitPull();
    if (statusEl) {
      statusEl.textContent =
        result && result.error ? `Pull failed: ${result.error}` : 'Pull complete';
    }
    loadGitStatus();
    loadGitBranches();
  });
}

module.exports = { renderGitPanel };
