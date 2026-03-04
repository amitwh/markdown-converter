function renderGitPanel(container, { gitStatus, gitDiff, gitStage, gitCommit, gitLog }) {
    container.innerHTML = `
        <div class="git-panel">
            <div class="git-section">
                <h4 class="git-section-title">Changes</h4>
                <div class="git-changes" id="git-changes">
                    <p class="git-loading">Loading...</p>
                </div>
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

    async function loadGitStatus() {
        const status = await gitStatus();
        const changesEl = document.getElementById('git-changes');
        if (!status || !changesEl) return;

        if (status.error) {
            changesEl.innerHTML = `<p class="git-info">${status.error}</p>`;
            return;
        }

        const files = [
            ...status.modified.map(f => ({ file: f, status: 'M', color: '#f59e0b' })),
            ...status.not_added.map(f => ({ file: f, status: '?', color: '#6b7280' })),
            ...status.created.map(f => ({ file: f, status: 'A', color: '#10b981' })),
            ...status.deleted.map(f => ({ file: f, status: 'D', color: '#ef4444' })),
            ...status.staged.map(f => ({ file: f, status: 'S', color: '#3b82f6' })),
        ];

        if (files.length === 0) {
            changesEl.innerHTML = '<p class="git-info">No changes</p>';
        } else {
            changesEl.innerHTML = files.map(f => `
                <div class="git-file" data-file="${f.file}">
                    <span class="git-file-status" style="color:${f.color}">${f.status}</span>
                    <span class="git-file-name">${f.file}</span>
                    <button class="git-stage-btn" data-file="${f.file}" title="Stage file">+</button>
                </div>
            `).join('');

            changesEl.querySelectorAll('.git-stage-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await gitStage([btn.dataset.file]);
                    loadGitStatus();
                });
            });
        }

        // Load log
        const log = await gitLog();
        const logEl = document.getElementById('git-log');
        if (log && logEl) {
            logEl.innerHTML = (log.all || []).slice(0, 10).map(entry => `
                <div class="git-log-entry">
                    <div class="git-log-msg">${entry.message}</div>
                    <div class="git-log-meta">${entry.date?.substring(0, 10) || ''} &middot; ${entry.author_name || ''}</div>
                </div>
            `).join('') || '<p class="git-info">No commits</p>';
        }
    }

    document.getElementById('git-commit-btn')?.addEventListener('click', async () => {
        const msg = document.getElementById('git-commit-msg')?.value?.trim();
        if (!msg) return;
        await gitCommit(msg);
        document.getElementById('git-commit-msg').value = '';
        loadGitStatus();
    });
}

module.exports = { renderGitPanel };
