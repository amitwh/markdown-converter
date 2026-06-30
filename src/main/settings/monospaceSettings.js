'use strict';

const FAMILY_BY_KEY = {
  'jetbrains-mono': 'JetBrains Mono',
  'fira-code': 'Fira Code',
};

function getDefaults() {
  return Object.freeze({ monospaceFont: 'jetbrains-mono', monospaceLigatures: false });
}

function getActiveMonoFont(settings) {
  const key = settings && settings.monospaceFont;
  return FAMILY_BY_KEY[key] || 'JetBrains Mono';
}

function isLigaturesEnabled(settings) {
  return Boolean(settings && settings.monospaceLigatures === true);
}

module.exports = { getDefaults, getActiveMonoFont, isLigaturesEnabled, FAMILY_BY_KEY };
