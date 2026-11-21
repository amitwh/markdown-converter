/**
 * @jest-environment jsdom
 *
 * Tests the standalone ASCII Art Generator window's renderer controller
 * (src/renderer/ascii-controller.js). Loads the real HTML and the real
 * controller script into jsdom, mocks window.electronAPI.generators.ascii,
 * and asserts that:
 *   - The fonts.css <link> uses a src/-relative path (no `..` escape).
 *   - Mode-tab clicks switch the visible mode section.
 *   - Template-button clicks update the preview with the orchestrator's
 *     template:<id> output.
 *   - The pure box renderer wraps text with the requested border style.
 */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'src', 'ascii-generator.html');
const CONTROLLER_PATH = path.join(__dirname, '..', 'src', 'renderer', 'ascii-controller.js');

/**
 * Build the ascii-generator DOM in the jsdom document and execute the
 * controller script in the same realm (window + document globals).
 *
 * The HTML file is parsed by the jsdom document and the controller
 * source is run via `vm.runInThisContext` so its IIFE captures the real
 * `window` and `document` without string interpolation.
 */
function mount() {
  // Parse the HTML body content into the jsdom document. We use the
  // existing testRealm — the controller only inspects IDs that exist in
  // the standalone window's HTML, so a minimal copy is fine.
  const html = fs.readFileSync(HTML_PATH, 'utf-8');
  // Strip <head>/<body> wrappers — jsdom already provides those.
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  document.body.innerHTML = bodyMatch ? bodyMatch[1] : html;

  // Preferences persist to localStorage when the bridge has no options
  // method; clear them so each test starts from the default mode.
  try {
    window.localStorage.clear();
  } catch {
    /* jsdom without storage */
  }

  // Mock the electronAPI bridge before the controller reads it.
  const generateMock = jest.fn(async ({ text, font }) => {
    if (typeof font === 'string' && font.startsWith('template:')) {
      return `<<${font.slice('template:'.length)}>>`;
    }
    return `<<font=${font}::text=${text}>>`;
  });
  const apiMock = {
    listFonts: jest.fn(async () => [
      { id: 'standard', label: 'Standard', kind: 'hand-coded' },
      { id: 'big', label: 'Big', kind: 'hand-coded' },
      { id: 'template:arrow-right', label: 'Template · Arrow Right', kind: 'template' },
    ]),
    generate: generateMock,
    lastFont: jest.fn(async () => null),
    copy: jest.fn(async () => undefined),
    save: jest.fn(async () => ({ canceled: true })),
  };
  window.electronAPI = {
    generators: { ascii: apiMock },
    send: jest.fn(),
  };

  // Execute the controller source in the test realm. The IIFE references
  // `window` and `document` directly, so we wrap it in an outer function
  // that passes the jsdom globals as parameters. Using Function() here is
  // safe: the only interpolated value is the file contents (read from a
  // path we control in the repo), not user input.
  const src = fs.readFileSync(CONTROLLER_PATH, 'utf-8');
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', src)(window, document);

  return { apiMock, generateMock };
}

afterEach(() => {
  jest.clearAllMocks();
});

describe('ascii-generator.html — fonts.css link', () => {
  test('does not escape src/ (no "../" in href)', () => {
    const html = fs.readFileSync(HTML_PATH, 'utf-8');
    const linkRe = /<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/i;
    const match = html.match(linkRe);
    expect(match).not.toBeNull();
    const href = match[1];
    expect(href.startsWith('../')).toBe(false);
    // The standalone window's document base is src/, so fonts.css must be
    // src/-relative (not ../fonts.css).
    expect(href).toBe('fonts.css');
  });
});

describe('ascii-controller: pure box renderer', () => {
  test('wraps text with a single-line border by default', () => {
    mount();
    const { renderBox } = window.ASCIIBoxRenderer;
    const out = renderBox('Hi', 'single', 0);
    expect(out).toBe('┌────┐\n│ Hi │\n└────┘');
  });

  test('honours padding and ascii (+|-) style', () => {
    mount();
    const { renderBox } = window.ASCIIBoxRenderer;
    const out = renderBox('Hi', 'ascii', 1);
    // 1 space pad + 'Hi' + 1 space pad = width 4 inside, +2 borders = 6 wide.
    expect(out).toBe('+------+\n|  Hi  |\n+------+');
  });
});

describe('ascii-controller: mode-tab switching', () => {
  test('clicking the Box tab reveals box-mode and hides the others', async () => {
    mount();
    await window.ASCIIController.bootstrap();
    const boxTab = document.querySelector('.mode-tab[data-mode="box"]');
    boxTab.click();

    expect(boxTab.classList.contains('active')).toBe(true);
    expect(document.getElementById('box-mode').classList.contains('active')).toBe(true);
    expect(document.getElementById('text-mode').classList.contains('active')).toBe(false);
    expect(document.getElementById('templates-mode').classList.contains('active')).toBe(false);
  });

  test('clicking the Templates tab reveals templates-mode', async () => {
    mount();
    await window.ASCIIController.bootstrap();
    const tplTab = document.querySelector('.mode-tab[data-mode="templates"]');
    tplTab.click();

    expect(tplTab.classList.contains('active')).toBe(true);
    expect(document.getElementById('templates-mode').classList.contains('active')).toBe(true);
  });
});

describe('ascii-controller: template buttons', () => {
  test('clicking a template button renders its content into the preview', async () => {
    const { generateMock } = mount();
    await window.ASCIIController.bootstrap();
    const btn = document.querySelector('.template-btn[data-template="arrow-right"]');
    btn.click();
    // Wait for the async generate() call to resolve.
    await Promise.resolve();
    await Promise.resolve();

    expect(generateMock).toHaveBeenCalledWith(
      expect.objectContaining({ font: 'template:arrow-right' })
    );
    expect(document.getElementById('preview').textContent).toBe('<<arrow-right>>');
    expect(btn.classList.contains('active')).toBe(true);
  });
});

describe('ascii-controller: box renderer alignment and width', () => {
  test('centres content inside a forced minimum width', () => {
    mount();
    const { renderBox } = window.ASCIIBoxRenderer;
    const out = renderBox('Hi', 'single', 0, 'center', 6);
    expect(out).toBe('┌────────┐\n│   Hi   │\n└────────┘');
  });

  test('right-aligns content inside a forced minimum width', () => {
    mount();
    const { renderBox } = window.ASCIIBoxRenderer;
    const out = renderBox('Hi', 'ascii', 0, 'right', 4);
    expect(out).toBe('+------+\n|   Hi |\n+------+');
  });

  test('shadow style draws an offset shadow row', () => {
    mount();
    const { renderBox } = window.ASCIIBoxRenderer;
    const out = renderBox('Hi', 'shadow', 0);
    const lines = out.split('\n');
    expect(lines[0]).toBe('┌────┐░');
    expect(lines[1]).toBe('│ Hi │░');
    expect(lines[3]).toBe(' ░░░░░░');
  });
});

describe('ascii-controller: text options reach the generator', () => {
  test('Refresh sends wrap width, spacing, alignment and smushing', async () => {
    const { generateMock } = mount();
    await window.ASCIIController.bootstrap();
    document.getElementById('text-input').value = 'HI';
    document.getElementById('opt-width').value = '60';
    document.getElementById('opt-spacing').value = '2';
    document.getElementById('opt-justify').value = 'center';
    document.getElementById('opt-layout').value = 'fitted';
    document.getElementById('btn-generate').click();
    await Promise.resolve();
    await Promise.resolve();

    expect(generateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'HI',
        options: expect.objectContaining({
          width: 60,
          spacing: 2,
          justify: 'center',
          horizontalLayout: 'fitted',
        }),
      })
    );
  });

  test('selecting a font from the picker re-renders with that font', async () => {
    const { generateMock } = mount();
    await window.ASCIIController.bootstrap();
    const picker = document.getElementById('font-picker');
    picker.value = 'big';
    picker.dispatchEvent(new window.Event('change'));
    await Promise.resolve();
    await Promise.resolve();

    expect(generateMock).toHaveBeenCalledWith(expect.objectContaining({ font: 'big' }));
  });

  test('font search narrows the picker options', async () => {
    mount();
    await window.ASCIIController.bootstrap();
    const search = document.getElementById('font-search');
    search.value = 'big';
    search.dispatchEvent(new window.Event('input'));
    await new Promise((r) => setTimeout(r, 150));
    const options = Array.from(document.getElementById('font-picker').options).map((o) => o.value);
    expect(options).toContain('big');
    expect(options).not.toContain('standard');
  });
});
