class SidebarManager {
    constructor() {
        this.sidebar = document.getElementById('sidebar');
        this.panelContent = document.getElementById('sidebar-panel-content');
        this.panelTitle = document.querySelector('.sidebar-panel-title');
        this.activePanel = null;
        this.panels = new Map();
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.querySelectorAll('.sidebar-icon').forEach(btn => {
            btn.addEventListener('click', () => this.togglePanel(btn.dataset.panel));
        });
        document.querySelector('.sidebar-panel-close')?.addEventListener('click', () => this.collapse());
    }

    registerPanel(name, { title, render }) {
        this.panels.set(name, { title, render });
    }

    togglePanel(name) {
        if (this.activePanel === name) {
            this.collapse();
        } else {
            this.expand(name);
        }
    }

    expand(name) {
        const panel = this.panels.get(name);
        if (!panel) return;
        this.sidebar.classList.remove('collapsed');
        this.panelTitle.textContent = panel.title;
        this.panelContent.innerHTML = '';
        panel.render(this.panelContent);
        this.activePanel = name;
        document.querySelectorAll('.sidebar-icon').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.panel === name);
        });
    }

    collapse() {
        this.sidebar.classList.add('collapsed');
        this.activePanel = null;
        document.querySelectorAll('.sidebar-icon').forEach(btn => btn.classList.remove('active'));
    }
}

module.exports = { SidebarManager };
