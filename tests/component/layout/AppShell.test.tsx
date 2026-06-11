import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@/components/theme-provider';
import { AppShell } from '@/components/layout/AppShell';
import { useAppStore } from '@/stores/app-store';

// Mock react-resizable-panels for jsdom environment
vi.mock('@/components/ui/resizable', () => ({
  ResizablePanelGroup: ({ children, direction, onLayoutChange }: any) => (
    <div data-testid="resizable-panel-group" data-direction={direction}>
      {children}
    </div>
  ),
  ResizablePanel: ({ children, defaultSize, minSize, maxSize }: any) => (
    <div
      data-testid="resizable-panel"
      data-size={defaultSize}
      data-min={minSize}
      data-max={maxSize}
    >
      {children}
    </div>
  ),
  ResizableHandle: () => <div data-testid="resizable-handle" />,
}));

describe('AppShell', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({ sidebarVisible: true, previewVisible: true, zenMode: false });
  });

  it('renders all shell surfaces when sidebar and preview are visible', () => {
    render(
      <ThemeProvider defaultTheme="dark" attribute="class">
        <AppShell />
      </ThemeProvider>
    );
    expect(screen.getByText(/markdownconverter/i)).toBeInTheDocument();
    expect(screen.getByText(/no files open/i)).toBeInTheDocument();
    expect(screen.getByText(/no file selected/i)).toBeInTheDocument();
    expect(screen.getByText(/0 words/i)).toBeInTheDocument();
  });

  it('hides sidebar when sidebarVisible is false', () => {
    useAppStore.setState({ sidebarVisible: false });
    render(
      <ThemeProvider defaultTheme="dark" attribute="class">
        <AppShell />
      </ThemeProvider>
    );
    expect(screen.queryByText(/file tree placeholder/i)).not.toBeInTheDocument();
  });
});
