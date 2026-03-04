function createWelcomeContent(recentFiles = []) {
    const recentHtml = recentFiles.length
        ? recentFiles.map(f => {
            const name = f.split(/[/\\]/).pop();
            return `<div class="welcome-recent-item" data-path="${f}"><span class="welcome-recent-name">${name}</span><span class="welcome-recent-path">${f}</span></div>`;
        }).join('')
        : '<p class="welcome-muted">No recent files</p>';

    return `
    <div class="welcome-container">
        <div class="welcome-hero">
            <h1 class="welcome-title">MarkdownConverter</h1>
            <p class="welcome-version">Version 4.0.0</p>
            <p class="welcome-subtitle">Professional Markdown Editor & Universal Document Converter</p>
        </div>

        <div class="welcome-grid">
            <div class="welcome-section">
                <h2>Quick Start</h2>
                <div class="welcome-cards">
                    <div class="welcome-card" data-action="new-file">
                        <div class="welcome-card-icon">+</div>
                        <h3>New Document</h3>
                        <p>Create a blank document</p>
                        <kbd>Ctrl+N</kbd>
                    </div>
                    <div class="welcome-card" data-action="open-file">
                        <div class="welcome-card-icon">&#128194;</div>
                        <h3>Open File</h3>
                        <p>Open an existing file</p>
                        <kbd>Ctrl+O</kbd>
                    </div>
                    <div class="welcome-card" data-action="open-template">
                        <div class="welcome-card-icon">&#128203;</div>
                        <h3>From Template</h3>
                        <p>Start from a template</p>
                    </div>
                    <div class="welcome-card" data-action="command-palette">
                        <div class="welcome-card-icon">&#8984;</div>
                        <h3>Command Palette</h3>
                        <p>Search all actions</p>
                        <kbd>Ctrl+Shift+P</kbd>
                    </div>
                </div>
            </div>

            <div class="welcome-section">
                <h2>What's New in v4.0.0</h2>
                <ul class="welcome-features">
                    <li><strong>CodeMirror Editor</strong> — Syntax highlighting, code folding, multiple cursors</li>
                    <li><strong>Sidebar Panels</strong> — File Explorer, Git, Snippets, Templates</li>
                    <li><strong>Command Palette</strong> — Quick access to all actions</li>
                    <li><strong>Code Execution</strong> — Run JS, Python, Bash from code blocks</li>
                    <li><strong>Print Preview</strong> — Full print customization dialog</li>
                    <li><strong>New Formats</strong> — Reveal.js, YAML, JSON, Confluence, and more</li>
                    <li><strong>Spell Checking</strong> — System dictionary with suggestions</li>
                    <li><strong>Markdown Extensions</strong> — Footnotes, admonitions, TOC</li>
                    <li><strong>Image Handling</strong> — Paste and drag-drop images</li>
                    <li><strong>PlantUML</strong> — Diagram rendering in preview</li>
                </ul>
            </div>

            <div class="welcome-section">
                <h2>Recent Files</h2>
                <div class="welcome-recent">${recentHtml}</div>
            </div>
        </div>

        <div class="welcome-footer">
            <label class="welcome-checkbox">
                <input type="checkbox" id="show-welcome-startup" checked>
                Show this tab on startup
            </label>
        </div>
    </div>`;
}

module.exports = { createWelcomeContent };
