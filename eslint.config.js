/**
 * ESLint Configuration for PanConverter
 * Uses flat config format (ESLint 9+)
 */

module.exports = [
  {
    // Global ignores
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      '*.min.js'
    ]
  },
  {
    // JavaScript files
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Node.js
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        // Browser
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        alert: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        HTMLElement: 'readonly',
        MutationObserver: 'readonly',
        // Electron
        electronAPI: 'readonly',
        // Libraries
        marked: 'readonly',
        DOMPurify: 'readonly',
        hljs: 'readonly',
        mermaid: 'readonly',
        // Jest
        jest: 'readonly',
        describe: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly'
      }
    },
    rules: {
      // Error prevention
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-console': 'off', // Allow console for Electron apps

      // Code quality
      'eqeqeq': ['warn', 'always'],
      'no-var': 'warn',
      'prefer-const': 'warn',

      // Style (handled by Prettier)
      'semi': 'off',
      'quotes': 'off',
      'indent': 'off',

      // Async handling
      'no-async-promise-executor': 'warn',
      'require-await': 'off',

      // Security
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error'
    }
  }
];
