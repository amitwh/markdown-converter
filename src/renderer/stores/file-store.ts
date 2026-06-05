import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { enableMapSet } from 'immer';
import { ipc } from '@/lib/ipc';
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
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  markTabClean: (id: string) => void;
  markTabDirty: (id: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
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
  immer((set) => ({
    tree: null,
    rootPath: null,
    expanded: new Set<string>(),
    openTabs: [],
    activeTabId: null,

    openFolder: async (path) => {
      const result = await ipc.file.list(path);
      if (!result.ok) return;

      const children: FileNode[] = result.data!.map(entryToNode);

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
          node.children = result.data!.map(entryToNode);
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
      if (!result.ok) return;

      const content = result.data!;
      const title = filePath.split('/').pop() ?? filePath;

      // Open in editor store
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
          s.activeTabId = idx > 0 ? s.openTabs[idx - 1]?.id ?? null : null;
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
  }))
);
