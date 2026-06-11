import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AsciiGeneratorDialog } from '@/components/modals/AsciiGeneratorDialog';

vi.mock('@/lib/figlet', () => ({
  figletText: vi.fn().mockResolvedValue(' MOCKED ASCII '),
  FIGLET_FONTS: ['Standard', 'Big', 'Small', 'Banner', 'Doom', 'Slant', 'Block'],
}));

describe('AsciiGeneratorDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with an input textarea and font selector', () => {
    render(<AsciiGeneratorDialog />);
    expect(screen.getByText(/ascii generator/i)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /font/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /text/i })).toBeInTheDocument();
  });

  it('renders the ASCII output as the user types', async () => {
    render(<AsciiGeneratorDialog />);
    const input = screen.getByRole('textbox', { name: /text/i });
    await userEvent.type(input, 'hi');
    const pre = await screen.findByTestId('ascii-output');
    expect(pre).toHaveTextContent('MOCKED ASCII');
  });

  it('shows a copy button next to the output', () => {
    render(<AsciiGeneratorDialog />);
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument();
  });
});
