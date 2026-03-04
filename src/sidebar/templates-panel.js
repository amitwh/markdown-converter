const fs = require('fs');
const path = require('path');

const templates = [
    { name: 'Blog Post', file: 'blog-post.md', description: 'Article with frontmatter' },
    { name: 'Meeting Notes', file: 'meeting-notes.md', description: 'Agenda, notes, action items' },
    { name: 'Technical Spec', file: 'technical-spec.md', description: 'Requirements and architecture' },
    { name: 'Changelog', file: 'changelog.md', description: 'Keep a Changelog format' },
    { name: 'README', file: 'readme.md', description: 'Project documentation' },
    { name: 'Project Plan', file: 'project-plan.md', description: 'Goals, milestones, timeline' },
    { name: 'API Docs', file: 'api-docs.md', description: 'API endpoint documentation' },
    { name: 'Tutorial', file: 'tutorial.md', description: 'Step-by-step guide' },
    { name: 'Release Notes', file: 'release-notes.md', description: 'Version release summary' },
    { name: 'Comparison', file: 'comparison.md', description: 'Feature comparison table' },
];

function renderTemplatesPanel(container, onSelect) {
    container.innerHTML = `
        <div class="panel-list">
            ${templates.map(t => `
                <div class="panel-list-item template-item" data-file="${t.file}">
                    <div class="panel-list-item-title">${t.name}</div>
                    <div class="panel-list-item-desc">${t.description}</div>
                </div>
            `).join('')}
        </div>
    `;

    container.querySelectorAll('.template-item').forEach(el => {
        el.addEventListener('click', () => onSelect(el.dataset.file));
    });
}

module.exports = { renderTemplatesPanel, templates };
