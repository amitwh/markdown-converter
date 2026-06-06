import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { useFileStore } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';
import { useSettingsStore } from '@/stores/settings-store';

describe('Breadcrumb', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState({ ...useSettingsStore.getInitialState(), breadcrumbSymbols: true });
    useFileStore.setState({ activeTabId: '/test.md', openTabs: [{ id: '/test.md', path: '/test.md', title: 'test.md', dirty: false }] } as any);
    useEditorStore.setState({ buffers: new Map([['/test.md', { id: '/test.md', path: '/test.md', content: '# H1\n## H2', dirty: false }]]) } as any);
  });

  it('shows "No file selected" when no tab is active', () => {
    useFileStore.setState({ activeTabId: null, openTabs: [] } as any);
    render(<Breadcrumb />);
    expect(screen.getByText('No file selected')).toBeInTheDocument();
  });

  it('shows tab title when a tab is active', () => {
    render(<Breadcrumb />);
    expect(screen.getByText('test.md')).toBeInTheDocument();
  });

  it('shows heading symbols when breadcrumbSymbols is true', () => {
    render(<Breadcrumb />);
    expect(screen.getByText('test.md')).toBeInTheDocument();
    expect(screen.getByText(/# H1/)).toBeInTheDocument();
  });

  it('does not show heading symbols when breadcrumbSymbols is false', () => {
    useSettingsStore.setState({ ...useSettingsStore.getInitialState(), breadcrumbSymbols: false });
    render(<Breadcrumb />);
    expect(screen.getByText('test.md')).toBeInTheDocument();
    expect(screen.queryByText(/# H1/)).not.toBeInTheDocument();
  });

  it('limits heading symbols to 3', () => {
    useFileStore.setState({ activeTabId: '/test.md', openTabs: [{ id: '/test.md', path: '/test.md', title: 'test.md', dirty: false }] } as any);
    useEditorStore.setState({ buffers: new Map([['/test.md', { id: '/test.md', path: '/test.md', content: '# H1\n## H2\n### H3\n#### H4', dirty: false }]]) } as any);
    render(<Breadcrumb />);
    // Should show H1, H2, H3 but not H4
    expect(screen.getByText(/# H1/)).toBeInTheDocument();
    expect(screen.getByText(/# H2/)).toBeInTheDocument();
    expect(screen.getByText(/# H3/)).toBeInTheDocument();
    expect(screen.queryByText(/# H4/)).not.toBeInTheDocument();
  });
});