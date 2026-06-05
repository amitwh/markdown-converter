import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Slider } from '@/components/ui/slider';

describe('Slider', () => {
  it('renders with default value', () => {
    render(<Slider aria-label="volume" defaultValue={[50]} onValueChange={vi.fn()} />);
    expect(screen.getByRole('slider', { name: /volume/i })).toHaveAttribute('aria-valuenow', '50');
  });
});
