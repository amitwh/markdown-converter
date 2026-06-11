import '@testing-library/jest-dom/vitest';

// Mock window.electronAPI for tests
declare global {
  interface Window {
    electronAPI: any;
  }
}

if (typeof window !== 'undefined') {
  window.electronAPI = window.electronAPI || {};
  if (!window.electronAPI.invoke) {
    window.electronAPI.invoke = async () => null;
  }
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

// Mock react-resizable-panels for jsdom environment
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'innerWidth', { writable: true, value: 1920 });
  Object.defineProperty(window, 'innerHeight', { writable: true, value: 1080 });
}

// Polyfill ResizeObserver for @radix-ui/react-use-size
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = ResizeObserver;
}

// Polyfill hasPointerCapture for @radix-ui/react-select (jsdom doesn't implement it)
if (typeof window !== 'undefined' && !Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = function () {
    return false;
  };
}

// Polyfill scrollIntoView for @radix-ui/react-select (jsdom doesn't implement it)
if (typeof window !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {};
}
