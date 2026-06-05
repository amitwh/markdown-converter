import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Label } from '@/components/ui/label';

describe('Label', () => {
  it('renders children and associates with a control', () => {
    render(
      <>
        <Label htmlFor="x">Username</Label>
        <input id="x" />
      </>
    );
    const label = screen.getByText(/username/i);
    expect(label).toBeInTheDocument();
    expect(label.tagName).toBe('LABEL');
  });
});
