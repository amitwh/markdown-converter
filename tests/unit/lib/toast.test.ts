import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    promise: vi.fn(),
    dismiss: vi.fn(),
  },
}));

import { toast } from '@/lib/toast';
import { toast as sonnerToast } from 'sonner';

describe('toast helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('toast.success forwards to sonner with the message', () => {
    toast.success('Saved test.md');
    expect(sonnerToast.success).toHaveBeenCalledWith('Saved test.md');
  });

  it('toast.error forwards to sonner with the message', () => {
    toast.error('Failed to save: ENOENT');
    expect(sonnerToast.error).toHaveBeenCalledWith('Failed to save: ENOENT');
  });

  it('toast.info forwards to sonner with the message', () => {
    toast.info('Update available');
    expect(sonnerToast.info).toHaveBeenCalledWith('Update available');
  });

  it('toast.warning forwards to sonner with the message', () => {
    toast.warning('Disk space low');
    expect(sonnerToast.warning).toHaveBeenCalledWith('Disk space low');
  });

  it('toast.promise forwards the promise and messages to sonner', async () => {
    const promise = Promise.resolve('ok');
    const msgs = { loading: 'Loading…', success: 'Done', error: 'Failed' };
    toast.promise(promise, msgs);
    expect(sonnerToast.promise).toHaveBeenCalledWith(promise, msgs);
  });
});
