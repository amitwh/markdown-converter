import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WelcomeDialog } from '@/components/modals/WelcomeDialog';
import { useSettingsStore } from '@/stores/settings-store';
import { useAppStore } from '@/stores/app-store';
import { useCommandStore } from '@/stores/command-store';

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.setState(useSettingsStore.getInitialState());
  useAppStore.setState({ modal: { kind: null } } as any);
  useCommandStore.setState({ handlers: {}, userBindings: {} } as any);
  useCommandStore.getState().register('file.new', vi.fn());
  useCommandStore.getState().register('file.open', vi.fn());
  useCommandStore.getState().register('file.openFolder', vi.fn());
  useCommandStore.getState().register('shortcuts.show', vi.fn());
  useCommandStore.getState().register('file.opened', vi.fn());
  (window.electronAPI as any) = {
    app: {
      getVersion: vi.fn().mockResolvedValue({ data: '1.2.3' }),
    },
  };
});

describe('WelcomeDialog', () => {
  it('renders a heading with app name', () => {
    render(<WelcomeDialog />);
    expect(screen.getByRole('heading', { name: /welcome/i })).toBeInTheDocument();
  });

  it('renders the 3-column layout: Quick Start, Features, Recent Files', () => {
    render(<WelcomeDialog />);
    expect(screen.getByText(/quick start/i)).toBeInTheDocument();
    expect(screen.getByText(/features/i)).toBeInTheDocument();
    expect(screen.getAllByText(/recent files/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders all 4 quick start items with shortcuts', () => {
    render(<WelcomeDialog />);
    expect(screen.getByText('New File')).toBeInTheDocument();
    expect(screen.getByText('Open File')).toBeInTheDocument();
    expect(screen.getByText('Open Folder')).toBeInTheDocument();
    expect(screen.getByText('Command Palette')).toBeInTheDocument();
    expect(screen.getByText('Ctrl+N')).toBeInTheDocument();
    expect(screen.getByText('Ctrl+O')).toBeInTheDocument();
  });

  it('renders feature cards', () => {
    render(<WelcomeDialog />);
    expect(screen.getByText('CodeMirror 6')).toBeInTheDocument();
    expect(screen.getByText('Live Preview')).toBeInTheDocument();
    expect(screen.getByText('PDF Editing')).toBeInTheDocument();
    expect(screen.getByText('25+ Themes')).toBeInTheDocument();
  });

  it('renders keyboard shortcuts section', () => {
    render(<WelcomeDialog />);
    expect(screen.getByText(/shortcuts/i)).toBeInTheDocument();
    expect(screen.getByText('Ctrl+S')).toBeInTheDocument();
    expect(screen.getByText('Toggle sidebar')).toBeInTheDocument();
  });

  it('shows no recent files when none exist', () => {
    render(<WelcomeDialog />);
    expect(screen.getByText('No recent files')).toBeInTheDocument();
  });

  it('shows recent files from localStorage', () => {
    localStorage.setItem(
      'mc-recent-files',
      JSON.stringify(['/home/user/doc1.md', '/home/user/doc2.md'])
    );
    render(<WelcomeDialog />);
    expect(screen.getByText('doc1.md')).toBeInTheDocument();
    expect(screen.getByText('doc2.md')).toBeInTheDocument();
  });

  it('closing without the checkbox does not dismiss future welcome dialogs', async () => {
    render(<WelcomeDialog />);
    await userEvent.click(screen.getByRole('button', { name: /get started/i }));
    expect(useSettingsStore.getState().welcomeDismissed).toBe(false);
    expect(useAppStore.getState().modal).toEqual({ kind: null });
  });

  it('checking "don\'t show on startup" persists the flag', async () => {
    render(<WelcomeDialog />);
    await userEvent.click(screen.getByRole('checkbox', { name: /don't show/i }));
    await userEvent.click(screen.getByRole('button', { name: /get started/i }));
    expect(useSettingsStore.getState().welcomeDismissed).toBe(true);
  });

  it('quick start buttons dispatch commands and close', async () => {
    render(<WelcomeDialog />);
    await userEvent.click(screen.getByText('New File'));
    expect(useCommandStore.getState().handlers['file.new']).toBeDefined();
    expect(useAppStore.getState().modal).toEqual({ kind: null });
  });

  it('fetches and displays version number', async () => {
    render(<WelcomeDialog />);
    await waitFor(() => {
      expect(screen.getByText(/v1\.2\.3/)).toBeInTheDocument();
    });
  });
});
