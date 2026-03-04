/**
 * @jest-environment jsdom
 */

/**
 * Tests for SidebarManager
 * Tests panel registration, toggling, expand/collapse behavior
 */

describe('SidebarManager', () => {
    let SidebarManager;

    beforeEach(() => {
        document.body.innerHTML = `
            <div class="sidebar collapsed" id="sidebar">
                <div class="sidebar-icons">
                    <button class="sidebar-icon" data-panel="test1"></button>
                    <button class="sidebar-icon" data-panel="test2"></button>
                </div>
                <div class="sidebar-panel" id="sidebar-panel">
                    <div class="sidebar-panel-header">
                        <span class="sidebar-panel-title"></span>
                        <button class="sidebar-panel-close"></button>
                    </div>
                    <div class="sidebar-panel-content" id="sidebar-panel-content"></div>
                </div>
            </div>
        `;
        SidebarManager = require('../src/sidebar/sidebar-manager').SidebarManager;
    });

    test('starts collapsed', () => {
        const mgr = new SidebarManager();
        expect(document.getElementById('sidebar').classList.contains('collapsed')).toBe(true);
    });

    test('expands on panel toggle', () => {
        const mgr = new SidebarManager();
        mgr.registerPanel('test1', { title: 'Test 1', render: (c) => { c.innerHTML = 'hello'; } });
        mgr.togglePanel('test1');
        expect(document.getElementById('sidebar').classList.contains('collapsed')).toBe(false);
        expect(document.querySelector('.sidebar-panel-title').textContent).toBe('Test 1');
    });

    test('collapses on second toggle', () => {
        const mgr = new SidebarManager();
        mgr.registerPanel('test1', { title: 'Test 1', render: () => {} });
        mgr.togglePanel('test1');
        mgr.togglePanel('test1');
        expect(document.getElementById('sidebar').classList.contains('collapsed')).toBe(true);
    });

    test('switches panels', () => {
        const mgr = new SidebarManager();
        mgr.registerPanel('test1', { title: 'Panel 1', render: (c) => { c.innerHTML = 'one'; } });
        mgr.registerPanel('test2', { title: 'Panel 2', render: (c) => { c.innerHTML = 'two'; } });
        mgr.togglePanel('test1');
        mgr.togglePanel('test2');
        expect(document.querySelector('.sidebar-panel-title').textContent).toBe('Panel 2');
        expect(document.getElementById('sidebar-panel-content').innerHTML).toBe('two');
    });

    test('collapse resets active panel', () => {
        const mgr = new SidebarManager();
        mgr.registerPanel('test1', { title: 'Test', render: () => {} });
        mgr.expand('test1');
        mgr.collapse();
        expect(mgr.activePanel).toBe(null);
    });

    test('expand sets active icon', () => {
        const mgr = new SidebarManager();
        mgr.registerPanel('test1', { title: 'Test 1', render: () => {} });
        mgr.expand('test1');
        const btn = document.querySelector('[data-panel="test1"]');
        expect(btn.classList.contains('active')).toBe(true);
    });

    test('collapse removes active icon', () => {
        const mgr = new SidebarManager();
        mgr.registerPanel('test1', { title: 'Test 1', render: () => {} });
        mgr.expand('test1');
        mgr.collapse();
        const btn = document.querySelector('[data-panel="test1"]');
        expect(btn.classList.contains('active')).toBe(false);
    });

    test('expand with unregistered panel does nothing', () => {
        const mgr = new SidebarManager();
        mgr.expand('nonexistent');
        expect(document.getElementById('sidebar').classList.contains('collapsed')).toBe(true);
        expect(mgr.activePanel).toBe(null);
    });

    test('render function receives panel content element', () => {
        const mgr = new SidebarManager();
        const renderFn = jest.fn();
        mgr.registerPanel('test1', { title: 'Test 1', render: renderFn });
        mgr.expand('test1');
        expect(renderFn).toHaveBeenCalledWith(document.getElementById('sidebar-panel-content'));
    });

    test('clicking sidebar icon toggles panel', () => {
        const mgr = new SidebarManager();
        mgr.registerPanel('test1', { title: 'Test 1', render: () => {} });
        const btn = document.querySelector('[data-panel="test1"]');
        btn.click();
        expect(mgr.activePanel).toBe('test1');
        btn.click();
        expect(mgr.activePanel).toBe(null);
    });

    test('clicking close button collapses sidebar', () => {
        const mgr = new SidebarManager();
        mgr.registerPanel('test1', { title: 'Test 1', render: () => {} });
        mgr.expand('test1');
        document.querySelector('.sidebar-panel-close').click();
        expect(mgr.activePanel).toBe(null);
        expect(document.getElementById('sidebar').classList.contains('collapsed')).toBe(true);
    });
});
