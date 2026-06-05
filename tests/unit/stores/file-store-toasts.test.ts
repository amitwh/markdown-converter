import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEditorStore } from '@/stores/editor-store';
import { useFileStore } from '@/stores/file-store';

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

vi.mock('@/lib/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    promise: vi.fn(),
    dismiss: vi.fn(),
  },
}));

import { ipc } from '@/lib/ipc';
import { toast } from '@/lib/toast';

const fakeRead = ipc.file.read as ReturnType<typeof vi.fn>;
const fakeWrite = ipc.file.write as ReturnType<typeof vi.fn>;
const fakeList = ipc.file.list as ReturnType<typeof vi.fn>;

describe('file-store toasts', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    useFileStore.setState({
      tree: null,
      rootPath: null,
      expanded: new Set<string>(),
      openTabs: [],
      activeTabId: null,
    } as any);
    useEditorStore.setState({ buffers: new Map(), activeId: null } as any);
  });

  describe('saveActiveBuffer', () => {
    it('calls toast.success when save succeeds', async () => {
      fakeWrite.mockResolvedValue({ ok: true, data: undefined });
      useFileStore.setState({
        activeTabId: '/test.md',
        openTabs: [{ id: '/test.md', path: '/test.md', title: 'test.md', dirty: false }],
      } as any);
      useEditorStore.setState({
        buffers: new Map([['/test.md', { id: '/test.md', path: '/test.md', content: '# hi', dirty: true }]]),
        activeId: '/test.md',
      } as any);

      const result = await useFileStore.getState().saveActiveBuffer();
      expect(result).toBe(true);
      expect(toast.success).toHaveBeenCalledWith('Saved test.md');
    });

    it('calls toast.error when save fails', async () => {
      fakeWrite.mockResolvedValue({ ok: false, error: { code: 'EACCES', message: 'Permission denied' } });
      useFileStore.setState({
        activeTabId: '/test.md',
        openTabs: [{ id: '/test.md', path: '/test.md', title: 'test.md', dirty: false }],
      } as any);
      useEditorStore.setState({
        buffers: new Map([['/test.md', { id: '/test.md', path: '/test.md', content: '# hi', dirty: true }]]),
        activeId: '/test.md',
      } as any);

      const result = await useFileStore.getState().saveActiveBuffer();
      expect(result).toBe(false);
      expect(toast.error).toHaveBeenCalledWith('Failed to save: Permission denied');
    });
  });

  describe('openFile', () => {
    it('calls toast.error when IPC read fails', async () => {
      fakeRead.mockResolvedValue({ ok: false, error: { code: 'ENOENT', message: 'No such file' } });

      await useFileStore.getState().openFile('/missing.md');
      expect(toast.error).toHaveBeenCalledWith('Failed to open file: No such file');
    });
  });

  describe('openFolder', () => {
    it('calls toast.error when IPC list fails', async () => {
      fakeList.mockResolvedValue({ ok: false, error: { code: 'EACCES', message: 'Permission denied' } });

      await useFileStore.getState().openFolder('/forbidden');
      expect(toast.error).toHaveBeenCalledWith('Failed to open folder: Permission denied');
    });
  });
});