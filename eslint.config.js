/**
 * ESLint Configuration for MarkdownConverter
 * Uses flat config format (ESLint 10+); the codebase is CommonJS.
 */

module.exports = [
  {
    // Global ignores
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      '*.min.js',
      '**/*.bundle.js'
    ]
  },
  {
    // JavaScript files
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
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
        prompt: 'readonly',
        confirm: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        HTMLElement: 'readonly',
        MutationObserver: 'readonly',
        TextEncoder: 'readonly',
        FileReader: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        Blob: 'readonly',
        Image: 'readonly',
        DragEvent: 'readonly',
        ClipboardEvent: 'readonly',
        KeyboardEvent: 'readonly',
        MouseEvent: 'readonly',
        NodeList: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        getComputedStyle: 'readonly',
        CSS: 'readonly',
        Element: 'readonly',
        SVGElement: 'readonly',
        XMLSerializer: 'readonly',
        Uint8Array: 'readonly',
        ArrayBuffer: 'readonly',
        queueMicrotask: 'readonly',
        performance: 'readonly',
        structuredClone: 'readonly',
        // Modern Web APIs available in Node 20+ and Chromium
        AbortController: 'readonly',
        TextDecoder: 'readonly',
        TextEncoder: 'readonly',
        // Electron
        electronAPI: 'readonly',
        // Libraries
        marked: 'readonly',
        DOMPurify: 'readonly',
        hljs: 'readonly',
        mermaid: 'readonly',
        // Node.js global object
        global: 'writable',
        // Jest
        jest: 'readonly',
        describe: 'readonly',
        test: 'readonly',
        it: 'readonly',
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
  },
  {
    // The maxGraph editor is ESM (src/flowchart-editor/package.json sets
    // "type": "module"); every other source file stays CommonJS.
    files: ['src/flowchart-editor/**/*.js', 'src/icons/**/*.js'],
    languageOptions: {
      sourceType: 'module'
    }
  }
];
