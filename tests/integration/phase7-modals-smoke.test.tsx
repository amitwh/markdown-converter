import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/App';
import { useAppStore } from '@/stores/app-store';
import { useCommandStore } from '@/stores/command-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useFileStore } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';
import { registerMenuCommands } from '@/lib/commands/register-menu-commands';

vi.mock('@/lib/ipc', () => ({
  ipc: {
    app: {
      getVersion: vi.fn().mockResolvedValue({ ok: true, data: '5.0.0' }),
      openExternal: vi.fn().mockResolvedValue({ ok: true }),
    },
    menu: {
      on: vi.fn().mockReturnValue(vi.fn()),
    },
  },
}));

describe('Phase 7 modals integration', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({
      modal: { kind: null },
      sidebarVisible: true,
      previewVisible: true,
      zenMode: false,
      paneSizes: { sidebar: 20, editor: 50, preview: 30 },
    } as any);
    useCommandStore.setState({ handlers: {}, userBindings: {} } as any);
    useSettingsStore.setState(useSettingsStore.getInitialState());
    useFileStore.setState({
      activeTabId: '/x.md',
      openTabs: [{ id: '/x.md', path: '/x.md', title: 'x.md', dirty: false }],
    } as any);
    useEditorStore.setState({
      buffers: new Map([['/x.md', { id: '/x.md', path: '/x.md', content: '# hi', dirty: false }]]),
    } as any);
  });

  it('dispatching settings.open from command store opens SettingsSheet', () => {
    registerMenuCommands();
    render(<App />);
    useCommandStore.getState().dispatch('settings.open');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('AppHeader Settings button dispatches settings.open', async () => {
    useSettingsStore.setState({ ...useSettingsStore.getInitialState(), welcomeDismissed: true });
    registerMenuCommands();
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(useAppStore.getState().modal.kind).toBe('settings');
  });

  it('first launch with welcomeDismissed=false opens welcome modal', () => {
    useSettingsStore.setState({ ...useSettingsStore.getInitialState(), welcomeDismissed: false });
    registerMenuCommands();
    render(<App />);
    expect(useAppStore.getState().modal.kind).toBe('welcome');
  });

  it('first launch with welcomeDismissed=true does not open welcome', () => {
    useSettingsStore.setState({ ...useSettingsStore.getInitialState(), welcomeDismissed: true });
    registerMenuCommands();
    render(<App />);
    expect(useAppStore.getState().modal).toEqual({ kind: null });
  });
});
