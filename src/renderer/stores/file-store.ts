import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { enableMapSet } from 'immer';
import { ipc } from '@/lib/ipc';
import { toast } from '@/lib/toast';
import { useEditorStore } from '@/stores/editor-store';
import type { FileEntry } from '@/types/ipc';

enableMapSet();

export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: FileNode[] | null;
  expanded?: boolean;
  loaded?: boolean;
}

export interface OpenTab {
  id: string;
  path: string;
  title: string;
  dirty: boolean;
}

interface FileState {
  tree: FileNode | null;
  rootPath: string | null;
  expanded: Set<string>;
  openTabs: OpenTab[];
  activeTabId: string | null;

  openFolder: (path: string) => Promise<void>;
  loadChildren: (dirPath: string) => Promise<void>;
  toggleExpanded: (dirPath: string) => void;
  openFile: (filePath: string) => Promise<void>;
  openFileFromMain: (filePath: string, content: string) => Promise<void>;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  markTabClean: (id: string) => void;
  markTabDirty: (id: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  openFolderDialog: () => Promise<void>;
  openFileDialog: () => Promise<void>;
  saveActiveBuffer: () => Promise<boolean>;
}

function entryToNode(entry: FileEntry): FileNode {
  return {
    name: entry.name,
    path: entry.path,
    isDirectory: entry.isDirectory,
    children: null, // lazy: start unloaded; loadChildren populates this
  };
}

// Recursively find and update a directory node by path using immer's produce
function updateNode(tree: FileNode, dirPath: string, updater: (node: FileNode) => void): boolean {
  if (tree.path === dirPath && tree.isDirectory) {
    updater(tree);
    return true;
  }
  if (tree.children) {
    for (const child of tree.children) {
      if (updateNode(child, dirPath, updater)) return true;
    }
  }
  return false;
}

export const useFileStore = create<FileState>()(
  persist(
    immer((set) => ({
      tree: null,
      rootPath: null,
      expanded: new Set<string>(),
      openTabs: [],
      activeTabId: null,

      openFolder: async (path) => {
        const result = await ipc.file.list(path);
        if (!result.ok) {
          toast.error(`Failed to open folder: ${result.error.message}`);
          return;
        }

        const raw: any = result.data!;
        const entries: any[] = Array.isArray(raw) ? raw : raw.entries;
        const children: FileNode[] = entries.map(entryToNode);

        set((s) => {
          s.tree = {
            name: path.split('/').filter(Boolean).pop() ?? path,
            path,
            isDirectory: true,
            children,
            loaded: true,
          };
          s.rootPath = path;
        });
      },

      loadChildren: async (dirPath) => {
        // Find the node first
        const tree = useFileStore.getState().tree;
        if (!tree) return;

        let found = false;
        updateNode(tree, dirPath, (node) => {
          if (node.loaded === true) return;
          found = true;
        });
        if (!found) return;

        const result = await ipc.file.list(dirPath);
        if (!result.ok) return;

        set((s) => {
          updateNode(s.tree!, dirPath, (node) => {
            const raw: any = result.data!;
            const items: any[] = Array.isArray(raw) ? raw : raw.entries;
            node.children = items.map(entryToNode);
            node.loaded = true;
          });
        });
      },

      toggleExpanded: (dirPath) => {
        set((s) => {
          if (s.expanded.has(dirPath)) {
            s.expanded.delete(dirPath);
          } else {
            s.expanded.add(dirPath);
          }
        });
      },

      openFile: async (filePath) => {
        // If already open, sync dirty flag from editor buffer and activate
        const existing = useFileStore.getState().openTabs.find((t) => t.id === filePath);
        if (existing) {
          const buffer = useEditorStore.getState().buffers.get(filePath);
          set((s) => {
            s.activeTabId = filePath;
            if (buffer) {
              const tab = s.openTabs.find((t) => t.id === filePath);
              if (tab) tab.dirty = buffer.dirty;
            }
          });
          return;
        }

        const result = await ipc.file.read(filePath);
        if (!result.ok) {
          toast.error(`Failed to open file: ${result.error.message}`);
          return;
        }

        const content = result.data!;
        const title = filePath.split('/').pop() ?? filePath;

        // Open in editor store
        useEditorStore.getState().openBuffer(filePath, filePath, content);

        set((s) => {
          s.openTabs.push({ id: filePath, path: filePath, title, dirty: false });
          s.activeTabId = filePath;
        });
      },

      // Used when the main process has already read the file (e.g. file-opened
      // IPC from File → Open menu). Skips the renderer-side IPC read since main
      // already has the content. Preserves the editor's current buffer content
      // if the file is already open.
      openFileFromMain: async (filePath, content) => {
        const existing = useFileStore.getState().openTabs.find((t) => t.id === filePath);
        if (existing) {
          set((s) => {
            s.activeTabId = filePath;
          });
          return;
        }

        const title = filePath.split('/').pop() ?? filePath;
        useEditorStore.getState().openBuffer(filePath, filePath, content);
        set((s) => {
          s.openTabs.push({ id: filePath, path: filePath, title, dirty: false });
          s.activeTabId = filePath;
        });
      },

      closeTab: (id) => {
        set((s) => {
          const idx = s.openTabs.findIndex((t) => t.id === id);
          if (idx === -1) return;
          s.openTabs.splice(idx, 1);
          if (s.activeTabId === id) {
            s.activeTabId = idx > 0 ? (s.openTabs[idx - 1]?.id ?? null) : null;
          }
        });
      },

      setActiveTab: (id) => {
        set((s) => {
          s.activeTabId = id;
        });
      },

      markTabClean: (id) => {
        set((s) => {
          const tab = s.openTabs.find((t) => t.id === id);
          if (tab) tab.dirty = false;
        });
      },

      markTabDirty: (id) => {
        set((s) => {
          const tab = s.openTabs.find((t) => t.id === id);
          if (tab) tab.dirty = true;
        });
      },

      reorderTabs: (fromIndex, toIndex) => {
        set((s) => {
          const tabs = s.openTabs;
          const [moved] = tabs.splice(fromIndex, 1);
          tabs.splice(toIndex, 0, moved);
        });
      },

      openFolderDialog: async () => {
        const result = await ipc.file.pickFolder();
        if (!result.ok || result.data === null) return;
        await useFileStore.getState().openFolder(result.data);
      },

      openFileDialog: async () => {
        const result = await ipc.file.pickFile();
        if (!result.ok || result.data === null) return;
        await useFileStore.getState().openFile(result.data);
      },

      saveActiveBuffer: async () => {
        const { activeTabId } = useFileStore.getState();
        if (!activeTabId) return false;

        const buffer = useEditorStore.getState().buffers.get(activeTabId);
        if (!buffer) return false;

        let savePath = activeTabId;
        const isUnsaved = activeTabId.startsWith('untitled-');

        if (isUnsaved) {
          const dialogResult = await ipc.app.showSaveDialog({
            title: 'Save Markdown File',
            defaultPath: 'document.md',
            filters: [
              { name: 'Markdown', extensions: ['md', 'markdown'] },
              { name: 'All Files', extensions: ['*'] },
            ],
          });
          if (!dialogResult.ok || !dialogResult.data) {
            return false;
          }
          savePath = dialogResult.data;
        }

        const writeResult = await ipc.file.write(savePath, buffer.content);
        if (!writeResult.ok) {
          toast.error(`Failed to save: ${writeResult.error.message}`);
          return false;
        }

        if (isUnsaved) {
          useEditorStore.getState().renameBuffer(activeTabId, savePath, savePath);
          set((s) => {
            const tab = s.openTabs.find((t) => t.id === activeTabId);
            if (tab) {
              tab.id = savePath;
              tab.path = savePath;
              tab.title = savePath.split('/').pop() ?? savePath;
              tab.dirty = false;
            }
            s.activeTabId = savePath;
          });
        } else {
          useEditorStore.getState().markSaved(activeTabId);
          useFileStore.getState().markTabClean(activeTabId);
        }

        const title = savePath.split('/').pop() ?? savePath;
        toast.success(`Saved ${title}`);
        return true;
      },
    })),
    {
      name: 'mc-file-store',
      storage: createJSONStorage(() => localStorage),
      // Only persist the folder path; tree, expanded Set, and openTabs are
      // rebuilt on demand. The app re-opens the folder on startup.
      partialize: (state) => ({ rootPath: state.rootPath }),
    }
  )
);

// Synchronize active tab with main process's currentFile tracking
let lastActiveTabId: string | null = undefined;
useFileStore.subscribe((state) => {
  const activeTabId = state.activeTabId;
  if (activeTabId !== lastActiveTabId) {
    lastActiveTabId = activeTabId;
    const isRealFile = activeTabId && !activeTabId.startsWith('untitled-');
    if (ipc.file && ipc.file.setCurrent) {
      ipc.file.setCurrent(isRealFile ? activeTabId : null);
    }
  }
});
