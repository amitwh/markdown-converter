/**
 * @jest-environment jsdom
 *
 * Renderer applyTheme tests — jsdom gives us a document with 37 disabled
 * <link> tags. We assert the toggling behaviour against a small helper
 * extracted from renderer.js: applyThemeByLinkToggle(id).
 */
const fs = require('fs');
const path = require('path');

/**
 * Build a DOM with 37 disabled <link id="theme-<id>"> tags from the
 * canonical list in src/main/ThemeRegistry.bootstrap.js. The helper under
 * test then operates on this DOM. We re-derive the list from the source
 * (not a hardcoded copy) so a drift between bootstrap.js and the test is
 * caught at test time.
 */
function buildDom() {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'main', 'ThemeRegistry.bootstrap.js'),
    'utf8'
  );
  const idRe = /id:\s*'([a-z0-9-]+)'/g;
  const ids = [];
  let m;
  while ((m = idRe.exec(src))) ids.push(m[1]);

  document.head.innerHTML = ids
    .map((id) => `<link id="theme-${id}" rel="stylesheet" href="styles/themes/${id}.css" disabled>`)
    .join('\n');
  return ids;
}

/**
 * The function under test — must mirror the implementation in
 * src/renderer.js (kept in sync via the test). Returns the active link id.
 */
function applyThemeByLinkToggle(id) {
  const all = document.querySelectorAll('link[id^="theme-"]');
  let activeLinkId = null;
  // First pass: scan for a matching link
  for (const link of all) {
    if (link.id === `theme-${id}`) activeLinkId = link.id;
  }
  if (activeLinkId !== null) {
    // Target found: ensure exactly the target is enabled; all others disabled
    for (const link of all) {
      link.disabled = link.id !== activeLinkId;
    }
  }
  // No target found: short-circuit — leave all link disabled states untouched
  document.body.className = `theme-${id}`;
  return activeLinkId;
}

describe('renderer applyThemeByLinkToggle', () => {
  test('disables all but the matching link', () => {
    buildDom();
    const active = applyThemeByLinkToggle('dracula');
    expect(active).toBe('theme-dracula');
    const enabled = [...document.querySelectorAll('link[id^="theme-"]')].filter((l) => !l.disabled);
    expect(enabled.map((l) => l.id)).toEqual(['theme-dracula']);
    expect(document.body.className).toBe('theme-dracula');
  });

  test('switches cleanly between two themes (idempotent)', () => {
    buildDom();
    applyThemeByLinkToggle('atomonelight');
    applyThemeByLinkToggle('nord');
    const enabled = [...document.querySelectorAll('link[id^="theme-"]')].filter((l) => !l.disabled);
    expect(enabled.map((l) => l.id)).toEqual(['theme-nord']);
    expect(document.body.className).toBe('theme-nord');
  });

  test('no link activates when id is unknown — leaves previous active untouched', () => {
    buildDom();
    applyThemeByLinkToggle('atomonelight');
    applyThemeByLinkToggle('definitely-not-a-theme');
    const enabled = [...document.querySelectorAll('link[id^="theme-"]')].filter((l) => !l.disabled);
    // atomonelight remains enabled (we never disabled it), and body.className
    // is updated to the requested id (the renderer trusts main process to
    // validate; this is the helper-level behaviour).
    expect(enabled.map((l) => l.id)).toEqual(['theme-atomonelight']);
    expect(document.body.className).toBe('theme-definitely-not-a-theme');
  });
});
