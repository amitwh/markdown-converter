function feedConfigFor(channel) {
  if (channel === 'github') {
    return { provider: 'github', owner: 'amitwh', repo: 'markdown-converter' };
  }
  return { provider: 'generic', url: 'https://updates.concreteinfo.co.in/v5' };
}

module.exports = { feedConfigFor };
