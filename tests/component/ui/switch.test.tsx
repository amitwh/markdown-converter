import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Switch } from '@/components/ui/switch';

describe('Switch', () => {
  it('toggles checked state', async () => {
    const onCheckedChange = vi.fn();
    render(<Switch aria-label="airplane" onCheckedChange={onCheckedChange} />);
    await userEvent.click(screen.getByRole('switch', { name: /airplane/i }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });
});
