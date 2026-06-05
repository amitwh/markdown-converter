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
