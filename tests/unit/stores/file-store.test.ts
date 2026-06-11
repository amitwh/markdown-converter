import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEditorStore } from '@/stores/editor-store';
import { useFileStore, FileNode, OpenTab } from '@/stores/file-store';
import type { FileEntry } from '@/types/ipc';

vi.mock('@/lib/ipc', () => ({
  ipc: {
    file: {
      list: vi.fn(),
      read: vi.fn(),
      pickFolder: vi.fn(),
      pickFile: vi.fn(),
      write: vi.fn(),
    },
  },
}));

import { ipc } from '@/lib/ipc';

const fakeList = ipc.file.list as ReturnType<typeof vi.fn>;
const fakeRead = ipc.file.read as ReturnType<typeof vi.fn>;
const fakePickFolder = ipc.file.pickFolder as ReturnType<typeof vi.fn>;
const fakePickFile = ipc.file.pickFile as ReturnType<typeof vi.fn>;
const fakeWrite = ipc.file.write as ReturnType<typeof vi.fn>;

function fakeFileEntry(name: string, isDirectory: boolean): FileEntry {
  return { name, path: `/root/${name}`, isDirectory };
}

describe('useFileStore', () => {
  beforeEach(() => {
    useFileStore.setState({
      tree: null,
      rootPath: null,
      expanded: new Set(),
      openTabs: [],
      activeTabId: null,
    });
    useEditorStore.setState({ buffers: new Map(), activeId: null });
    fakeList.mockClear();
    fakeRead.mockClear();
    fakePickFolder.mockClear();
    fakePickFile.mockClear();
    fakeWrite.mockClear();
  });

  // --- openFolder ---

  it('openFolder calls ipc.file.list and sets tree with root node and mapped children', async () => {
    fakeList.mockResolvedValue({
      ok: true,
      data: [fakeFileEntry('README.md', false), fakeFileEntry('src', true)],
    });

    await useFileStore.getState().openFolder('/root');

    expect(fakeList).toHaveBeenCalledWith('/root');
    const tree = useFileStore.getState().tree;
    expect(tree).not.toBeNull();
    expect(tree!.name).toBe('root');
    expect(tree!.path).toBe('/root');
    expect(tree!.isDirectory).toBe(true);
    expect(tree!.loaded).toBe(true);
    expect(tree!.children).toHaveLength(2);
    expect(tree!.children![0].name).toBe('README.md');
    expect(tree!.children![0].isDirectory).toBe(false);
    expect(tree!.children![1].name).toBe('src');
    expect(tree!.children![1].isDirectory).toBe(true);
    // children of a directory node should be null (lazy)
    expect(tree!.children![1].children).toBeNull();
    expect(useFileStore.getState().rootPath).toBe('/root');
  });

  it('openFolder failure leaves state unchanged', async () => {
    fakeList.mockResolvedValue({
      ok: false,
      error: { code: 'ENOENT', message: 'not found' },
    });

    await useFileStore.getState().openFolder('/nonexistent');
    expect(useFileStore.getState().tree).toBeNull();
    expect(useFileStore.getState().rootPath).toBeNull();
  });

  // --- loadChildren ---

  it('loadChildren IPC-loads children of the matching directory and sets loaded: true', async () => {
    fakeList.mockResolvedValue({
      ok: true,
      data: [fakeFileEntry('nested.md', false)],
    });

    // Set up a tree with a loaded parent directory
    const tree: FileNode = {
      name: 'root',
      path: '/root',
      isDirectory: true,
      loaded: true,
      children: [
        {
          name: 'src',
          path: '/root/src',
          isDirectory: true,
          children: null,
          loaded: false,
        },
      ],
    };
    useFileStore.setState({ tree, rootPath: '/root' });

    await useFileStore.getState().loadChildren('/root/src');

    const srcNode = useFileStore.getState().tree!.children![0];
    expect(srcNode.loaded).toBe(true);
    expect(srcNode.children).toHaveLength(1);
    expect(srcNode.children![0].name).toBe('nested.md');
  });

  it('loadChildren on a non-directory node is a no-op', async () => {
    const tree: FileNode = {
      name: 'root',
      path: '/root',
      isDirectory: true,
      loaded: true,
      children: [{ name: 'file.md', path: '/root/file.md', isDirectory: false, children: null }],
    };
    useFileStore.setState({ tree });

    await useFileStore.getState().loadChildren('/root/file.md');
    expect(fakeList).not.toHaveBeenCalled();
  });

  it('loadChildren on a non-existent path is a no-op', async () => {
    const tree: FileNode = {
      name: 'root',
      path: '/root',
      isDirectory: true,
      loaded: true,
      children: [
        { name: 'src', path: '/root/src', isDirectory: true, children: null, loaded: true },
      ],
    };
    useFileStore.setState({ tree });

    await useFileStore.getState().loadChildren('/root/src/not-there');
    // Should not throw
    expect(fakeList).not.toHaveBeenCalled();
  });

  it('loadChildren is idempotent: does not re-fetch when already loaded', async () => {
    fakeList.mockResolvedValue({
      ok: true,
      data: [{ name: 'src', path: '/root/src', isDirectory: true }],
    });
    await useFileStore.getState().openFolder('/root');

    fakeList.mockClear();
    fakeList.mockResolvedValue({
      ok: true,
      data: [{ name: 'foo.ts', path: '/root/src/foo.ts', isDirectory: false }],
    });

    await useFileStore.getState().loadChildren('/root/src');
    const callsAfterFirst = fakeList.mock.calls.length;
    expect(callsAfterFirst).toBe(1);

    // Second call should be a no-op (loaded is true)
    await useFileStore.getState().loadChildren('/root/src');
    expect(fakeList.mock.calls.length).toBe(callsAfterFirst);
  });

  // --- toggleExpanded ---

  it('toggleExpanded adds and removes paths from the expanded Set', () => {
    const { toggleExpanded } = useFileStore.getState();
    toggleExpanded('/root/src');
    expect(useFileStore.getState().expanded.has('/root/src')).toBe(true);
    toggleExpanded('/root/src');
    expect(useFileStore.getState().expanded.has('/root/src')).toBe(false);
  });

  // --- openFile ---

  it('openFile calls ipc.file.read, opens an editor buffer, adds a tab, and sets it active', async () => {
    fakeRead.mockResolvedValue({ ok: true, data: '# hello world' });

    await useFileStore.getState().openFile('/root/README.md');

    expect(fakeRead).toHaveBeenCalledWith('/root/README.md');
    // Editor buffer should be open
    const buf = useEditorStore.getState().buffers.get('/root/README.md');
    expect(buf).not.toBeUndefined();
    expect(buf!.content).toBe('# hello world');
    expect(buf!.dirty).toBe(false);
    // Tab should be added and active
    const tabs = useFileStore.getState().openTabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0].path).toBe('/root/README.md');
    expect(tabs[0].title).toBe('README.md');
    expect(tabs[0].dirty).toBe(false);
    expect(useFileStore.getState().activeTabId).toBe('/root/README.md');
  });

  it('openFile on an already-open file does not re-read — just activates the existing tab', async () => {
    fakeRead.mockResolvedValue({ ok: true, data: '# original' });

    // Open once
    await useFileStore.getState().openFile('/root/README.md');
    expect(fakeRead).toHaveBeenCalledTimes(1);

    // Mark it dirty to prove dirty flag is preserved
    useEditorStore.getState().updateContent('/root/README.md', '# modified');

    // Open again
    await useFileStore.getState().openFile('/root/README.md');

    expect(fakeRead).toHaveBeenCalledTimes(1); // no second read
    expect(useEditorStore.getState().buffers.get('/root/README.md')!.content).toBe('# modified');
    expect(useFileStore.getState().openTabs[0].dirty).toBe(true); // dirty flag preserved
    expect(useFileStore.getState().activeTabId).toBe('/root/README.md');
  });

  it('openFile failure does nothing', async () => {
    fakeRead.mockResolvedValue({
      ok: false,
      error: { code: 'ENOENT', message: 'not found' },
    });

    await useFileStore.getState().openFile('/root/missing.md');
    expect(useFileStore.getState().openTabs).toHaveLength(0);
    expect(useEditorStore.getState().buffers.size).toBe(0);
  });

  // --- openFileFromMain ---

  it('openFileFromMain does NOT call ipc.file.read (main already sent content)', async () => {
    await useFileStore.getState().openFileFromMain('/root/from-menu.md', '# from menu');

    expect(fakeRead).not.toHaveBeenCalled();
    const buf = useEditorStore.getState().buffers.get('/root/from-menu.md');
    expect(buf).not.toBeUndefined();
    expect(buf!.content).toBe('# from menu');
    const tabs = useFileStore.getState().openTabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0].path).toBe('/root/from-menu.md');
    expect(tabs[0].title).toBe('from-menu.md');
    expect(useFileStore.getState().activeTabId).toBe('/root/from-menu.md');
  });

  it('openFileFromMain on an already-open file does not overwrite the editor buffer', async () => {
    // Open once via the menu path
    await useFileStore.getState().openFileFromMain('/root/x.md', '# menu version');
    // User then types something in the editor (simulated via updateContent)
    useEditorStore.getState().updateContent('/root/x.md', '# user edited');

    // Menu sends the same file again (e.g. user picks it from Recent Files)
    await useFileStore.getState().openFileFromMain('/root/x.md', '# menu version');

    // Buffer keeps the user's edits — the menu re-open must not clobber them
    expect(useEditorStore.getState().buffers.get('/root/x.md')!.content).toBe('# user edited');
    expect(useFileStore.getState().openTabs).toHaveLength(1);
    expect(useFileStore.getState().activeTabId).toBe('/root/x.md');
  });

  // --- closeTab ---

  it('closeTab removes the tab and updates activeTabId to the previous neighbor', async () => {
    fakeRead.mockResolvedValue({ ok: true, data: 'a' });
    fakeRead.mockResolvedValue({ ok: true, data: 'b' });

    await useFileStore.getState().openFile('/root/a.md');
    await useFileStore.getState().openFile('/root/b.md');

    // Tab order: [a.md, b.md], active = b.md
    useFileStore.getState().closeTab('/root/b.md');

    const tabs = useFileStore.getState().openTabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0].id).toBe('/root/a.md');
    expect(useFileStore.getState().activeTabId).toBe('/root/a.md');
  });

  it('closeTab on the active tab when it is the only tab sets activeTabId to null', async () => {
    fakeRead.mockResolvedValue({ ok: true, data: '# only' });
    await useFileStore.getState().openFile('/root/only.md');

    useFileStore.getState().closeTab('/root/only.md');

    expect(useFileStore.getState().openTabs).toHaveLength(0);
    expect(useFileStore.getState().activeTabId).toBeNull();
  });

  // --- setActiveTab ---

  it('setActiveTab updates activeTabId', async () => {
    fakeRead.mockResolvedValue({ ok: true, data: 'a' });
    fakeRead.mockResolvedValue({ ok: true, data: 'b' });

    await useFileStore.getState().openFile('/root/a.md');
    await useFileStore.getState().openFile('/root/b.md');
    useFileStore.getState().setActiveTab('/root/a.md');

    expect(useFileStore.getState().activeTabId).toBe('/root/a.md');
  });

  // --- markTabClean / markTabDirty ---

  it('markTabClean sets dirty to false on the matching tab', async () => {
    fakeRead.mockResolvedValue({ ok: true, data: '# doc' });
    await useFileStore.getState().openFile('/root/doc.md');
    useEditorStore.getState().updateContent('/root/doc.md', '# changed');

    useFileStore.getState().markTabClean('/root/doc.md');

    expect(useFileStore.getState().openTabs[0].dirty).toBe(false);
  });

  it('markTabDirty sets dirty to true on the matching tab', async () => {
    fakeRead.mockResolvedValue({ ok: true, data: '# doc' });
    await useFileStore.getState().openFile('/root/doc.md');

    useFileStore.getState().markTabDirty('/root/doc.md');

    expect(useFileStore.getState().openTabs[0].dirty).toBe(true);
  });

  // --- reorderTabs ---

  it('reorderTabs moves a tab from one index to another', async () => {
    fakeRead.mockResolvedValue({ ok: true, data: 'a' });
    fakeRead.mockResolvedValue({ ok: true, data: 'b' });
    fakeRead.mockResolvedValue({ ok: true, data: 'c' });

    await useFileStore.getState().openFile('/root/a.md');
    await useFileStore.getState().openFile('/root/b.md');
    await useFileStore.getState().openFile('/root/c.md');

    // [a, b, c] — move c to front
    useFileStore.getState().reorderTabs(2, 0);

    const tabs = useFileStore.getState().openTabs;
    expect(tabs.map((t) => t.title)).toEqual(['c.md', 'a.md', 'b.md']);
  });

  // --- openFolderDialog ---

  it('openFolderDialog calls pickFolder, then openFolder on the returned path', async () => {
    fakePickFolder.mockResolvedValue({ ok: true, data: '/projects/myapp' });
    fakeList.mockResolvedValue({
      ok: true,
      data: [fakeFileEntry('README.md', false)],
    });

    await useFileStore.getState().openFolderDialog();

    expect(fakePickFolder).toHaveBeenCalled();
    expect(fakeList).toHaveBeenCalledWith('/projects/myapp');
    expect(useFileStore.getState().rootPath).toBe('/projects/myapp');
  });

  it('openFolderDialog on cancelled (null) is a no-op', async () => {
    fakePickFolder.mockResolvedValue({ ok: true, data: null });

    await useFileStore.getState().openFolderDialog();

    expect(fakeList).not.toHaveBeenCalled();
    expect(useFileStore.getState().tree).toBeNull();
  });

  // --- openFileDialog ---

  it('openFileDialog calls pickFile, then openFile on the returned path', async () => {
    fakePickFile.mockResolvedValue({ ok: true, data: '/root/README.md' });
    fakeRead.mockResolvedValue({ ok: true, data: '# hello' });

    await useFileStore.getState().openFileDialog();

    expect(fakePickFile).toHaveBeenCalled();
    expect(fakeRead).toHaveBeenCalledWith('/root/README.md');
    const tabs = useFileStore.getState().openTabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0].path).toBe('/root/README.md');
  });

  it('openFileDialog on cancelled (null) is a no-op', async () => {
    fakePickFile.mockResolvedValue({ ok: true, data: null });

    await useFileStore.getState().openFileDialog();

    expect(fakeRead).not.toHaveBeenCalled();
    expect(useFileStore.getState().openTabs).toHaveLength(0);
  });

  // --- saveActiveBuffer ---

  it('saveActiveBuffer with no active tab returns false', async () => {
    const result = await useFileStore.getState().saveActiveBuffer();
    expect(result).toBe(false);
    expect(fakeWrite).not.toHaveBeenCalled();
  });

  it('saveActiveBuffer with active buffer calls write, then marks saved and clean, returns true', async () => {
    fakeRead.mockResolvedValue({ ok: true, data: '# content' });
    await useFileStore.getState().openFile('/root/doc.md');
    fakeWrite.mockResolvedValue({ ok: true, data: undefined });

    const result = await useFileStore.getState().saveActiveBuffer();

    expect(fakeWrite).toHaveBeenCalledWith('/root/doc.md', '# content');
    expect(useEditorStore.getState().buffers.get('/root/doc.md')!.dirty).toBe(false);
    expect(useFileStore.getState().openTabs[0].dirty).toBe(false);
    expect(result).toBe(true);
  });

  it('saveActiveBuffer on write failure returns false and does NOT mark clean', async () => {
    fakeRead.mockResolvedValue({ ok: true, data: '# content' });
    await useFileStore.getState().openFile('/root/doc.md');
    // Mark the buffer dirty and sync the tab dirty flag before attempting save
    useEditorStore.getState().updateContent('/root/doc.md', '# modified');
    useFileStore.getState().markTabDirty('/root/doc.md');
    fakeWrite.mockResolvedValue({ ok: false, error: { code: 'EIO', message: 'write error' } });

    const result = await useFileStore.getState().saveActiveBuffer();

    expect(result).toBe(false);
    expect(useEditorStore.getState().buffers.get('/root/doc.md')!.dirty).toBe(true);
    expect(useFileStore.getState().openTabs[0].dirty).toBe(true);
  });

  // --- persistence ---

  it('persists rootPath to localStorage and restores on next mount', async () => {
    fakeList.mockResolvedValue({
      ok: true,
      data: [{ name: 'a.md', path: '/root/a.md', isDirectory: false }],
    });
    await useFileStore.getState().openFolder('/root');

    // Force the persist middleware to flush to localStorage
    await useFileStore.persist?.flush?.();

    const stored = JSON.parse(localStorage.getItem('mc-file-store') ?? '{}');
    expect(stored.state.rootPath).toBe('/root');
    // Ensure non-persisted fields are NOT in storage
    expect(stored.state.tree).toBeUndefined();
    expect(stored.state.openTabs).toBeUndefined();
    expect(stored.state.expanded).toBeUndefined();
  });
});
