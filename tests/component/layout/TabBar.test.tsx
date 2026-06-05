import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { TabBar } from '@/components/layout/TabBar';
import { useFileStore } from '@/stores/file-store';

describe('TabBar', () => {
  beforeEach(() => {
    useFileStore.setState({ openTabs: [], activeTabId: null });
  });

  it('renders "No files open" when openTabs is empty', () => {
    render(<TabBar />);
    expect(screen.getByText(/no files open/i)).toBeInTheDocument();
  });

  it('renders a tab for each OpenTab', () => {
    useFileStore.setState({
      openTabs: [
        { id: '/tmp/foo.md', path: '/tmp/foo.md', title: 'foo.md', dirty: false },
        { id: '/tmp/bar.md', path: '/tmp/bar.md', title: 'bar.md', dirty: false },
      ],
      activeTabId: '/tmp/foo.md',
    });
    render(<TabBar />);
    expect(screen.getByText('foo.md')).toBeInTheDocument();
    expect(screen.getByText('bar.md')).toBeInTheDocument();
  });

  it('highlights the active tab with aria-current', () => {
    useFileStore.setState({
      openTabs: [
        { id: '/tmp/foo.md', path: '/tmp/foo.md', title: 'foo.md', dirty: false },
        { id: '/tmp/bar.md', path: '/tmp/bar.md', title: 'bar.md', dirty: false },
      ],
      activeTabId: '/tmp/foo.md',
    });
    render(<TabBar />);
    const fooTab = screen.getByText('foo.md').closest('[role="tab"]');
    expect(fooTab).toHaveAttribute('aria-current', 'page');
    const barTab = screen.getByText('bar.md').closest('[role="tab"]');
    expect(barTab).not.toHaveAttribute('aria-current');
  });

  it('clicking a tab calls setActiveTab', async () => {
    useFileStore.setState({
      openTabs: [
        { id: '/tmp/foo.md', path: '/tmp/foo.md', title: 'foo.md', dirty: false },
        { id: '/tmp/bar.md', path: '/tmp/bar.md', title: 'bar.md', dirty: false },
      ],
      activeTabId: '/tmp/foo.md',
    });
    render(<TabBar />);
    await act(async () => {
      screen.getByText('bar.md').closest('[role="tab"]')!.click();
    });
    expect(useFileStore.getState().activeTabId).toBe('/tmp/bar.md');
  });

  it('clicking the close button calls closeTab and does not call setActiveTab separately', async () => {
    // Use a non-active tab to test that closeTab doesn't change activeTabId
    useFileStore.setState({
      openTabs: [
        { id: '/tmp/foo.md', path: '/tmp/foo.md', title: 'foo.md', dirty: false },
        { id: '/tmp/bar.md', path: '/tmp/bar.md', title: 'bar.md', dirty: false },
      ],
      activeTabId: '/tmp/bar.md',
    });
    render(<TabBar />);

    const fooTab = screen.getByText('foo.md');
    const closeBtn = fooTab.closest('[role="tab"]')!.querySelector('button')!;
    await act(async () => {
      closeBtn.click();
    });

    const state = useFileStore.getState();
    expect(state.openTabs.find((t) => t.id === '/tmp/foo.md')).toBeUndefined();
    // activeTabId stays on bar since we closed a non-active tab
    expect(state.activeTabId).toBe('/tmp/bar.md');
  });

  it('renders a dirty indicator when dirty === true', () => {
    useFileStore.setState({
      openTabs: [
        { id: '/tmp/foo.md', path: '/tmp/foo.md', title: 'foo.md', dirty: true },
      ],
      activeTabId: '/tmp/foo.md',
    });
    render(<TabBar />);
    const dirtyDot = screen.getByLabelText('Unsaved changes');
    expect(dirtyDot).toBeInTheDocument();
  });

  it('reorders tabs when reorderTabs is called (drag end handler integration)', () => {
    useFileStore.setState({
      openTabs: [
        { id: '/tmp/a.md', path: '/tmp/a.md', title: 'a.md', dirty: false },
        { id: '/tmp/b.md', path: '/tmp/b.md', title: 'b.md', dirty: false },
        { id: '/tmp/c.md', path: '/tmp/c.md', title: 'c.md', dirty: false },
      ],
      activeTabId: '/tmp/a.md',
    });
    render(<TabBar />);
    // Initial DOM order
    const initialOrder = screen.getAllByRole('tab').map((el) => el.getAttribute('data-testid'));
    expect(initialOrder).toEqual(['tab-/tmp/a.md', 'tab-/tmp/b.md', 'tab-/tmp/c.md']);

    // Simulate what dnd-kit's onDragEnd would do: move a.md (idx 0) to idx 2
    act(() => {
      useFileStore.getState().reorderTabs(0, 2);
    });

    const newOrder = screen.getAllByRole('tab').map((el) => el.getAttribute('data-testid'));
    expect(newOrder).toEqual(['tab-/tmp/b.md', 'tab-/tmp/c.md', 'tab-/tmp/a.md']);
  });
});
