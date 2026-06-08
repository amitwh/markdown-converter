const { feedConfigFor } = require('../../../../src/main/updater/feed-config');

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
