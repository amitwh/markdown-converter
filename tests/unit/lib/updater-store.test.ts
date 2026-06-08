import { describe, expect, test, beforeEach, vi } from 'vitest';

vi.mock('@/lib/ipc', () => ({
  ipc: {
    updater: {
      check: vi.fn(),
      install: vi.fn(),
      getState: vi.fn().mockResolvedValue({ state: 'idle' }),
    },
  },
}));

import { useUpdaterStore } from '@/lib/updater-store';
import { ipc } from '@/lib/ipc';

beforeEach(() => {
  useUpdaterStore.setState({
    state: 'idle',
    version: null,
    percent: 0,
    lastCheckAt: 0,
  });
  vi.clearAllMocks();
});

describe('useUpdaterStore', () => {
  test('initial state is idle', () => {
    expect(useUpdaterStore.getState().state).toBe('idle');
  });

  test('applyStatus updates state from incoming event', () => {
    useUpdaterStore.getState().applyStatus({ state: 'available', version: '5.0.2' });
    expect(useUpdaterStore.getState().state).toBe('available');
    expect(useUpdaterStore.getState().version).toBe('5.0.2');
  });

  test('check() debounces within 60s', async () => {
    useUpdaterStore.setState({ lastCheckAt: Date.now() });
    await useUpdaterStore.getState().check();
    expect(ipc.updater.check).not.toHaveBeenCalled();
  });

  test('check() invokes ipc.updater.check when not debounced', async () => {
    await useUpdaterStore.getState().check();
    expect(ipc.updater.check).toHaveBeenCalled();
  });

  test('install() invokes ipc.updater.install', () => {
    useUpdaterStore.getState().install();
    expect(ipc.updater.install).toHaveBeenCalled();
  });
});
