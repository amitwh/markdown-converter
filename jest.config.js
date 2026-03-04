/**
 * Jest Configuration for PanConverter
 * @version 2.2.0
 */

module.exports = {
  // Test environment
  testEnvironment: 'jsdom',

  // Root directory
  rootDir: '.',

  // Test file patterns
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js'
  ],

  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/main.js', // Main process needs electron-mock
    '!src/renderer.js', // Large renderer file with duplicate declarations
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
