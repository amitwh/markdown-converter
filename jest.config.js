/**
 * Jest Configuration for PanConverter
 * @version 2.2.0
 */

module.exports = {
  // Test environment
  testEnvironment: 'jsdom',

  // Root directory
  rootDir: '.',

  // Test file patterns — scoped to ./tests/ only so dist/ artifacts like
  // .snap packages don't get matched as test suites.
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/tests/**/*.spec.js'
  ],

  // Ignore build outputs so .snap packages and bundled .asar contents
  // never enter jest's file discovery.
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/\\.git/'
  ],
  modulePathIgnorePatterns: [
    '/node_modules/',
    '/dist/'
  ],

  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/main/**', // Main process needs electron-mock
    '!src/preload.js', // Electron preload requires contextBridge
    '!**/node_modules/**'
  ],

  // Coverage thresholds (raised with expanded test suite)
  coverageThreshold: {
    global: {
      branches: 10,
      functions: 15,
      lines: 15,
      statements: 15
    }
  },

  // Transform settings (no transpilation needed for vanilla JS)
  transform: {},

  // Module paths
  moduleDirectories: ['node_modules', 'src'],

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/'
  ],

  // Verbose output
  verbose: true,

  // Clear mocks between tests
  clearMocks: true,

  // Reset modules between tests
  resetModules: true
};
