import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReplPanel } from '@/components/tools/ReplPanel';
import { useSettingsStore } from '@/stores/settings-store';

describe('ReplPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState({ ...useSettingsStore.getInitialState(), replOpen: true });
  });

  it('renders the textarea and preview when replOpen is true', () => {
    render(<ReplPanel />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByText(/repl/i)).toBeInTheDocument();
  });

  it('does not render when replOpen is false', () => {
    useSettingsStore.setState({ ...useSettingsStore.getInitialState(), replOpen: false });
    const { container } = render(<ReplPanel />);
    expect(container.firstChild).toBeNull();
  });

  it('typing in the textarea updates the preview', async () => {
    render(<ReplPanel />);
    const ta = screen.getByRole('textbox');
    await userEvent.clear(ta);
    await userEvent.type(ta, '# Hello');
    // Wait for 300ms debounce to fire
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.getByRole('heading', { name: /hello/i })).toBeInTheDocument();
  });
});