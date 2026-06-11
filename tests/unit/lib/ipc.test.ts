import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ipc } from '@/lib/ipc';
import type { FileResult } from '@/types/ipc';

describe('ipc wrapper', () => {
  beforeEach(() => {
    window.electronAPI = {
      file: {
        read: vi.fn().mockResolvedValue('# hello'),
        write: vi.fn().mockResolvedValue(undefined),
        list: vi.fn().mockResolvedValue([]),
      },
    };
  });

  it('file.read returns ok result on success', async () => {
    const result = await ipc.file.read('/foo.md');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBe('# hello');
    }
  });

  it('file.read returns err result when channel throws', async () => {
    window.electronAPI.file.read = vi.fn().mockRejectedValue(new Error('ENOENT'));
    const result = await ipc.file.read('/missing.md');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('ENOENT');
    }
  });

  it('file.read returns err result when channel missing', async () => {
    delete (window.electronAPI.file as any).read;
    const result = await ipc.file.read('/foo.md');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CHANNEL_MISSING');
    }
  });
});
