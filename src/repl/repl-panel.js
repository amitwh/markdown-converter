class ReplPanel {
    constructor() {
        this.panel = document.getElementById('bottom-panel');
        this.output = document.getElementById('repl-output');
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('bottom-panel-toggle')?.addEventListener('click', () => this.toggle());
        document.getElementById('repl-clear')?.addEventListener('click', () => this.clear());
    }

    toggle() {
        this.panel.classList.toggle('collapsed');
        const btn = document.getElementById('bottom-panel-toggle');
        if (btn) btn.textContent = this.panel.classList.contains('collapsed') ? '\u25BC' : '\u25B2';
    }

    show() {
        this.panel.classList.remove('collapsed');
        const btn = document.getElementById('bottom-panel-toggle');
        if (btn) btn.textContent = '\u25B2';
    }

    clear() {
        if (this.output) this.output.innerHTML = '';
    }

    appendOutput(command, result) {
        const entry = document.createElement('div');
        entry.className = 'repl-entry';
        entry.innerHTML = `
            <div class="repl-command">\u25B6 ${command}</div>
            ${result.stdout ? `<div class="repl-stdout">${this.escapeHtml(result.stdout)}</div>` : ''}
            ${result.stderr ? `<div class="repl-stderr">${this.escapeHtml(result.stderr)}</div>` : ''}
            ${result.error ? `<div class="repl-error">Error: ${this.escapeHtml(result.error)}</div>` : ''}
        `;
        this.output?.appendChild(entry);
        this.output?.scrollTo(0, this.output.scrollHeight);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

module.exports = { ReplPanel };
