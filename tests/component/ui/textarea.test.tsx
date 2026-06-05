import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Textarea } from '@/components/ui/textarea';

describe('Textarea', () => {
  it('renders a multi-line input', () => {
    render(<Textarea aria-label="notes" defaultValue="hello" />);
    const ta = screen.getByLabelText(/notes/i);
    expect(ta.tagName).toBe('TEXTAREA');
    expect(ta).toHaveValue('hello');
  });
});