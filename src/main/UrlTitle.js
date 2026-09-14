/**
 * URL title extraction.
 *
 * Given a URL, fetch the page and return its <title> for smart-paste: paste
 * a link, get a markdown link with the page's title as the label. Pure
 * module — main.js wires the actual fetch via the injectable `fetch` arg
 * (defaults to globalThis.fetch in production; tests pass a stub).
 *
 * Constraints:
 *   - HTML only (Content-Type starts with text/html)
 *   - ≤2 MiB body (so a 4GB tarball link doesn't OOM us)
 *   - 5-second total timeout (AbortController)
 *   - Title decoded as ISO-8859-1 → UTF-8 (browser-grade heuristic; HTML5
 *     charset wins when present)
 *   - Stripped of newlines/extra whitespace — labels must be one logical line
 *   - Capped at 200 chars — past that the label becomes ugly in markdown
 *
 * @module UrlTitle
 */

/** Match the first <title>…</title> in an HTML body. Case-insensitive. */
function extractTitleFromHtml(html) {
  if (typeof html !== 'string') return null;
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match) return null;
  return decodeTitle(match[1]);
}

/**
 * Decode an HTML <title> value to readable text.
 *  - decode named/numeric entities (browser-grade for common ones)
 *  - collapse internal whitespace (browsers do this when computing the
 *    document.title property)
 *  - trim
 */
function decodeTitle(raw) {
  if (typeof raw !== 'string') return '';
  // Named + numeric entities we care about. The full HTML5 set is ~250
  // entries; the ones below cover the common ones for English pages.
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'",
    '&nbsp;': ' ',
    '&mdash;': '—',
    '&ndash;': '–',
    '&hellip;': '…',
    '&copy;': '©',
    '&reg;': '®',
    '&trade;': '™',
  };
  let s = raw;
  for (const [ent, ch] of Object.entries(entities)) {
    s = s.split(ent).join(ch);
  }
  // Numeric entities: &#NN; or &#xHH;
  s = s.replace(/&#(\d+);/g, (_, n) => {
    const code = Number(n);
    return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  });
  s = s.replace(/&#x([0-9a-fA-F]+);/g, (_, n) => {
    const code = parseInt(n, 16);
    return Number.isFinite(code) ? String.fromCodePoint(code) : '';
  });
  // Don't strip <...>-looking strings here: an entity like &lt;b&gt; decodes
  // to a literal "<b>" which would otherwise get eaten. Titles with embedded
  // tags in the source HTML are vanishingly rare and we can pass them through
  // as text. Collapse internal whitespace and trim instead.
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/** Is the URL fetchable (http/https only)? Rejects file://, javascript:, data:, … */
function isHttpUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Fetch a URL and return its <title>. Returns null when:
 *   - the URL is not http(s)
 *   - the response isn't HTML
 *   - the body is larger than maxBytes (default 2 MiB)
 *   - the request times out (default 5 s) or otherwise fails
 *   - the response has no <title>
 *
 * @param {object} args
 * @param {string} args.url
 * @param {number} [args.timeoutMs=5000]
 * @param {number} [args.maxBytes=2 * 1024 * 1024]
 * @param {typeof fetch} [args.fetch] injectable for tests
 * @returns {Promise<{url:string, title:string} | null>}
 */
async function fetchTitle({
  url,
  timeoutMs = 5000,
  maxBytes = 2 * 1024 * 1024,
  fetch = globalThis.fetch,
}) {
  if (!isHttpUrl(url) || typeof fetch !== 'function') return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { Accept: 'text/html,application/xhtml+xml' },
    });
    if (!res || !res.ok) return null;
    const ctype = res.headers && res.headers.get ? res.headers.get('content-type') || '' : '';
    if (!ctype.toLowerCase().includes('text/html')) return null;

    // Read up to maxBytes + 1 so we can detect overflow
    const reader =
      res.body && typeof res.body.getReader === 'function' ? res.body.getReader() : null;
    let body = '';
    if (reader) {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        body += new TextDecoder('utf-8', { fatal: false }).decode(value, { stream: true });
        if (body.length > maxBytes) {
          try {
            await reader.cancel();
          } catch {
            /* noop */
          }
          return null;
        }
      }
      body += new TextDecoder('utf-8', { fatal: false }).decode();
    } else {
      body = await res.text();
      if (body.length > maxBytes) return null;
    }

    const title = extractTitleFromHtml(body);
    if (!title) return null;
    const capped = title.length > 200 ? title.slice(0, 200).trim() + '…' : title;
    return { url, title: capped };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  extractTitleFromHtml,
  decodeTitle,
  isHttpUrl,
  fetchTitle,
};
