import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@/components/theme-provider';
import { PreviewPane } from '@/components/preview/PreviewPane';
import { usePreviewStore } from '@/stores/preview-store';

describe('PreviewPane', () => {
  beforeEach(() => {
    usePreviewStore.setState({ scrollRatio: 0, source: '' });
  });

  it('renders empty state when no source', () => {
    render(
      <ThemeProvider defaultTheme="dark" attribute="class">
        <PreviewPane />
      </ThemeProvider>
    );
    expect(screen.getByText(/nothing to preview/i)).toBeInTheDocument();
  });

  it('renders markdown when source is set', () => {
    usePreviewStore.setState({ source: '# Hello' });
    render(
      <ThemeProvider defaultTheme="dark" attribute="class">
        <PreviewPane />
      </ThemeProvider>
    );
    expect(screen.getByRole('heading', { level: 1, name: /hello/i })).toBeInTheDocument();
  });
});
