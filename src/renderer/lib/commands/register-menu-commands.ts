import { useEffect } from 'react';
import { useCommandStore } from '@/stores/command-store';
import { useFileStore } from '@/stores/file-store';
import { useAppStore } from '@/stores/app-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useEditorStore } from '@/stores/editor-store';
import { usePreviewStore } from '@/stores/preview-store';
import { useMenuAction } from '@/hooks/use-menu-action';
import {
  toggleBold,
  toggleItalic,
  toggleCode,
  toggleUnorderedList,
  toggleOrderedList,
  insertLink,
  scrollToLine,
  undo,
  redo,
  insertSnippet,
  setHeadingLevel,
} from '@/lib/editor-commands';
import { ipc } from '@/lib/ipc';
import { toast } from '@/lib/toast';
import { extractHeadings, type HeadingItem } from '@/lib/headings';

type OpenModal = ReturnType<typeof useAppStore.getState>['openModal'];

function confirmCloseFlow(closeTab: (id: string) => void) {
  return (tabId: string) => {
    const buffer = useEditorStore.getState().buffers.get(tabId);
    if (!buffer || !buffer.dirty) {
      closeTab(tabId);
      return;
    }
    useAppStore.getState().openModal('confirm', {
      title: 'Discard unsaved changes?',
      body: `"${buffer.path.split('/').pop() ?? buffer.path}" has unsaved edits. Close without saving?`,
      confirmLabel: 'Discard & close',
      destructive: true,
      onConfirm: () => closeTab(tabId),
    });
  };
}

export function registerMenuCommands(): void {
  const { registerMany } = useCommandStore.getState();

  registerMany({
    'settings.open': () => useAppStore.getState().openModal('settings'),
    'help.about': () => useAppStore.getState().openModal('about'),
    'help.welcome': () => useAppStore.getState().openModal('welcome'),
    'shortcuts.show': () => {
      const open: OpenModal = useAppStore.getState().openModal;
      window.dispatchEvent(new CustomEvent('mc:command-palette-toggle'));
    },
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
    'file.showExportDialog': (format?: string) => {
      const activeTabId = useFileStore.getState().activeTabId;
      if (!activeTabId) return;
      if (format === 'pdf') {
        useAppStore.getState().openModal('export-pdf', { sourcePath: activeTabId });
      } else if (format === 'docx') {
        useAppStore.getState().openModal('export-docx', { sourcePath: activeTabId });
      } else if (format === 'html') {
        useAppStore.getState().openModal('export-html', { sourcePath: activeTabId });
      } else if (format === 'revealjs') {
        useAppStore.getState().openModal('export-revealjs' as any, { sourcePath: activeTabId } as any);
      } else if (format === 'word') {
        useAppStore.getState().openModal('export-word', { sourcePath: activeTabId });
      } else if (format) {
        window.electronAPI?.export?.withOptions?.(format, {});
      }
    },
    'file.exportBatch': () => {
      const paths = useFileStore.getState().openTabs.map((t) => t.path);
      if (paths.length === 0) return;
      useAppStore.getState().openModal('export-batch', { sourcePaths: paths });
    },
    'file.confirmClose': () => {
      const { activeTabId, closeTab } = useFileStore.getState();
      if (activeTabId) confirmCloseFlow(closeTab)(activeTabId);
    },
    'app.quit': () => {
      const dirty = Array.from(useEditorStore.getState().buffers.values()).filter((b) => b.dirty);
      const quit = () => {
        if (window.electronAPI?.app?.quit) {
          void window.electronAPI.app.quit();
        } else {
          window.close();
        }
      };
      if (dirty.length === 0) {
        quit();
        return;
      }
      useAppStore.getState().openModal('confirm', {
        title: 'Unsaved changes',
        body: `You have ${dirty.length} file${dirty.length === 1 ? '' : 's'} with unsaved changes. Quit anyway?`,
        confirmLabel: 'Quit anyway',
        destructive: true,
        onConfirm: quit,
      });
    },
    'tools.ascii': () => useAppStore.getState().openModal('ascii-generator'),
    'tools.table': () => useAppStore.getState().openModal('table-generator'),
    'tools.findInFiles': () => useAppStore.getState().openModal('find-in-files'),
    'tools.exportWord': () => {
      const activeTabId = useFileStore.getState().activeTabId;
      if (!activeTabId) return;
      useAppStore.getState().openModal('export-word', { sourcePath: activeTabId });
    },
    'tools.repl': () => {
      const current = useSettingsStore.getState().replOpen;
      useSettingsStore.getState().setSetting('replOpen', !current);
    },
    'view.zenMode': () => {
      const current = useAppStore.getState().zenMode;
      useAppStore.getState().setZenMode(!current);
    },
    'view.analytics': () => {
      useAppStore.getState().openModal('writing-analytics');
    },
    'file.print': () => {
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('mc:print'));
    },
    'git.refresh': () => {
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('mc:git-refresh'));
    },

    // Editor format commands — drive the active CodeMirror view.
    'editor.bold': () => toggleBold(),
    'editor.italic': () => toggleItalic(),
    'editor.code': () => toggleCode(),
    'editor.list.unordered': () => toggleUnorderedList(),
    'editor.list.ordered': () => toggleOrderedList(),
    'editor.link': () => insertLink(),
    'editor.undo': () => undo(),
    'editor.redo': () => redo(),
    'editor.heading.1': () => setHeadingLevel(1),
    'editor.heading.2': () => setHeadingLevel(2),
    'editor.heading.3': () => setHeadingLevel(3),
    'editor.heading.paragraph': () => setHeadingLevel(0),

    // Find / replace — focus the editor and let CodeMirror's `search` extension
    // handle the actual UI. The `find` extension is included in CodeMirror's
    // searchKeymap; dispatching a CustomEvent reaches any listening component.
    'find.toggle': () => {
      window.dispatchEvent(new CustomEvent('mc:find-toggle'));
    },

    // Sidebar panel switching — sidebar currently shows Files / Outline / Git
    // in a single panel; selecting a section scrolls that section into view.
    'view.sidebarPanel': (panel?: string) => {
      if (!panel) return;
      // Make sure the sidebar is visible so the user actually sees the switch.
      if (!useAppStore.getState().sidebarVisible) {
        useAppStore.getState().toggleSidebar();
      }
      const target = document.querySelector(
        `[data-testid="sidebar-jump-${panel}"]`
      ) as HTMLButtonElement | null;
      target?.click();
    },
    'view.bottomPanel': () => {
      const current = useSettingsStore.getState().replOpen;
      useSettingsStore.getState().setSetting('replOpen', !current);
    },

    'font.size': (direction?: string) => {
      // Three settings: editorFontSize in px. Range 10..28.
      const settings = useSettingsStore.getState();
      const cur = settings.editorFontSize ?? 14;
      const next =
        direction === 'increase'
          ? Math.min(28, cur + 1)
          : direction === 'decrease'
            ? Math.max(10, cur - 1)
            : 14;
      settings.setSetting('editorFontSize', next);
    },

    'theme.loadCustomCss': async () => {
      const r = await ipc.file.pickFile();
      if (!r.ok || !r.data) return;
      useSettingsStore.getState().setSetting('customCssPath', r.data);
      toast.success('Custom CSS loaded');
    },
    'theme.clearCustomCss': () => {
      useSettingsStore.getState().setSetting('customCssPath', null);
      toast.success('Custom CSS cleared');
    },

    'template.load': (name?: string) => {
      if (!name) return;
      const templates: Record<string, string> = {
        'blog-post.md':
          '# Blog Post\n\n_Author • Date_\n\n## Introduction\n\n## Body\n\n## Conclusion\n',
        'meeting-notes.md':
          '# Meeting Notes\n\n**Date:** \n**Attendees:** \n\n## Agenda\n\n## Discussion\n\n## Action items\n',
        'technical-spec.md':
          '# Technical Specification\n\n## Overview\n\n## Goals\n\n## Design\n\n## Implementation\n\n## Testing\n',
        'changelog.md':
          '# Changelog\n\n## [Unreleased]\n\n### Added\n- \n\n### Changed\n- \n\n### Fixed\n- \n',
        'readme.md': '# Project\n\n## Description\n\n## Installation\n\n## Usage\n\n## License\n',
        'project-plan.md': '# Project Plan\n\n## Goals\n\n## Milestones\n\n## Risks\n\n## Status\n',
        'api-docs.md':
          '# API Documentation\n\n## Authentication\n\n## Endpoints\n\n### `GET /resource`\n\n### `POST /resource`\n',
        'tutorial.md':
          '# Tutorial\n\n## Prerequisites\n\n## Step 1\n\n## Step 2\n\n## Conclusion\n',
        'release-notes.md':
          '# Release Notes\n\n## New features\n\n## Improvements\n\n## Bug fixes\n',
        'comparison.md':
          '# Comparison\n\n| Option | A | B |\n|---|---|---|\n| Cost |  |  |\n| Speed |  |  |\n',
      };
      const snippet = templates[name];
      if (!snippet) {
        toast.error(`Unknown template: ${name}`);
        return;
      }
      insertSnippet(snippet);
    },

    'print.preview': () => {
      window.dispatchEvent(new CustomEvent('mc:print-preview'));
    },
    'print.previewStyled': () => {
      window.dispatchEvent(new CustomEvent('mc:print-preview-styled'));
    },

    // Batch converter — PDF batch reuses ExportBatchDialog; others show coming-soon toast.
    'batch.showConverter': (type?: string) => {
      if (!type) return;
      if (type === 'pdf') {
        const paths = useFileStore.getState().openTabs.map((t) => t.path);
        if (paths.length > 0) {
          useAppStore.getState().openModal('export-batch', { sourcePaths: paths });
        } else {
          toast.info('Open files first to batch-export as PDF');
        }
        return;
      }
      useAppStore.getState().openModal('batch-media-converter');
    },

    'tools.documentCompare': () => {
      const paths = useFileStore.getState().openTabs.map((t) => t.path);
      if (paths.length < 2) {
        toast.info('Open at least 2 files to compare');
        return;
      }
      useAppStore.getState().openModal('confirm', {
        title: 'Document Compare',
        body: 'Select two open files to compare side-by-side and show differences.',
        confirmLabel: 'Compare',
        onConfirm: () => {
          const tab0 = paths[0];
          const tab1 = paths[1];
          const content0 = useEditorStore.getState().buffers.get(tab0)?.content ?? '';
          const content1 = useEditorStore.getState().buffers.get(tab1)?.content ?? '';
          const lines0 = content0.split('\n');
          const lines1 = content1.split('\n');
          const diff: string[] = [];
          const maxLines = Math.max(lines0.length, lines1.length);
          for (let i = 0; i < maxLines; i++) {
            if (lines0[i] !== lines1[i]) {
              diff.push(`Line ${i + 1}:\n  - ${lines0[i] ?? '(end)'}\n  + ${lines1[i] ?? '(end)'}`);
            }
          }
          if (diff.length === 0) {
            toast.success('Files are identical');
          } else {
            toast.info(`${diff.length} differences found — check console (F12)`);
            console.log(
              `\n--- Diff: ${tab0.split('/').pop()} vs ${tab1.split('/').pop()} ---\n${diff.join('\n\n')}`
            );
          }
        },
      });
    },
    'tools.pdfEditor': () => useAppStore.getState().openModal('pdf-editor'),

    // Header & footer settings — dedicated dialog.
    'settings.headerFooter': () => {
      useAppStore.getState().openModal('header-footer');
    },

    // Universal converter — single file or batch.
    'tools.universalConverter': () => {
      useAppStore.getState().openModal('universal-converter');
    },

    'tools.batchMediaConverter': () => {
      useAppStore.getState().openModal('batch-media-converter');
    },

    'file.clearRecent': () => {
      window.electronAPI?.send?.('clear-recent-files');
    },

    // File → New — creates an unsaved buffer with a default name.
    'file.new': () => {
      const id = `untitled-${Date.now()}`;
      const path = id;
      useEditorStore.getState().openBuffer(id, path, '');
      useFileStore.setState((s) => {
        s.openTabs.push({ id, path, title: 'Untitled', dirty: true });
        s.activeTabId = id;
      });
    },

    // Navigate to heading — used by sidebar Outline click and Breadcrumb.
    'editor.gotoHeading': (line?: number) => {
      if (typeof line === 'number') scrollToLine(line);
    },

    // Outline click handler — extract the line from the current active buffer
    // for the clicked heading and scroll to it.
    'outline.goto': (headingText?: string) => {
      if (!headingText) return;
      const activeId = useFileStore.getState().activeTabId;
      if (!activeId) return;
      const buffer = useEditorStore.getState().buffers.get(activeId);
      if (!buffer) return;
      const headings: HeadingItem[] = extractHeadings(buffer.content);
      const match = headings.find((h) => h.text === headingText);
      if (match) scrollToLine(match.line);
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
  register('file.saveAs', async (filePath?: string) => {
    if (!filePath) return;
    const { activeTabId } = useFileStore.getState();
    if (!activeTabId) return;

    const buffer = useEditorStore.getState().buffers.get(activeTabId);
    if (!buffer) return;

    const writeResult = await ipc.file.write(filePath, buffer.content);
    if (!writeResult.ok) {
      toast.error(`Failed to save: ${writeResult.error.message}`);
      return;
    }

    useEditorStore.getState().renameBuffer(activeTabId, filePath, filePath);
    useFileStore.setState((s) => {
      const tab = s.openTabs.find((t) => t.id === activeTabId);
      if (tab) {
        tab.id = filePath;
        tab.path = filePath;
        tab.title = filePath.split('/').pop() ?? filePath;
        tab.dirty = false;
      }
      s.activeTabId = filePath;
    });

    const title = filePath.split('/').pop() ?? filePath;
    toast.success(`Saved ${title}`);
  });
  register('file.closeTab', () => {
    const { activeTabId, closeTab } = useFileStore.getState();
    if (activeTabId) confirmCloseFlow(closeTab)(activeTabId);
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
  register('file.opened', (payload?: { path?: string; content?: string }) => {
    if (!payload?.path) return;
    void useFileStore.getState().openFileFromMain(payload.path, payload.content ?? '');
  });
}

export function useRegisterMenuCommands(): void {
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
  useMenuAction('show-analytics-dialog', 'view.analytics');
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
  useMenuAction('get-content-for-save', 'file.saveAs', (filePath) => filePath as string);
  useMenuAction('clear-recent-files', 'file.clearRecent');
  useMenuAction('file-new', 'file.new');
  useMenuAction('show-batch-converter', 'batch.showConverter', (type) => type as string);
  useMenuAction('show-document-compare', 'tools.documentCompare');
  useMenuAction('open-header-footer-dialog', 'settings.headerFooter');
  useMenuAction('show-export-dialog', 'file.showExportDialog', (format) => format as string);
}
