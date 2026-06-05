import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBar } from '@/components/layout/StatusBar';

describe('StatusBar', () => {
  it('renders zero word count when no file is open', () => {
    render(<StatusBar />);
    expect(screen.getByText(/0 words/i)).toBeInTheDocument();
  });
});