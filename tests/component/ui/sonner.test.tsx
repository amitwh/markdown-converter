import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from '@/components/theme-provider';

describe('Toaster', () => {
  it('renders inside ThemeProvider without crashing', () => {
    const { container } = render(
      <ThemeProvider defaultTheme="light" attribute="class">
        <Toaster />
      </ThemeProvider>
    );
    // The Toaster portal is mounted at body level, so the container may be empty
    // but the test should not throw
    expect(container).toBeDefined();
  });
});
