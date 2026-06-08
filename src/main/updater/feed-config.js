const REPO = 'amitwh/markdown-converter';

const FEEDS = {
  github: {
    base: `https://github.com/${REPO}/releases/download`,
  },
  concreteinfo: {
    base: 'https://updates.concreteinfo.co.in/v5',
  },
};

function platformSuffix(platform) {
  if (platform === 'darwin' || platform === 'mac') return 'mac';
  if (platform === 'win32' || platform === 'windows') return 'windows';
  return 'linux';
}

function feedForChannel(channel, version, platform) {
  const suffix = platformSuffix(platform);
  const f = FEEDS[channel] || FEEDS.github;
  if (channel === 'github') {
    return `${f.base}/v${version}/latest-${suffix}.yml`;
  }
  return `${f.base}/latest-${suffix}.yml`;
}

function resolveFeedUrl(channel, version, platform) {
  return feedForChannel(channel, version, platform);
}

function feedConfigFor(channel) {
  if (channel === 'github') {
    return { provider: 'github', owner: 'amitwh', repo: 'markdown-converter' };
  }
  return { provider: 'generic', url: 'https://updates.concreteinfo.co.in/v5' };
}

module.exports = { resolveFeedUrl, feedConfigFor, FEEDS };