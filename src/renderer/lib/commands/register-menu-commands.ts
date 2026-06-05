import { useEffect } from 'react';
import { useCommandStore } from '@/stores/command-store';
import { useFileStore } from '@/stores/file-store';
import { useAppStore } from '@/stores/app-store';
import { useMenuAction } from '@/hooks/use-menu-action';

/**
 * Register all Phase 6 menu commands in the command store, and bridge
 * the native menu IPC channels to the matching command ids.
 *
 * Phase 6 scope: file/view/tab commands with direct store mappings.
 * Phase 7+ will add the dialog-driven commands (export, settings, etc.)
 * once the corresponding modals exist.
 */
export function registerMenuCommands(): void {
  const { registerMany } = useCommandStore.getState();

  registerMany({
    'settings.open': () => useAppStore.getState().openModal('settings'),
    'help.about': () => useAppStore.getState().openModal('about'),
    'help.welcome': () => useAppStore.getState().openModal('welcome'),
    'file.exportPdf': () => {
      const activeTabId = useFileStore.getState().activeTabId;
      if (!activeTabId) return;
      useAppStore.getState().openModal('export-pdf', { sourcePath: activeTabId });
    },
    'file.exportDocx': () => {
      const activeTabId = useFileStore.getState().activeTabId;
      if (!activeTabId) return;
      useAppStore.getState().openModal('export-docx', { sourcePath: activeTabId });
    },
    'file.exportHtml': () => {
      const activeTabId = useFileStore.getState().activeTabId;
      if (!activeTabId) return;
      useAppStore.getState().openModal('export-html', { sourcePath: activeTabId });
    },
    'file.exportBatch': () => {
      const paths = useFileStore.getState().openTabs.map((t) => t.path);
      if (paths.length === 0) return;
      useAppStore.getState().openModal('export-batch', { sourcePaths: paths });
    },
    'file.confirmClose': () => {
      /* stub — wired in later phase */
    },
    'app.quit': () => {
      /* stub — wired in later phase */
    },
  });

  const { register } = useCommandStore.getState();
  register('file.open', () => {
    void useFileStore.getState().openFileDialog();
  });
  register('file.openFolder', () => {
    void useFileStore.getState().openFolderDialog();
  });
  register('file.save', () => {
    void useFileStore.getState().saveActiveBuffer();
  });
  register('file.closeTab', () => {
    const { activeTabId, closeTab } = useFileStore.getState();
    if (activeTabId) closeTab(activeTabId);
  });
  register('tab.next', () => {
    const { openTabs, activeTabId, setActiveTab } = useFileStore.getState();
    if (openTabs.length === 0) return;
    const idx = activeTabId ? openTabs.findIndex((t) => t.id === activeTabId) : 0;
    const safeIdx = idx === -1 ? 0 : idx;
    const nextIdx = safeIdx >= openTabs.length - 1 ? 0 : safeIdx + 1;
    setActiveTab(openTabs[nextIdx].id);
  });
  register('tab.prev', () => {
    const { openTabs, activeTabId, setActiveTab } = useFileStore.getState();
    if (openTabs.length === 0) return;
    const idx = activeTabId ? openTabs.findIndex((t) => t.id === activeTabId) : 0;
    const safeIdx = idx === -1 ? 0 : idx;
    const nextIdx = safeIdx <= 0 ? openTabs.length - 1 : safeIdx - 1;
    setActiveTab(openTabs[nextIdx].id);
  });
  register('view.toggleSidebar', () => useAppStore.getState().toggleSidebar());
  register('view.togglePreview', () => useAppStore.getState().togglePreview());
}

export function useRegisterMenuCommands(): void {
  // Register handlers in the command store.
  useEffect(() => {
    registerMenuCommands();
  }, []);
}

/**
 * Wire native-menu IPC channels to the command store.
 * Channel names match what main.js dispatches via webContents.send.
 */
export function useBridgeNativeMenu(): void {
  useMenuAction('file-save', 'file.save');
  useMenuAction('toggle-preview', 'view.togglePreview');
  useMenuAction('toggle-command-palette', 'command.palette');
  useMenuAction('toggle-sidebar-panel', 'view.sidebarPanel', (panel) => panel as string);
  useMenuAction('toggle-bottom-panel', 'view.bottomPanel');
  useMenuAction('toggle-find', 'find.toggle');
  useMenuAction('undo', 'editor.undo');
  useMenuAction('redo', 'editor.redo');
  useMenuAction('adjust-font-size', 'font.size', (direction) => direction as string);
  useMenuAction('load-custom-css', 'theme.loadCustomCss');
  useMenuAction('clear-custom-css', 'theme.clearCustomCss');
  useMenuAction('load-template-menu', 'template.load', (name) => name as string);
  useMenuAction('print-preview', 'print.preview');
  useMenuAction('print-preview-styled', 'print.previewStyled');
  useMenuAction('file-opened', 'file.opened', (payload) => payload);
  useMenuAction('clear-recent-files', 'file.clearRecent');
}
