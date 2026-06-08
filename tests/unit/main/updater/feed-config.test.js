const { resolveFeedUrl, feedConfigFor, FEEDS } = require('../../../../src/main/updater/feed-config');

describe('feed-config', () => {
  test('resolves github channel to GitHub Releases feed', () => {
    const url = resolveFeedUrl('github', '5.0.2', 'mac');
    expect(url).toBe('https://github.com/amitwh/markdown-converter/releases/download/v5.0.2/latest-mac.yml');
  });

  test('resolves concreteinfo channel to CI feed', () => {
    const url = resolveFeedUrl('concreteinfo', '5.0.2', 'mac');
    expect(url).toBe('https://updates.concreteinfo.co.in/v5/latest-mac.yml');
  });

  test('resolves windows platform correctly', () => {
    const url = resolveFeedUrl('github', '5.0.2', 'windows');
    expect(url).toContain('latest-windows.yml');
  });

  test('resolves linux platform correctly', () => {
    const url = resolveFeedUrl('github', '5.0.2', 'linux');
    expect(url).toContain('latest-linux.yml');
  });

  test('falls back to github on unknown channel', () => {
    const url = resolveFeedUrl('something-weird', '5.0.2', 'mac');
    expect(url).toContain('github.com');
  });

  test('exports both feeds as constants', () => {
    expect(FEEDS.github).toBeDefined();
    expect(FEEDS.concreteinfo).toBeDefined();
  });
});
describe('feedConfigFor', () => {
  test('returns github provider config for github channel', () => {
    const config = feedConfigFor('github');
    expect(config).toEqual({ provider: 'github', owner: 'amitwh', repo: 'markdown-converter' });
  });

  test('returns generic provider config for concreteinfo channel', () => {
    const config = feedConfigFor('concreteinfo');
    expect(config).toEqual({ provider: 'generic', url: 'https://updates.concreteinfo.co.in/v5' });
  });

  test('falls back to generic provider on unknown channel', () => {
    const config = feedConfigFor('something-weird');
    expect(config).toEqual({ provider: 'generic', url: 'https://updates.concreteinfo.co.in/v5' });
  });
});
