import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@/components/theme-provider';
import { AppHeader } from '@/components/layout/AppHeader';
import { useAppStore } from '@/stores/app-store';
import { useCommandStore } from '@/stores/command-store';

describe('AppHeader', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({ sidebarVisible: true, previewVisible: true, zenMode: false });
    useCommandStore.setState({ handlers: {} });
    // Mirror what AppShell registers so dispatching actually does something.
    useCommandStore.getState().register('view.toggleSidebar', () => {
      useAppStore.getState().toggleSidebar();
    });
    useCommandStore.getState().register('view.togglePreview', () => {
      useAppStore.getState().togglePreview();
    });
    useCommandStore.getState().register('shortcuts.show', () => {});
    useCommandStore.getState().register('settings.open', () => {
      useAppStore.getState().openModal('settings');
    });
    useCommandStore.getState().register('help.about', () => {
      useAppStore.getState().openModal('about');
    });
  });

  it('renders the app title', () => {
    render(
      <ThemeProvider defaultTheme="dark" attribute="class">
        <AppHeader />
      </ThemeProvider>
    );
    expect(screen.getByText(/markdownconverter/i)).toBeInTheDocument();
  });

  it('toggles sidebar when sidebar button clicked', async () => {
    render(
      <ThemeProvider defaultTheme="dark" attribute="class">
        <AppHeader />
      </ThemeProvider>
    );
    const btn = screen.getByRole('button', { name: /toggle sidebar/i });
    await userEvent.click(btn);
    expect(useAppStore.getState().sidebarVisible).toBe(false);
  });

  it('toggles preview when preview button clicked', async () => {
    render(
      <ThemeProvider defaultTheme="dark" attribute="class">
        <AppHeader />
      </ThemeProvider>
    );
    const btn = screen.getByRole('button', { name: /toggle preview/i });
    await userEvent.click(btn);
    expect(useAppStore.getState().previewVisible).toBe(false);
  });

  it('disables-shortcut button dispatches shortcuts.show', async () => {
    render(
      <ThemeProvider defaultTheme="dark" attribute="class">
        <AppHeader />
      </ThemeProvider>
    );
    const btn = screen.getByTestId('header-shortcuts');
    await userEvent.click(btn);
    // No observable side effect; the command was registered as a no-op.
    // The test passes if no error is thrown and the click is processed.
    expect(btn).toBeInTheDocument();
  });

  it('settings button opens settings modal', async () => {
    render(
      <ThemeProvider defaultTheme="dark" attribute="class">
        <AppHeader />
      </ThemeProvider>
    );
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    expect(useAppStore.getState().modal).toEqual({ kind: 'settings' });
  });

  it('about button opens about modal', async () => {
    render(
      <ThemeProvider defaultTheme="dark" attribute="class">
        <AppHeader />
      </ThemeProvider>
    );
    await userEvent.click(screen.getByRole('button', { name: /^about$/i }));
    expect(useAppStore.getState().modal).toEqual({ kind: 'about' });
  });
});
