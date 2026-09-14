/**
 * @jest-environment node
 *
 * UrlTitle tests — pure module with injectable fetch.
 */
const UrlTitle = require('../../src/main/UrlTitle');

describe('UrlTitle.isHttpUrl', () => {
  test('accepts http and https URLs', () => {
    expect(UrlTitle.isHttpUrl('http://example.com')).toBe(true);
    expect(UrlTitle.isHttpUrl('https://example.com/path?x=1')).toBe(true);
  });

  test('rejects non-http(s) schemes', () => {
    expect(UrlTitle.isHttpUrl('ftp://example.com')).toBe(false);
    expect(UrlTitle.isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(UrlTitle.isHttpUrl('data:text/plain,hello')).toBe(false);
    expect(UrlTitle.isHttpUrl('file:///etc/passwd')).toBe(false);
  });

  test('rejects malformed / non-string input', () => {
    expect(UrlTitle.isHttpUrl('not a url')).toBe(false);
    expect(UrlTitle.isHttpUrl(null)).toBe(false);
    expect(UrlTitle.isHttpUrl(undefined)).toBe(false);
    expect(UrlTitle.isHttpUrl(42)).toBe(false);
  });
});

describe('UrlTitle.decodeTitle', () => {
  test('decodes named entities', () => {
    expect(UrlTitle.decodeTitle('AT&amp;T &lt;Home&gt;')).toBe('AT&T <Home>');
  });

  test('decodes numeric and hex entities', () => {
    expect(UrlTitle.decodeTitle('Caf&#233;')).toBe('Café');
    expect(UrlTitle.decodeTitle('&#x2014;mdash')).toBe('—mdash');
  });

  test('does not decode entities introduced by the strip step (tags-as-text survive)', () => {
    // Confirms that decoded entities like &lt;b&gt; → <b> stay visible as text
    // rather than being stripped as a tag. (Stripping would break the named-
    // entity decoding test above.)
    expect(UrlTitle.decodeTitle('A &lt;b&gt;B&lt;/b&gt; C')).toBe('A <b>B</b> C');
  });

  test('collapses whitespace and trims', () => {
    expect(UrlTitle.decodeTitle('  hello\n\nworld  ')).toBe('hello world');
  });

  test('returns empty string for non-string input', () => {
    expect(UrlTitle.decodeTitle(null)).toBe('');
    expect(UrlTitle.decodeTitle(undefined)).toBe('');
    expect(UrlTitle.decodeTitle(42)).toBe('');
  });
});

describe('UrlTitle.extractTitleFromHtml', () => {
  test('extracts the first <title> in the body', () => {
    expect(
      UrlTitle.extractTitleFromHtml('<html><head><title>Hello World</title></head><body></body></html>')
    ).toBe('Hello World');
  });

  test('decodes entities in the title', () => {
    expect(
      UrlTitle.extractTitleFromHtml('<html><head><title>News &amp; Updates</title></head></html>')
    ).toBe('News & Updates');
  });

  test('returns null when there is no <title>', () => {
    expect(UrlTitle.extractTitleFromHtml('<html><head></head></html>')).toBeNull();
  });

  test('is case-insensitive on the tag', () => {
    expect(UrlTitle.extractTitleFromHtml('<TITLE>Mixed Case</TITLE>')).toBe('Mixed Case');
  });

  test('returns null for non-string input', () => {
    expect(UrlTitle.extractTitleFromHtml(null)).toBeNull();
    expect(UrlTitle.extractTitleFromHtml(undefined)).toBeNull();
  });
});

describe('UrlTitle.fetchTitle — success path', () => {
  test('returns {url, title} when the response is HTML with a <title>', async () => {
    const fakeFetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: (k) => (k === 'content-type' ? 'text/html; charset=utf-8' : null) },
      text: async () => '<html><head><title>Hello &amp; Welcome</title></head></html>',
    });
    const result = await UrlTitle.fetchTitle({ url: 'https://x.com', fetch: fakeFetch });
    expect(result).toEqual({ url: 'https://x.com', title: 'Hello & Welcome' });
  });

  test('caps long titles at 200 chars with an ellipsis', async () => {
    const long = 'A'.repeat(500);
    const fakeFetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'text/html' },
      text: async () => `<title>${long}</title>`,
    });
    const r = await UrlTitle.fetchTitle({ url: 'https://x.com', fetch: fakeFetch });
    expect(r.title.length).toBe(201); // 200 + ellipsis
    expect(r.title.endsWith('…')).toBe(true);
  });

  test('handles a streaming response (ReadableStream body)', async () => {
    const html = '<title>Streamed</title>';
    const encoder = new TextEncoder();
    const fakeFetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'text/html' },
      body: {
        getReader: () => ({
          read: jest
            .fn()
            .mockResolvedValueOnce({ value: encoder.encode(html.slice(0, 13)), done: false })
            .mockResolvedValueOnce({ value: encoder.encode(html.slice(13)), done: false })
            .mockResolvedValueOnce({ value: undefined, done: true }),
          cancel: jest.fn().mockResolvedValue(undefined),
        }),
      },
    });
    const r = await UrlTitle.fetchTitle({ url: 'https://x.com', fetch: fakeFetch });
    expect(r.title).toBe('Streamed');
  });
});

describe('UrlTitle.fetchTitle — failure paths', () => {
  test('returns null when the URL is not http(s)', async () => {
    const fakeFetch = jest.fn();
    expect(await UrlTitle.fetchTitle({ url: 'javascript:alert(1)', fetch: fakeFetch })).toBeNull();
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  test('returns null when fetch is unavailable', async () => {
    expect(await UrlTitle.fetchTitle({ url: 'https://x.com', fetch: null })).toBeNull();
  });

  test('returns null when the response is non-OK', async () => {
    const fakeFetch = jest.fn().mockResolvedValue({
      ok: false,
      headers: { get: () => 'text/html' },
    });
    expect(await UrlTitle.fetchTitle({ url: 'https://x.com', fetch: fakeFetch })).toBeNull();
  });

  test('returns null when the content-type is not HTML', async () => {
    const fakeFetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/octet-stream' },
      text: async () => '<title>not html</title>',
    });
    expect(await UrlTitle.fetchTitle({ url: 'https://x.com', fetch: fakeFetch })).toBeNull();
  });

  test('returns null when there is no <title>', async () => {
    const fakeFetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'text/html' },
      text: async () => '<html><body>no title</body></html>',
    });
    expect(await UrlTitle.fetchTitle({ url: 'https://x.com', fetch: fakeFetch })).toBeNull();
  });

  test('returns null when fetch rejects (network error)', async () => {
    const fakeFetch = jest.fn().mockRejectedValue(new Error('econnreset'));
    expect(await UrlTitle.fetchTitle({ url: 'https://x.com', fetch: fakeFetch })).toBeNull();
  });

  test('returns null when the body exceeds maxBytes', async () => {
    const fakeFetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'text/html' },
      text: async () => '<title>t</title>' + 'x'.repeat(200),
    });
    expect(await UrlTitle.fetchTitle({ url: 'https://x.com', fetch: fakeFetch, maxBytes: 100 })).toBeNull();
  });

  test('respects a streaming body that exceeds maxBytes (cancels the reader)', async () => {
    const encoder = new TextEncoder();
    const big = 'x'.repeat(1000);
    const cancel = jest.fn().mockResolvedValue(undefined);
    const fakeFetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'text/html' },
      body: {
        getReader: () => ({
          read: jest.fn().mockResolvedValue({ value: encoder.encode(big), done: false }),
          cancel,
        }),
      },
    });
    const r = await UrlTitle.fetchTitle({ url: 'https://x.com', fetch: fakeFetch, maxBytes: 100 });
    expect(r).toBeNull();
    expect(cancel).toHaveBeenCalled();
  });
});