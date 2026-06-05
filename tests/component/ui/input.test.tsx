import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from '@/components/ui/input';

describe('Input', () => {
  it('renders and accepts typing', async () => {
    const onChange = vi.fn();
    render(<Input aria-label="name" onChange={onChange} />);
    const input = screen.getByLabelText(/name/i);
    await userEvent.type(input, 'a');
    expect(onChange).toHaveBeenCalled();
  });
});