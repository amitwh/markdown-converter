import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@/components/theme-provider';
import { ThemeToggle } from '@/components/theme-toggle';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark', 'light');
  });

  it('toggles between light and dark when clicked', async () => {
    render(
      <ThemeProvider defaultTheme="light" attribute="class">
        <ThemeToggle />
      </ThemeProvider>
    );
    const btn = screen.getByRole('button');
    expect(btn).toHaveAccessibleName(/toggle theme/i);
    await userEvent.click(btn);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    await userEvent.click(btn);
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });
});