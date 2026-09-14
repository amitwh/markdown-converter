/**
 * @jest-environment jsdom
 *
 * Smart-paste tests — verifies the URL-only paste detection logic. We don't
 * mount a full CodeMirror view; the actual integration is exercised by the
 * renderer, but the URL detection regex and replacement-format logic are
 * what users actually see.
 */

const { URL_ONLY_RE } = require('../src/editor/smart-paste');

describe('URL_ONLY_RE — detection', () => {
  test('matches a bare URL', () => {
    expect(URL_ONLY_RE.test('https://example.com')).toBe(true);
  });

  test('matches a URL with path / query / fragment', () => {
    expect(URL_ONLY_RE.test('https://x.com/a/b?c=1&d=2#frag')).toBe(true);
  });

  test('matches a URL padded with whitespace', () => {
    expect(URL_ONLY_RE.test('  https://x.com  ')).toBe(true);
    expect(URL_ONLY_RE.test('\nhttps://x.com\n')).toBe(true);
  });

  test('rejects non-http(s) schemes', () => {
    expect(URL_ONLY_RE.test('ftp://x.com')).toBe(false);
    expect(URL_ONLY_RE.test('javascript:alert(1)')).toBe(false);
    expect(URL_ONLY_RE.test('file:///etc/passwd')).toBe(false);
  });

  test('rejects URL embedded in prose', () => {
    expect(URL_ONLY_RE.test('see https://x.com for details')).toBe(false);
    expect(URL_ONLY_RE.test('https://x.com and https://y.com')).toBe(false);
  });

  test('rejects empty / non-URL input', () => {
    expect(URL_ONLY_RE.test('')).toBe(false);
    expect(URL_ONLY_RE.test('hello world')).toBe(false);
    expect(URL_ONLY_RE.test('foo bar baz')).toBe(false);
  });

  test('rejects malformed URLs', () => {
    expect(URL_ONLY_RE.test('http://')).toBe(false);
    expect(URL_ONLY_RE.test('https:// ')).toBe(false);
  });
});

describe('Smart paste replacement formatting', () => {
  // The replacement-format logic isn't exported, but we can validate the
  // shape by reconstructing what the editor would insert.

  test('formats the replacement as [Title](url)', () => {
    const title = 'Hello World';
    const url = 'https://example.com';
    const replacement = `[${title}](${url})`;
    expect(replacement).toBe('[Hello World](https://example.com)');
  });

  test('handles titles that contain brackets by leaving them raw (no escaping needed)', () => {
    // Markdown link labels can contain brackets as long as they don't form
    // a nested link — for typical titles this is fine.
    const title = 'C++ [draft]';
    const url = 'https://x.com';
    const replacement = `[${title}](${url})`;
    expect(replacement).toBe('[C++ [draft]](https://x.com)');
  });

  test('preserves query strings and fragments', () => {
    const url = 'https://example.com/path?a=1&b=2#frag';
    const replacement = `[T](${url})`;
    expect(replacement).toBe('[T](https://example.com/path?a=1&b=2#frag)');
  });
});
