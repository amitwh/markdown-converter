import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act, screen, fireEvent } from '@testing-library/react';
import App from '@/App';
import { useCommandStore } from '@/stores/command-store';
import { useAppStore } from '@/stores/app-store';
import { useFileStore } from '@/stores/file-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useEditorStore } from '@/stores/editor-store';

vi.mock('@/lib/ipc', () => ({
  ipc: {
    file: {
      pickFolder: vi.fn(),
      pickFile: vi.fn(),
      read: vi.fn(),
      write: vi.fn(),
      list: vi.fn(),
    },
    app: { getVersion: vi.fn().mockResolvedValue({ ok: true, data: '5.0.1' }) },
    menu: { on: vi.fn(() => () => {}) },
    updater: { check: vi.fn(), install: vi.fn(), getState: vi.fn(), onStatus: vi.fn(() => () => {}) },
    crash: { read: vi.fn(), openDir: vi.fn(), delete: vi.fn() },
  },
}));

vi.mock('@/hooks/use-welcome-trigger', () => ({
  useWelcomeTrigger: () => {},
}));

vi.mock('@/hooks/useAutoUpdateCheck', () => ({
  useAutoUpdateCheck: () => {},
}));

describe('App — print preview event listeners', () => {
  beforeEach(() => {
    useCommandStore.setState({ handlers: {} } as any);
    useAppStore.setState({ modal: { kind: null } } as any);
    useFileStore.setState({ tree: null, rootPath: null, expanded: new Set(), openTabs: [], activeTabId: null });
    useSettingsStore.getState().resetToDefaults?.();
    useEditorStore.setState({ buffers: new Map(), activeId: null });
    localStorage.clear();
  });

  it('opens PrintPreview on mc:print event', () => {
    render(<App />);
    act(() => {
      window.dispatchEvent(new CustomEvent('mc:print'));
    });
    expect(screen.getByText(/print preview/i)).toBeInTheDocument();
  });

  it('opens PrintPreview on mc:print-preview event', () => {
    render(<App />);
    act(() => {
      window.dispatchEvent(new CustomEvent('mc:print-preview'));
    });
    expect(screen.getByText(/print preview/i)).toBeInTheDocument();
  });

  it('opens PrintPreview on mc:print-preview-styled event', () => {
    render(<App />);
    act(() => {
      window.dispatchEvent(new CustomEvent('mc:print-preview-styled'));
    });
    expect(screen.getByText(/print preview/i)).toBeInTheDocument();
  });
});
