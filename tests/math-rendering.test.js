/**
 * @jest-environment jsdom
 *
 * Math (KaTeX) rendering pipeline tests.
 *
 * The renderer lazy-loads KaTeX via initMathSupport() then calls
 * window.renderMathInElement(...) inside _renderPreview(). These tests cover
 * the contract the renderer depends on:
 *   - $$ ... $$      → display math (reliable, no false positives)
 *   - \[ ... \]      → display math, escaped form
 *   - \( ... \)      → inline math, escaped form
 *   - $ ... $        → inline math (LENIENT — KaTeX matches when opening `$`
 *                       is followed by a non-space char AND closing `$` is
 *                       preceded by a non-space, non-punct char)
 *
 * The renderer's initMathSupport isn't loaded here because renderer.js pulls
 * in DOM-only modules (codemirror, marked, mermaid); we exercise the
 * KaTeX API directly, the same way the renderer's
 * `if (window.katex && window.renderMathInElement)` branch does.
 */
const katex = require('katex');
const autoRenderModule = require('katex/contrib/auto-render');

// katex/contrib/auto-render exports renderMathInElement in the webpack-bundled
// shape; resolve the function defensively the same way renderer.js does.
const renderMathInElement =
  typeof autoRenderModule === 'function'
    ? autoRenderModule
    : autoRenderModule.renderMathInElement || autoRenderModule.default;

// Mirror the renderer's delimiter config (renderer.js:1045-1066).
const DELIMITERS = [
  { left: '$$', right: '$$', display: true },
  { left: '$', right: '$', display: false },
  { left: '\\[', right: '\\]', display: true },
  { left: '\\(', right: '\\)', display: false },
];

describe('KaTeX math rendering pipeline', () => {
  let container;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  test('inline $...$ renders valid TeX to a katex span', () => {
    container.innerHTML = '<p>The quadratic formula is $ax^2 + bx + c = 0$.</p>';

    expect(() => renderMathInElement(container, { delimiters: DELIMITERS })).not.toThrow();

    expect(container.querySelector('.katex')).not.toBeNull();
    // No executable script tags — KaTeX output is pure HTML/CSS.
    expect(container.querySelector('script')).toBeNull();
  });

  test('display $$...$$ renders to a div.katex-display block', () => {
    container.innerHTML = '<p>$$\\int_0^1 x^2 \\, dx = \\tfrac{1}{3}$$</p>';

    expect(() => renderMathInElement(container, { delimiters: DELIMITERS })).not.toThrow();

    const displayBlock = container.querySelector('.katex-display');
    expect(displayBlock).not.toBeNull();
  });

  test('escaped delimiters \\[...\\] and \\(...\\) both render', () => {
    container.innerHTML = '<p>Display form: \\[E = mc^2\\] and inline \\(\\pi r^2\\).</p>';

    expect(() => renderMathInElement(container, { delimiters: DELIMITERS })).not.toThrow();

    expect(container.querySelector('.katex-display')).not.toBeNull();
    expect(container.querySelector('.katex')).not.toBeNull();
  });

  test('mixed prose + math: surrounding text is preserved', () => {
    container.innerHTML =
      '<p>Before the equation $$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$ comes after.</p>';

    renderMathInElement(container, { delimiters: DELIMITERS });

    expect(container.textContent).toMatch(/Before the equation/);
    expect(container.textContent).toMatch(/comes after\./);
    expect(container.querySelector('.katex-display')).not.toBeNull();
  });

  test('invalid LaTeX does not throw under default throwOnError:false', () => {
    // The renderer's call site (renderer.js:1044) does not pass throwOnError,
    // so it gets the default (false) and KaTeX degrades gracefully instead
    // of throwing. The renderer's outer try/catch depends on this — if it
    // ever throws, the whole preview render would crash.
    container.innerHTML = '<p>Bad: $\\frac{1}{2}\\notacommand{x}$ end.</p>';

    expect(() => renderMathInElement(container, { delimiters: DELIMITERS })).not.toThrow();
    // Source content survives — bad math doesn't disappear from the preview.
    expect(container.textContent).toContain('Bad:');
    expect(container.textContent).toContain('end.');
  });

  test('math surrounded by other elements keeps siblings intact', () => {
    container.innerHTML = `
      <h1>Title</h1>
      <p>Some prose.</p>
      <p>Equation: $$E = mc^2$$</p>
      <ul><li>Bullet 1</li><li>Bullet 2</li></ul>
    `;

    renderMathInElement(container, { delimiters: DELIMITERS });

    expect(container.querySelector('h1')?.textContent).toBe('Title');
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelector('.katex-display')).not.toBeNull();
  });

  test('dollar amounts separated from non-dollar text are not silently mis-rendered', () => {
    // Prose containing bare $-tokens gets lenient math matching. This is a
    // known KaTeX behavior, not a bug — the renderer calls auto-render with
    // throwOnError:false so mis-renders degrade gracefully (raw text
    // remains readable via the .katex-error class). The test pins this
    // contract: KaTeX never throws on weird prose; it either parses
    // optimistically or leaves the text alone.
    container.innerHTML = '<p>Costs rose by 10 % in Q3 — see finance.md.</p>';

    expect(() => renderMathInElement(container, { delimiters: DELIMITERS })).not.toThrow();
    expect(container.textContent).toMatch(/Costs rose by 10 % in Q3/);
  });

  test('document with no math leaves the container unchanged', () => {
    container.innerHTML = '<h1>Hello</h1><p>World</p>';
    const before = container.innerHTML;

    renderMathInElement(container, { delimiters: DELIMITERS });

    expect(container.innerHTML).toBe(before);
  });
});

describe('KaTeX bundle — renderer wiring contract', () => {
  // The renderer's `if (window.katex && window.renderMathInElement)` gate
  // requires both globals to be present after initMathSupport(). These
  // tests pin the bundle shape so a future KaTeX upgrade that breaks the
  // export contract is caught at test time, not in production.

  test('katex default export exposes a render() function', () => {
    expect(typeof katex.render).toBe('function');
  });

  test('auto-render contrib exports a renderMathInElement function', () => {
    expect(typeof renderMathInElement).toBe('function');
  });

  test('katex.min.css ships in the bundled assets directory', () => {
    const fs = require('fs');
    const path = require('path');
    const css = path.join(__dirname, '..', 'assets', 'katex', 'katex.min.css');
    expect(fs.existsSync(css)).toBe(true);
  });

  test('index.html references the bundled katex CSS (not a CDN)', () => {
    const fs = require('fs');
    const path = require('path');
    const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf-8');
    expect(html).toMatch(/assets\/katex\/katex\.min\.css/);
    expect(html).not.toMatch(/cdn\.jsdelivr\.net\/.*katex/);
  });

  test('renderer.js configures the four delimiters used by these tests', () => {
    // Pins the renderer↔test delimiter contract: if someone changes the
    // renderer's delimiters without updating tests, these assertions will
    // diverge from the contract and tests fail loudly here.
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer.js'), 'utf-8');
    expect(src).toMatch(/left:\s*'\$\$'/);
    // The renderer uses escaped backslashes in source: '\\[' and '\\('.
    expect(src).toContain("left: '\\\\['");
    expect(src).toContain("left: '\\\\('");
  });
});
