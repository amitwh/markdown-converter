import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MermaidLazy } from '@/components/preview/MermaidLazy';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue('<svg></svg>'),
  },
}));

describe('MermaidLazy', () => {
  it('renders an svg after mermaid resolves', async () => {
    render(<MermaidLazy code="graph TD; A-->B" />);
    await waitFor(() => {
      expect(screen.getByTestId('mermaid-output').innerHTML).toContain('<svg');
    });
  });

  it('shows an error message if mermaid throws', async () => {
    const mermaid = (await import('mermaid')).default as any;
    mermaid.render.mockRejectedValueOnce(new Error('mermaid failed'));
    render(<MermaidLazy code="bad code" />);
    await waitFor(() => {
      expect(screen.getByText(/mermaid failed/i)).toBeInTheDocument();
    });
  });
});
