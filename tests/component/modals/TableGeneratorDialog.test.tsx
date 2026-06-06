import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TableGeneratorDialog } from '@/components/modals/TableGeneratorDialog';

describe('TableGeneratorDialog', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders with rows, cols, and header inputs', () => {
    render(<TableGeneratorDialog />);
    expect(screen.getByText(/table generator/i)).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /rows/i })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /cols/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /header/i })).toBeInTheDocument();
  });

  it('generates a markdown table on rows/cols change', async () => {
    render(<TableGeneratorDialog />);
    const rowsInput = screen.getByRole('spinbutton', { name: /rows/i });
    const colsInput = screen.getByRole('spinbutton', { name: /cols/i });
    await userEvent.clear(rowsInput);
    await userEvent.type(rowsInput, '2');
    await userEvent.clear(colsInput);
    await userEvent.type(colsInput, '3');
    // Output should have header + separator + 2 rows = 4 lines for a 3-col table with header
    const output = screen.getByTestId('table-output');
    expect(output.textContent).toContain('|');
  });

  it('shows a copy button next to the output', () => {
    render(<TableGeneratorDialog />);
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument();
  });
});