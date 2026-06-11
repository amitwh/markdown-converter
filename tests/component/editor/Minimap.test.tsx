import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Minimap } from '@/components/editor/Minimap';

describe('Minimap', () => {
  it('renders lines of content as shrunk text', () => {
    const content = 'line 1\nline 2\nline 3';
    render(<Minimap content={content} />);
    const lines = screen.getAllByTestId('minimap-line');
    expect(lines).toHaveLength(3);
  });

  it('renders a viewport indicator', () => {
    render(<Minimap content={'line 1\nline 2\nline 3'} scrollRatio={0.5} visibleRatio={0.5} />);
    const indicator = screen.getByTestId('minimap-viewport');
    expect(indicator).toBeInTheDocument();
  });
});
