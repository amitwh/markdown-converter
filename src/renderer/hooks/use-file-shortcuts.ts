import { useEffect } from 'react';
import { useFileStore } from '@/stores/file-store';

/**
 * Global keyboard shortcuts for file operations.
 *
 * - Cmd/Ctrl+O: open file
 * - Cmd/Ctrl+Shift+O: open folder
 * - Cmd/Ctrl+S: save active buffer
 * - Cmd/Ctrl+W: close active tab
 * - Cmd/Ctrl+Tab / Cmd/Ctrl+Shift+Tab: next/previous tab (wraps)
 *
 * Suppressed when an <input>, <textarea>, or contentEditable element has focus.
 */
export function useFileShortcuts(): void {
  useEffect(() => {
    function isTypingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
      if (target.isContentEditable) return true;
      return false;
    }

    function handle(e: KeyboardEvent): void {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (isTypingTarget(e.target)) return;

      const key = e.key.toLowerCase();

      // Order matters: more specific (Shift) variants first so they don't get
      // shadowed by the plain modifier-only branch.
      if (e.shiftKey && key === 'o') {
        e.preventDefault();
        void useFileStore.getState().openFolderDialog();
        return;
      }
      if (!e.shiftKey && key === 'o') {
        e.preventDefault();
        void useFileStore.getState().openFileDialog();
        return;
      }
      if (!e.shiftKey && key === 's') {
        e.preventDefault();
        void useFileStore.getState().saveActiveBuffer();
        return;
      }
      if (!e.shiftKey && key === 'w') {
        e.preventDefault();
        const { activeTabId, closeTab } = useFileStore.getState();
        if (activeTabId) closeTab(activeTabId);
        return;
      }
      if (key === 'tab') {
        e.preventDefault();
        const { openTabs, activeTabId, setActiveTab } = useFileStore.getState();
        if (openTabs.length === 0) return;
        const idx = activeTabId ? openTabs.findIndex((t) => t.id === activeTabId) : 0;
        const safeIdx = idx === -1 ? 0 : idx;
        const nextIdx = e.shiftKey
          ? safeIdx <= 0
            ? openTabs.length - 1
            : safeIdx - 1
          : safeIdx >= openTabs.length - 1
            ? 0
            : safeIdx + 1;
        setActiveTab(openTabs[nextIdx].id);
        return;
      }
    }

    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, []);
}
