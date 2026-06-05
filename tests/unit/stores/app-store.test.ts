import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@/stores/app-store';

describe('useAppStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({
      sidebarVisible: true,
      previewVisible: true,
      zenMode: false,
      paneSizes: { sidebar: 20, editor: 50, preview: 30 },
    });
  });

  it('toggles sidebar visibility', () => {
    expect(useAppStore.getState().sidebarVisible).toBe(true);
    useAppStore.getState().toggleSidebar();
    expect(useAppStore.getState().sidebarVisible).toBe(false);
  });

  it('toggles preview visibility', () => {
    useAppStore.getState().togglePreview();
    expect(useAppStore.getState().previewVisible).toBe(false);
  });

  it('updates pane sizes', () => {
    useAppStore.getState().setPaneSizes({ sidebar: 25, editor: 50, preview: 25 });
    expect(useAppStore.getState().paneSizes).toEqual({ sidebar: 25, editor: 50, preview: 25 });
  });

  it('enables and disables zen mode', () => {
    useAppStore.getState().setZenMode(true);
    expect(useAppStore.getState().zenMode).toBe(true);
  });
});