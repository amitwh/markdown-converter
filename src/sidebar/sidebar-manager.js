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
    document.querySelectorAll('.sidebar-icon').forEach((btn) => {
      btn.addEventListener('click', () => this.togglePanel(btn.dataset.panel));
    });
    document
      .querySelector('.sidebar-panel-close')
      ?.addEventListener('click', () => this.collapse());
  }

  /**
   * Register a sidebar panel. Core panels (explorer/git/…) get their icons
   * from index.html; plugins pass an `icon` (inline SVG string) and a rail
   * button is created for them automatically so their panel is reachable
   * without editing the app shell.
   *
   * @param {string} name Panel id
   * @param {object} opts { title, render, icon? }
   */
  registerPanel(name, { title, render, icon }) {
    this.panels.set(name, { title, render });

    if (icon && !document.querySelector(`.sidebar-icon[data-panel="${name}"]`)) {
      this.addIcon(name, { title, icon });
    }
  }

  /**
   * Append an icon button to the sidebar rail for a registered panel.
   * Idempotent — re-registering a plugin won't duplicate its icon.
   */
  addIcon(name, { title, icon }) {
    const btn = document.createElement('button');
    btn.className = 'sidebar-icon';
    btn.dataset.panel = name;
    btn.title = title || name;
    btn.setAttribute('aria-label', title || name);
    btn.innerHTML = icon;
    btn.addEventListener('click', () => this.togglePanel(name));
    this.sidebar?.querySelector('.sidebar-icons')?.appendChild(btn) ||
      this.sidebar?.appendChild(btn);
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
    document.querySelectorAll('.sidebar-icon').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.panel === name);
    });
  }

  collapse() {
    this.sidebar.classList.add('collapsed');
    this.activePanel = null;
    document.querySelectorAll('.sidebar-icon').forEach((btn) => btn.classList.remove('active'));
  }
}

module.exports = { SidebarManager };
