import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TabBar } from '@/components/layout/TabBar';

describe('TabBar', () => {
  it('renders an empty state when no tabs are open', () => {
    render(<TabBar />);
    expect(screen.getByText(/no files open/i)).toBeInTheDocument();
  });
});