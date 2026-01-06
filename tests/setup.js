/**
 * Jest Test Setup
 * Provides mocks and utilities for PanConverter tests
 */

// Mock window.electronAPI for renderer tests
global.window = global.window || {};
global.window.electronAPI = {
  send: jest.fn(),
  on: jest.fn(() => jest.fn()), // Returns cleanup function
  once: jest.fn(),
  invoke: jest.fn(() => Promise.resolve(null)),
  removeAllListeners: jest.fn(),
  file: {
    save: jest.fn(),
    saveCurrent: jest.fn(),
    setCurrent: jest.fn(),
    saveRecent: jest.fn(),
    clearRecent: jest.fn(),
    rendererReady: jest.fn()
  },
  theme: {
    get: jest.fn()
  },
  print: {
    doPrint: jest.fn()
  },
  export: {
    withOptions: jest.fn(),
    spreadsheet: jest.fn()
  },
  batch: {
    convert: jest.fn(),
    selectFolder: jest.fn()
  },
  converter: {
    convert: jest.fn(),
    convertBatch: jest.fn()
  },
  headerFooter: {
    getSettings: jest.fn(),
    saveSettings: jest.fn(),
    browseLogo: jest.fn(),
    saveLogo: jest.fn(),
    clearLogo: jest.fn()
  },
  page: {
    getSettings: jest.fn(),
    updateSettings: jest.fn(),
    setCustomStartPage: jest.fn()
  },
  pdf: {
    processOperation: jest.fn(),
    getPageCount: jest.fn(),
    selectFolder: jest.fn()
  }
};

// Mock marked library
global.window.marked = {
  parse: jest.fn((text) => `<p>${text}</p>`),
  setOptions: jest.fn()
};

// Mock DOMPurify
global.window.DOMPurify = {
  sanitize: jest.fn((html) => html)
};

// Mock highlight.js
global.window.hljs = {
  highlight: jest.fn((code, options) => ({ value: code })),
  highlightAuto: jest.fn((code) => ({ value: code })),
  getLanguage: jest.fn(() => true)
};

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn()
};
global.localStorage = localStorageMock;

// Console spy to catch unintended console logs in tests
const originalConsoleError = console.error;
console.error = (...args) => {
  // Allow certain expected errors
  const message = args[0]?.toString() || '';
  if (message.includes('Warning:') || message.includes('React')) {
    return;
  }
  originalConsoleError.apply(console, args);
};

// Cleanup after each test
afterEach(() => {
  jest.clearAllMocks();
});
