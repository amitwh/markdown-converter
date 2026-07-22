'use strict';

const FAMILY_BY_KEY = {
  'jetbrains-mono': 'JetBrains Mono',
  'fira-code': 'Fira Code',
};

const ALLOWED_FONTS = Object.keys(FAMILY_BY_KEY);

const DEFAULT_SETTINGS = Object.freeze({
  monospaceFont: 'jetbrains-mono',
  monospaceLigatures: false,
});

function getActiveMonoFont(settings) {
  const key = settings && settings.monospaceFont;
  if (typeof key === 'string' && Object.prototype.hasOwnProperty.call(FAMILY_BY_KEY, key)) {
    return FAMILY_BY_KEY[key];
  }
  return FAMILY_BY_KEY[DEFAULT_SETTINGS.monospaceFont];
}

function isLigaturesEnabled(settings) {
  return !!(settings && settings.monospaceLigatures === true);
}

function safeMonospaceSettings(input) {
  const safe = { ...DEFAULT_SETTINGS };
  if (input && typeof input === 'object') {
    if (ALLOWED_FONTS.includes(input.monospaceFont)) {
      safe.monospaceFont = input.monospaceFont;
    }
    if (typeof input.monospaceLigatures === 'boolean') {
      safe.monospaceLigatures = input.monospaceLigatures;
    } else if (input.monospaceLigatures === 1 || input.monospaceLigatures === 'true') {
      safe.monospaceLigatures = true;
    }
  }
  return safe;
}

module.exports = {
  FAMILY_BY_KEY,
  ALLOWED_FONTS,
  DEFAULT_SETTINGS,
  getActiveMonoFont,
  isLigaturesEnabled,
  safeMonospaceSettings,
};
