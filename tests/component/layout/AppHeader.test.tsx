import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@/components/theme-provider';
import { AppHeader } from '@/components/layout/AppHeader';
import { useAppStore } from '@/stores/app-store';

describe('AppHeader', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({ sidebarVisible: true, previewVisible: true, zenMode: false });
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
});