/**
 * @jest-environment jsdom
 *
 * Footnote preview tests — DOM-driven, no real timers/animations.
 */
const { mountFootnotePreview } = require('../src/renderer/footnote-preview');

function makePreviewHtml(refText, fnText) {
  return `
      <p>hello<sup><a id="footnote-ref-1" href="#footnote-1" data-footnote-ref>1</a></sup></p>
      <section class="footnotes">
        <ol>
          <li id="footnote-1">${fnText} <a href="#footnote-ref-1" data-footnote-backref>↩</a></li>
        </ol>
      </section>
    `;
}

describe('mountFootnotePreview', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '';
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('mounts and returns an unmount function', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const unmount = mountFootnotePreview(root);
    expect(typeof unmount).toBe('function');
    unmount();
  });

  test('shows a popover on mouseover of a footnote ref (after delay)', () => {
    const root = document.createElement('div');
    root.innerHTML = makePreviewHtml('ref', 'footnote body text');
    document.body.appendChild(root);

    mountFootnotePreview(root, { delayMs: 50 });

    const ref = root.querySelector('a[data-footnote-ref]');
    ref.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    // Popover exists but isn't visible yet (timer hasn't fired)
    let popover = document.querySelector('.footnote-preview');
    expect(popover).not.toBeNull();
    expect(popover.style.display).toBe('none');

    // Advance past the delay
    jest.advanceTimersByTime(60);

    popover = document.querySelector('.footnote-preview');
    expect(popover.style.display).toBe('block');
    expect(popover.textContent).toBe('footnote body text');
  });

  test('hides the popover on mouseout', () => {
    const root = document.createElement('div');
    root.innerHTML = makePreviewHtml('ref', 'body');
    document.body.appendChild(root);

    mountFootnotePreview(root, { delayMs: 0 });

    const ref = root.querySelector('a[data-footnote-ref]');
    ref.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    jest.advanceTimersByTime(0);

    let popover = document.querySelector('.footnote-preview');
    expect(popover.style.display).toBe('block');

    ref.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: null }));
    popover = document.querySelector('.footnote-preview');
    expect(popover.style.display).toBe('none');
  });

  test('does nothing when the hovered target has no footnote ref', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>plain text</p>';
    document.body.appendChild(root);

    mountFootnotePreview(root, { delayMs: 0 });

    root.querySelector('p').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    jest.advanceTimersByTime(0);

    // Popover exists (it was created on first show path normally) but
    // should not be visible.
    const popover = document.querySelector('.footnote-preview');
    if (popover) expect(popover.style.display).toBe('none');
  });

  test('does not throw when the footnote body is missing (dangling ref)', () => {
    const root = document.createElement('div');
    // Reference exists but no matching <li id="footnote-1">
    root.innerHTML = '<p>x<sup><a href="#footnote-99" data-footnote-ref>99</a></sup></p>';
    document.body.appendChild(root);

    mountFootnotePreview(root, { delayMs: 0 });

    const ref = root.querySelector('a[data-footnote-ref]');
    expect(() => ref.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))).not.toThrow();
    jest.advanceTimersByTime(0);

    const popover = document.querySelector('.footnote-preview');
    if (popover) expect(popover.style.display).toBe('none');
  });

  test('strips the backref ↩ from the displayed text', () => {
    const root = document.createElement('div');
    root.innerHTML = makePreviewHtml('ref', 'see <em>section 3</em> for context');
    document.body.appendChild(root);

    mountFootnotePreview(root, { delayMs: 0 });
    root
      .querySelector('a[data-footnote-ref]')
      .dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    jest.advanceTimersByTime(0);

    const popover = document.querySelector('.footnote-preview');
    expect(popover.textContent).toBe('see section 3 for context');
    expect(popover.textContent).not.toMatch(/↩/);
  });

  test('cancels a pending show when a new ref is hovered', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <p>a<sup><a href="#footnote-1" data-footnote-ref>1</a></sup>
         b<sup><a href="#footnote-2" data-footnote-ref>2</a></sup></p>
      <ol><li id="footnote-1">one</li><li id="footnote-2">two</li></ol>
    `;
    document.body.appendChild(root);

    mountFootnotePreview(root, { delayMs: 50 });

    const refs = root.querySelectorAll('a[data-footnote-ref]');
    refs[0].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    jest.advanceTimersByTime(20);
    // Hover the second before the first delay fires
    refs[1].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    jest.advanceTimersByTime(50); // 50ms after the new timer was set

    const popover = document.querySelector('.footnote-preview');
    expect(popover.textContent).toBe('two');
  });

  test('unmount removes listeners and the popover', () => {
    const root = document.createElement('div');
    root.innerHTML = makePreviewHtml('ref', 'body');
    document.body.appendChild(root);

    const unmount = mountFootnotePreview(root, { delayMs: 0 });
    root.querySelector('a[data-footnote-ref]').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    jest.advanceTimersByTime(0);
    expect(document.querySelector('.footnote-preview')).not.toBeNull();

    unmount();

    expect(document.querySelector('.footnote-preview')).toBeNull();

    // Re-hovering after unmount is a no-op (no popover recreated)
    root.querySelector('a[data-footnote-ref]').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    jest.advanceTimersByTime(0);
    expect(document.querySelector('.footnote-preview')).toBeNull();
  });
});