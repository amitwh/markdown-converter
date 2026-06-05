import '@testing-library/jest-dom/vitest';

// Mock window.electronAPI for tests
declare global {
  interface Window {
    electronAPI: any;
  }
}

if (typeof window !== 'undefined' && !window.electronAPI) {
  window.electronAPI = {};
}

// Mock matchMedia for next-themes (jsdom doesn't have it)
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    }),
  });
}
