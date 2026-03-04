function renderSnippetsPanel(container, { getSnippets, saveSnippet, deleteSnippet, onInsert }) {
    container.innerHTML = `
        <div class="snippets-panel">
            <div class="snippets-toolbar">
                <input type="text" class="snippets-search" id="snippets-search" placeholder="Search snippets...">
                <button class="snippets-add-btn" id="snippets-add" title="Add snippet">+</button>
            </div>
            <div class="snippets-list" id="snippets-list"></div>
        </div>
    `;

    let snippets = [];

    async function loadSnippets() {
        snippets = await getSnippets() || [];
        renderList(document.getElementById('snippets-search')?.value || '');
    }

    function renderList(query) {
        const list = document.getElementById('snippets-list');
        if (!list) return;

        const filtered = query
            ? snippets.filter(s => s.name.toLowerCase().includes(query.toLowerCase()) || (s.language || '').toLowerCase().includes(query.toLowerCase()))
            : snippets;

        list.innerHTML = filtered.length ? filtered.map(s => `
            <div class="snippet-item" data-id="${s.id}">
                <div class="snippet-header">
                    <span class="snippet-name">${s.name}</span>
                    <span class="snippet-lang">${s.language || 'text'}</span>
                </div>
                <pre class="snippet-preview"><code>${(s.code || '').substring(0, 100)}${(s.code || '').length > 100 ? '...' : ''}</code></pre>
                <div class="snippet-actions">
                    <button class="snippet-insert" data-id="${s.id}" title="Insert">Insert</button>
                    <button class="snippet-delete" data-id="${s.id}" title="Delete">&times;</button>
                </div>
            </div>
        `).join('') : '<p class="git-info">No snippets yet. Click + to add one.</p>';

        list.querySelectorAll('.snippet-insert').forEach(btn => {
            btn.addEventListener('click', () => {
                const s = snippets.find(sn => sn.id === btn.dataset.id);
                if (s) onInsert(s.code);
            });
        });

        list.querySelectorAll('.snippet-delete').forEach(btn => {
            btn.addEventListener('click', async () => {
                await deleteSnippet(btn.dataset.id);
                loadSnippets();
            });
        });
    }

    document.getElementById('snippets-search')?.addEventListener('input', (e) => renderList(e.target.value));

    document.getElementById('snippets-add')?.addEventListener('click', () => {
        const name = prompt('Snippet name:');
        if (!name) return;
        const language = prompt('Language (e.g., javascript, python, html):') || 'text';
        const code = prompt('Paste your code snippet:');
        if (!code) return;

        saveSnippet({ id: Date.now().toString(), name, language, code }).then(() => loadSnippets());
    });

    loadSnippets();
}

module.exports = { renderSnippetsPanel };
