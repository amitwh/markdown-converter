import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WritingAnalyticsDialog } from '@/components/modals/WritingAnalyticsDialog';
import { useAppStore } from '@/stores/app-store';
import { useEditorStore } from '@/stores/editor-store';
import { useSettingsStore } from '@/stores/settings-store';

describe('WritingAnalyticsDialog', () => {
  beforeEach(() => {
    // Reset stores
    useAppStore.setState({ modal: { kind: 'writing-analytics' } } as any);
    useSettingsStore.setState({ dailyGoal: 10 } as any);
    useEditorStore.setState({
      activeId: 'test-id',
      buffers: new Map([
        [
          'test-id',
          {
            id: 'test-id',
            path: 'test.md',
            content: 'The quick brown fox jumps over the lazy dog. A smart programmer writes code.',
            dirty: false,
          },
        ],
      ]),
    } as any);
  });

  it('renders title and descriptions', () => {
    render(<WritingAnalyticsDialog />);
    expect(screen.getByText(/writing analytics/i)).toBeInTheDocument();
    expect(screen.getByText(/real-time readability/i)).toBeInTheDocument();
  });

  it('computes metrics from editor content correctly', () => {
    render(<WritingAnalyticsDialog />);
    // Content has 14 words: "The quick brown fox jumps over the lazy dog. A smart programmer writes code."
    // Sentences: 2
    // Paragraphs: 1
    expect(screen.getByText('14')).toBeInTheDocument(); // Words count
    expect(screen.getByText('2')).toBeInTheDocument(); // Sentences count
    expect(screen.getByText('1')).toBeInTheDocument(); // Paragraphs count
  });

  it('updates daily word goal when input changes', async () => {
    render(<WritingAnalyticsDialog />);
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(input.value).toBe('10');

    // Change target goal to 500
    fireEvent.change(input, { target: { value: '500' } });
    expect(useSettingsStore.getState().dailyGoal).toBe(500);
  });

  it('displays word frequency cloud tags', () => {
    render(<WritingAnalyticsDialog />);
    // "quick", "brown", "fox", "jumps", "lazy", "dog", "smart", "programmer", "writes", "code"
    // (should exclude stop words like "the", "a", "over")
    expect(screen.getByText('quick')).toBeInTheDocument();
    expect(screen.getByText('lazy')).toBeInTheDocument();
    expect(screen.getByText('programmer')).toBeInTheDocument();
    expect(screen.queryByText('over')).toBeNull(); // stop word
  });

  it('closes when close button is clicked', async () => {
    render(<WritingAnalyticsDialog />);
    const closeButtons = await screen.findAllByRole('button', { name: /close/i });
    const close = closeButtons[0];
    await userEvent.click(close);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
