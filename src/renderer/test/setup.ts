import '@testing-library/jest-dom/vitest';

import { vi } from 'vitest';

// Mock window.electronAPI for tests
declare global {
  interface Window {
    electronAPI: any;
  }
}

if (typeof window !== 'undefined') {
  window.electronAPI = {
    send: vi.fn(),
    on: vi.fn(() => vi.fn()),
    once: vi.fn(),
    invoke: vi.fn(() => Promise.resolve(null)),
    removeAllListeners: vi.fn(),
    getAppVersion: vi.fn(() => Promise.resolve('5.0.1')),
    file: {
      save: vi.fn(),
      saveCurrent: vi.fn(),
      setCurrent: vi.fn(),
      saveRecent: vi.fn(),
      clearRecent: vi.fn(),
      rendererReady: vi.fn(),
      read: vi.fn(() => Promise.resolve('')),
      write: vi.fn(() => Promise.resolve()),
      delete: vi.fn(() => Promise.resolve()),
      ensureDir: vi.fn(() => Promise.resolve()),
      exists: vi.fn(() => Promise.resolve(false)),
      isDirectory: vi.fn(() => Promise.resolve(false)),
      copy: vi.fn(() => Promise.resolve()),
      move: vi.fn(() => Promise.resolve()),
      list: vi.fn(() => Promise.resolve({ ok: true, data: [] })),
      pickFolder: vi.fn(() => Promise.resolve({ ok: true, data: null })),
      pickFile: vi.fn(() => Promise.resolve({ ok: true, data: null })),
    },
    theme: {
      get: vi.fn(),
    },
    print: {
      doPrint: vi.fn(),
      show: vi.fn(),
    },
    export: {
      withOptions: vi.fn(),
      spreadsheet: vi.fn(),
    },
    batch: {
      convert: vi.fn(),
      selectFolder: vi.fn(),
    },
    converter: {
      convert: vi.fn(),
      convertBatch: vi.fn(),
    },
    headerFooter: {
      getSettings: vi.fn(),
      saveSettings: vi.fn(),
      browseLogo: vi.fn(),
      saveLogo: vi.fn(),
      clearLogo: vi.fn(),
    },
    page: {
      getSettings: vi.fn(),
      updateSettings: vi.fn(),
      setCustomStartPage: vi.fn(),
    },
    pdf: {
      processOperation: vi.fn(),
      getPageCount: vi.fn(),
      selectFolder: vi.fn(),
    },
    git: {
      status: vi.fn(() => Promise.resolve([])),
      stage: vi.fn(),
      commit: vi.fn(),
    },
    updater: {
      check: vi.fn(),
      install: vi.fn(),
      getState: vi.fn(),
      onStatus: vi.fn(() => vi.fn()),
    },
    crash: {
      read: vi.fn(),
      openDir: vi.fn(),
      delete: vi.fn(),
    },
  };
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

// Polyfill DOMMatrix for pdfjs-dist (jsdom doesn't implement it)
if (typeof window !== 'undefined' && !(window as any).DOMMatrix) {
  class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
  }
  (window as any).DOMMatrix = DOMMatrix;
  (global as any).DOMMatrix = DOMMatrix;
}
