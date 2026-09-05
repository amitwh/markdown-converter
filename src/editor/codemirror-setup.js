// CodeMirror 6 wrapper module
// Provides createEditor() and getLanguageExtension() for the rest of the app.

const {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  drawSelection,
} = require('@codemirror/view');
const { EditorState, Compartment } = require('@codemirror/state');
const { markdown, markdownLanguage } = require('@codemirror/lang-markdown');
// Language extensions loaded lazily on first use
let _javascript, _html, _css, _json, _python;
const { defaultKeymap, history, historyKeymap, indentWithTab } = require('@codemirror/commands');
const { searchKeymap, highlightSelectionMatches } = require('@codemirror/search');
const { autocompletion, completionKeymap } = require('@codemirror/autocomplete');
const { bracketMatching, foldGutter, indentOnInput } = require('@codemirror/language');
const { oneDark } = require('@codemirror/theme-one-dark');

// Compartments allow toggling features (vim mode) on a live editor without
// recreating the view — CodeMirror 6's intended mechanism for reconfiguration.
const vimCompartment = new Compartment();
// Vim is loaded lazily: most users never enable it, and the module is heavy.
let _vimExtension = null;
function getVimExtension() {
  if (!_vimExtension) {
    _vimExtension = require('@replit/codemirror-vim').vim();
  }
  return _vimExtension;
}

/**
 * Toggle vim keybindings on an editor created by createEditor.
 * @param {EditorView} view
 * @param {boolean} enabled
 */
function setVimMode(view, enabled) {
  if (!view) return;
  view.dispatch({
    effects: vimCompartment.reconfigure(enabled ? getVimExtension() : []),
  });
}

// Custom theme for JetBrains Mono font
const jetBrainsMonoTheme = EditorView.theme({
  '&': {
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Monaco, 'Courier New', monospace",
  },
  '.cm-content': {
    fontFamily: 'inherit',
  },
  '.cm-scroller': {
    fontFamily: 'inherit',
  },
});

/**
 * Build the Tab keymap entry that expands snippets before falling through to
 * indent. `getExpansion(prefix)` is synchronous and returns the replacement
 * text (or null to decline), letting the host keep its snippets in a Map.
 */
function snippetTabKeymap(getExpansion) {
  return {
    key: 'Tab',
    run: (view) => {
      if (typeof getExpansion !== 'function') return false;
      const { head } = view.state.selection.main;
      const line = view.state.doc.lineAt(head);
      // Word-before-cursor: letters, digits, underscore and hyphen
      const before = line.text.slice(0, head - line.from);
      const match = /[\w-]+$/.exec(before);
      if (!match) return false;
      const expansion = getExpansion(match[0].toLowerCase());
      if (typeof expansion !== 'string') return false;
      view.dispatch({
        changes: {
          from: head - match[0].length,
          to: head,
          insert: expansion,
        },
        selection: { anchor: head - match[0].length + expansion.length },
      });
      return true;
    },
  };
}

/**
 * Create a CodeMirror 6 editor instance.
 *
 * @param {HTMLElement} parentElement - DOM element to mount the editor in
 * @param {Object}  options
 * @param {string}  options.content          - initial document content (default '')
 * @param {Function} options.onChange        - called with new content string on every doc change
 * @param {Function} options.onUpdate       - called with the EditorView on every update (selection, doc change, etc.)
 * @param {boolean} options.isDark           - apply oneDark theme when true (default false)
 * @param {boolean} options.showLineNumbers  - show line-number gutter (default true)
 * @param {boolean} options.vimMode          - start with vim keybindings (default false; toggle later via setVimMode)
 * @param {Function} options.getTabExpansion - (prefix)=>string|null; Tab expands a matching snippet (default null)
 * @returns {EditorView} the created editor view
 */
function createEditor(parentElement, options = {}) {
  console.log(
    '[createEditor] Called with parentElement:',
    parentElement?.id,
    'dimensions:',
    parentElement?.clientWidth,
    'x',
    parentElement?.clientHeight
  );
  if (!parentElement) {
    console.error('[createEditor] ERROR: parentElement is null or undefined!');
    return null;
  }
  const {
    content = '',
    onChange = () => {},
    onUpdate = null,
    isDark = false,
    showLineNumbers = true,
    vimMode = false,
    getTabExpansion = null,
  } = options;

  const extensions = [
    markdown({ base: markdownLanguage }),
    history(),
    drawSelection(),
    highlightActiveLine(),
    bracketMatching(),
    indentOnInput(),
    highlightSelectionMatches(),
    autocompletion(),
    foldGutter(),
    jetBrainsMonoTheme,
    // Snippet Tab expansion must precede indentWithTab so it wins when matched
    keymap.of([
      ...(getTabExpansion ? [snippetTabKeymap(getTabExpansion)] : []),
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
      ...completionKeymap,
      indentWithTab,
    ]),
    vimCompartment.of(vimMode ? getVimExtension() : []),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChange(update.state.doc.toString());
      }
      if (onUpdate && (update.docChanged || update.selectionSet)) {
        onUpdate(update.view);
      }
    }),
    EditorView.lineWrapping,
  ];

  if (showLineNumbers) {
    extensions.push(lineNumbers());
  }

  if (isDark) {
    extensions.push(oneDark);
  }

  const state = EditorState.create({ doc: content, extensions });
  const view = new EditorView({ state, parent: parentElement });
  return view;
}

/**
 * Return the appropriate CodeMirror language extension for a given language name.
 *
 * Supported values: javascript, js, html, css, json, python, py, markdown.
 * Falls back to markdown when the language is unrecognised.
 *
 * @param {string} lang - language identifier
 * @returns {Extension} CodeMirror language extension
 */
function getLanguageExtension(lang) {
  const loaders = {
    javascript: () => {
      if (!_javascript) _javascript = require('@codemirror/lang-javascript').javascript;
      return _javascript();
    },
    html: () => {
      if (!_html) _html = require('@codemirror/lang-html').html;
      return _html();
    },
    css: () => {
      if (!_css) _css = require('@codemirror/lang-css').css;
      return _css();
    },
    json: () => {
      if (!_json) _json = require('@codemirror/lang-json').json;
      return _json();
    },
    python: () => {
      if (!_python) _python = require('@codemirror/lang-python').python;
      return _python();
    },
    markdown: () => markdown({ base: markdownLanguage }),
  };
  loaders.js = loaders.javascript;
  loaders.py = loaders.python;

  const loader = loaders[lang];
  return loader ? loader() : markdown({ base: markdownLanguage });
}

module.exports = { createEditor, getLanguageExtension, setVimMode, snippetTabKeymap };
