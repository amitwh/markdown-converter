import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '@/components/ui/button';

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    let count = 0;
    render(<Button onClick={() => count++}>+</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(count).toBe(1);
  });

  it('renders the brand variant with primary styling', () => {
    render(<Button variant="default">Brand</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-primary');
  });
});