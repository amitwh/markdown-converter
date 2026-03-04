class CommandPalette {
    constructor() {
        this.overlay = document.getElementById('command-palette-overlay');
        this.input = document.getElementById('command-palette-input');
        this.results = document.getElementById('command-palette-results');
        this.commands = [];
        this.selectedIndex = 0;
        this.filteredCommands = [];
        this.setupEventListeners();
    }

    register(label, shortcut, action) {
        this.commands.push({ label, shortcut, action });
    }

    open() {
        this.overlay.classList.remove('hidden');
        this.input.value = '';
        this.input.focus();
        this.selectedIndex = 0;
        this.renderResults('');
    }

    close() {
        this.overlay.classList.add('hidden');
    }

    isOpen() {
        return !this.overlay.classList.contains('hidden');
    }

    setupEventListeners() {
        this.input.addEventListener('input', () => {
            this.selectedIndex = 0;
            this.renderResults(this.input.value);
        });

        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.close();
        });

        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                this.close();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                this.executeSelected();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.selectedIndex = Math.min(this.selectedIndex + 1, this.filteredCommands.length - 1);
                this.updateSelection();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
                this.updateSelection();
            }
        });
    }

    renderResults(query) {
        this.filteredCommands = query
            ? this.commands.filter(cmd => cmd.label.toLowerCase().includes(query.toLowerCase()))
            : [...this.commands];

        this.results.innerHTML = this.filteredCommands.map((cmd, i) => `
            <div class="command-item ${i === this.selectedIndex ? 'selected' : ''}" data-index="${i}">
                <span class="command-label">${this.highlightMatch(cmd.label, query)}</span>
                ${cmd.shortcut ? `<span class="command-shortcut">${cmd.shortcut}</span>` : ''}
            </div>
        `).join('');

        this.results.querySelectorAll('.command-item').forEach((el) => {
            el.addEventListener('click', () => {
                const idx = parseInt(el.dataset.index);
                this.filteredCommands[idx].action();
                this.close();
            });
            el.addEventListener('mouseenter', () => {
                this.selectedIndex = parseInt(el.dataset.index);
                this.updateSelection();
            });
        });
    }

    highlightMatch(text, query) {
        if (!query) return text;
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return text.replace(regex, '<strong>$1</strong>');
    }

    updateSelection() {
        this.results.querySelectorAll('.command-item').forEach((el, i) => {
            el.classList.toggle('selected', i === this.selectedIndex);
        });
        // Scroll selected into view
        const selected = this.results.querySelector('.command-item.selected');
        if (selected) selected.scrollIntoView({ block: 'nearest' });
    }

    executeSelected() {
        if (this.filteredCommands[this.selectedIndex]) {
            this.filteredCommands[this.selectedIndex].action();
            this.close();
        }
    }
}

module.exports = { CommandPalette };
