/**
 * Document Outline Panel
 * Parses markdown headings and renders a navigable tree in the sidebar.
 */

function renderOutlinePanel(container, { getEditorContent, getActiveLine, onHeadingClick }) {
    container.innerHTML = `
        <div class="outline-panel">
            <div class="outline-list" id="outline-list"></div>
        </div>
    `;

    const listEl = document.getElementById('outline-list');
    let headings = [];
    let activeLine = 1;
    let debounceTimer = null;

    function parseHeadings(content) {
        const result = [];
        if (!content) return result;
        const lines = content.split('\n');
        const regex = /^(#{1,6})\s+(.+)$/;
        for (let i = 0; i < lines.length; i++) {
            const match = regex.exec(lines[i]);
            if (match) {
                result.push({
                    level: match[1].length,
                    text: match[2].trim(),
                    line: i + 1
                });
            }
        }
        return result;
    }

    function findActiveHeading(currentLine) {
        let active = null;
        for (const h of headings) {
            if (h.line <= currentLine) {
                active = h;
            } else {
                break;
            }
        }
        return active;
    }

    function renderHeadings() {
        const content = getEditorContent();
        headings = parseHeadings(content);
        activeLine = getActiveLine();

        if (headings.length === 0) {
            listEl.innerHTML = `
                <div class="outline-empty">
                    <p>No headings found</p>
                    <p class="outline-hint"># Heading 1</p>
                    <p class="outline-hint">## Heading 2</p>
                    <p class="outline-hint">### Heading 3</p>
                </div>
            `;
            return;
        }

        const activeHeading = findActiveHeading(activeLine);

        listEl.innerHTML = headings.map((h, idx) => `
            <div class="outline-item outline-level-${h.level}${activeHeading && h.line === activeHeading.line ? ' active' : ''}"
                 data-line="${h.line}" data-index="${idx}">
                <span class="outline-text">${escapeHtml(h.text)}</span>
                <span class="outline-badge">H${h.level}</span>
            </div>
        `).join('') + `<div class="outline-footer">${headings.length} heading${headings.length !== 1 ? 's' : ''}</div>`;

        listEl.querySelectorAll('.outline-item').forEach(item => {
            item.addEventListener('click', () => {
                const line = parseInt(item.dataset.line, 10);
                onHeadingClick(line);
            });
        });
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function refresh() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(renderHeadings, 300);
    }

    function setActiveHeading(line) {
        activeLine = line;
        const activeHeading = findActiveHeading(line);

        listEl.querySelectorAll('.outline-item').forEach(item => {
            const itemLine = parseInt(item.dataset.line, 10);
            if (activeHeading && itemLine === activeHeading.line) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    container._refreshOutline = refresh;
    container._setActiveHeading = setActiveHeading;

    renderHeadings();
}

module.exports = { renderOutlinePanel };
