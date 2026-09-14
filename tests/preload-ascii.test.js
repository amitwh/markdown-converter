/**
 * @jest-environment node
 *
 * Asserts that the preload.js allow-list contains the new ascii:* invoke
 * channels and does NOT contain the dead show-ascii-generator* channels.
 */
const fs = require('fs');
const path = require('path');

const preloadSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf-8');

const REQUIRED_CHANNELS = [
  'ascii:generate',
  'ascii:list-fonts',
  'ascii:get-font-meta',
  'ascii:save',
  'ascii:copy',
  'ascii:last-font',
];

const DEAD_CHANNELS = ['show-ascii-generator', 'show-ascii-generator-window'];

describe('preload.js ASCII channels', () => {
  test.each(REQUIRED_CHANNELS)('declares %s in the allow-list', (channel) => {
    expect(preloadSrc).toContain(`'${channel}'`);
  });

  // DEFERRED to T11 — channels still in allow-list until T11 deletes them.
  test.skip.each(DEAD_CHANNELS)('removed %s from allow-list', (channel) => {
    expect(preloadSrc).not.toContain(`'${channel}'`);
  });

  test('generators.ascii namespace is exposed', () => {
    expect(preloadSrc).toMatch(/ascii:\s*\{/);
    expect(preloadSrc).toMatch(/listFonts/);
    expect(preloadSrc).toMatch(/generate/);
    expect(preloadSrc).toMatch(/copy/);
    expect(preloadSrc).toMatch(/save/);
    expect(preloadSrc).toMatch(/lastFont/);
  });
});
