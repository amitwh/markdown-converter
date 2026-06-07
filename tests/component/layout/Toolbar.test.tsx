import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Toolbar } from '@/components/layout/Toolbar';
import { useCommandStore } from '@/stores/command-store';
import { useAppStore } from '@/stores/app-store';

describe('Toolbar', () => {
  beforeEach(() => {
    useCommandStore.setState({ handlers: {} });
    useAppStore.setState({
      sidebarVisible: true,
      previewVisible: true,
      zenMode: false,
      paneSizes: { sidebar: 20, editor: 50, preview: 30 },
    });
  });

  it('renders formatting buttons', () => {
    render(<Toolbar />);
    expect(screen.getByRole('button', { name: /bold/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /italic/i })).toBeInTheDocument();
  });

  it('renders all toolbar buttons', () => {
    render(<Toolbar />);
    expect(screen.getByTestId('toolbar-open-file')).toBeInTheDocument();
    expect(screen.getByTestId('toolbar-open-folder')).toBeInTheDocument();
    expect(screen.getByTestId('toolbar-save')).toBeInTheDocument();
    expect(screen.getByTestId('toolbar-toggle-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('toolbar-toggle-preview')).toBeInTheDocument();
  });

  it('Open file button dispatches file.open', () => {
    const handler = vi.fn();
    useCommandStore.getState().register('file.open', handler);
    render(<Toolbar />);
    fireEvent.click(screen.getByTestId('toolbar-open-file'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('Open folder button dispatches file.openFolder', () => {
    const handler = vi.fn();
    useCommandStore.getState().register('file.openFolder', handler);
    render(<Toolbar />);
    fireEvent.click(screen.getByTestId('toolbar-open-folder'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('Save button dispatches file.save', () => {
    const handler = vi.fn();
    useCommandStore.getState().register('file.save', handler);
    render(<Toolbar />);
    fireEvent.click(screen.getByTestId('toolbar-save'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('Toggle sidebar button dispatches view.toggleSidebar and reflects aria-pressed', () => {
    const handler = vi.fn();
    useCommandStore.getState().register('view.toggleSidebar', handler);
    render(<Toolbar />);
    const btn = screen.getByTestId('toolbar-toggle-sidebar');
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(btn);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('Toggle preview button dispatches view.togglePreview', () => {
    const handler = vi.fn();
    useCommandStore.getState().register('view.togglePreview', handler);
    render(<Toolbar />);
    fireEvent.click(screen.getByTestId('toolbar-toggle-preview'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('toggle sidebar end-to-end: command flips appStore state, aria-pressed reflects it', () => {
    useCommandStore.getState().register('view.toggleSidebar', () => {
      useAppStore.getState().toggleSidebar();
    });
    render(<Toolbar />);
    const btn = screen.getByTestId('toolbar-toggle-sidebar');
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    act(() => {
      fireEvent.click(btn);
    });
    expect(useAppStore.getState().sidebarVisible).toBe(false);
    expect(btn).toHaveAttribute('aria-pressed', 'false');
  });

  it('formatting buttons dispatch their command ids', () => {
    const bold = vi.fn();
    const italic = vi.fn();
    const listU = vi.fn();
    const listO = vi.fn();
    const code = vi.fn();
    const link = vi.fn();
    useCommandStore.getState().register('editor.bold', bold);
    useCommandStore.getState().register('editor.italic', italic);
    useCommandStore.getState().register('editor.list.unordered', listU);
    useCommandStore.getState().register('editor.list.ordered', listO);
    useCommandStore.getState().register('editor.code', code);
    useCommandStore.getState().register('editor.link', link);
    render(<Toolbar />);
    fireEvent.click(screen.getByLabelText('Bold'));
    fireEvent.click(screen.getByLabelText('Italic'));
    fireEvent.click(screen.getByLabelText('Unordered list'));
    fireEvent.click(screen.getByLabelText('Ordered list'));
    fireEvent.click(screen.getByLabelText('Inline code'));
    fireEvent.click(screen.getByLabelText('Insert link'));
    expect(bold).toHaveBeenCalledTimes(1);
    expect(italic).toHaveBeenCalledTimes(1);
    expect(listU).toHaveBeenCalledTimes(1);
    expect(listO).toHaveBeenCalledTimes(1);
    expect(code).toHaveBeenCalledTimes(1);
    expect(link).toHaveBeenCalledTimes(1);
  });
});
