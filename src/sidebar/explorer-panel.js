const path = require('path');

function renderExplorerPanel(container, { listDirectory, onFileOpen, currentDir }) {
    container.innerHTML = `
        <div class="explorer-panel">
            <div class="explorer-toolbar">
                <input type="text" class="explorer-path" id="explorer-path" value="${currentDir || ''}" placeholder="Open a folder..." readonly>
                <button class="explorer-browse-btn" id="explorer-browse" title="Browse folder">&#x1F4C2;</button>
            </div>
            <div class="explorer-tree" id="explorer-tree"></div>
        </div>
    `;

    document.getElementById('explorer-browse')?.addEventListener('click', async () => {
        const dir = await listDirectory(null); // null means open folder dialog
        if (dir) {
            document.getElementById('explorer-path').value = dir.path;
            renderTree(document.getElementById('explorer-tree'), dir.entries, listDirectory, onFileOpen, dir.path);
        }
    });

    if (currentDir) {
        listDirectory(currentDir).then(dir => {
            if (dir) renderTree(document.getElementById('explorer-tree'), dir.entries, listDirectory, onFileOpen, currentDir);
        });
    }
}

function renderTree(container, entries, listDirectory, onFileOpen, basePath) {
    container.innerHTML = entries.map(entry => {
        if (entry.isDirectory) {
            return `<div class="tree-item tree-folder collapsed" data-path="${entry.path}">
                <span class="tree-icon">&#x25B6;</span>
                <span class="tree-name">${entry.name}</span>
                <div class="tree-children"></div>
            </div>`;
        }
        return `<div class="tree-item tree-file" data-path="${entry.path}">
            <span class="tree-icon">${getFileIcon(entry.name)}</span>
            <span class="tree-name">${entry.name}</span>
        </div>`;
    }).join('');

    container.querySelectorAll('.tree-folder').forEach(el => {
        el.querySelector('.tree-name').addEventListener('click', async () => {
            const isCollapsed = el.classList.contains('collapsed');
            if (isCollapsed) {
                const dir = await listDirectory(el.dataset.path);
                if (dir) {
                    const childContainer = el.querySelector('.tree-children');
                    renderTree(childContainer, dir.entries, listDirectory, onFileOpen, el.dataset.path);
                }
            }
            el.classList.toggle('collapsed');
            el.querySelector('.tree-icon').textContent = el.classList.contains('collapsed') ? '\u25B6' : '\u25BC';
        });
    });

    container.querySelectorAll('.tree-file').forEach(el => {
        el.addEventListener('click', () => onFileOpen(el.dataset.path));
    });
}

function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const icons = { md: '\u{1F4DD}', js: '\u{1F4DC}', json: '{}', html: '\u{1F310}', css: '\u{1F3A8}', py: '\u{1F40D}', pdf: '\u{1F4D5}', txt: '\u{1F4C4}' };
    return icons[ext] || '\u{1F4C4}';
}

module.exports = { renderExplorerPanel };
