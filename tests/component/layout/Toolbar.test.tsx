import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Toolbar } from '@/components/layout/Toolbar';

describe('Toolbar', () => {
  it('renders formatting buttons', () => {
    render(<Toolbar />);
    expect(screen.getByRole('button', { name: /bold/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /italic/i })).toBeInTheDocument();
  });
});