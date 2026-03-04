// CodeMirror 6 wrapper module
// Provides createEditor() and getLanguageExtension() for the rest of the app.

const {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  drawSelection,
} = require('@codemirror/view');
const { EditorState } = require('@codemirror/state');
const { markdown, markdownLanguage } = require('@codemirror/lang-markdown');
const { javascript } = require('@codemirror/lang-javascript');
const { html } = require('@codemirror/lang-html');
const { css } = require('@codemirror/lang-css');
const { json } = require('@codemirror/lang-json');
const { python } = require('@codemirror/lang-python');
const {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} = require('@codemirror/commands');
const {
  searchKeymap,
  highlightSelectionMatches,
} = require('@codemirror/search');
const {
  autocompletion,
  completionKeymap,
} = require('@codemirror/autocomplete');
const {
  bracketMatching,
  foldGutter,
  indentOnInput,
} = require('@codemirror/language');
const { oneDark } = require('@codemirror/theme-one-dark');

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
 * @returns {EditorView} the created editor view
 */
function createEditor(parentElement, options = {}) {
  const {
    content = '',
    onChange = () => {},
    onUpdate = null,
    isDark = false,
    showLineNumbers = true,
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
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
      ...completionKeymap,
      indentWithTab,
    ]),
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
  const languages = {
    javascript,
    js: javascript,
    html,
    css,
    json,
    python,
    py: python,
    markdown: () => markdown({ base: markdownLanguage }),
  };

  const factory = languages[lang];
  return factory ? factory() : markdown({ base: markdownLanguage });
}

module.exports = { createEditor, getLanguageExtension };
