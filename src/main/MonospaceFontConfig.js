'use strict';

const fs = require('fs');
const path = require('path');
const {
  getActiveMonoFont,
  isLigaturesEnabled,
  FAMILY_BY_KEY,
} = require('./settings/monospaceSettings');

const WEIGHT_BY_KEY = { 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold' };

function getAppRoot() {
  if (
    process.resourcesPath &&
    fs.existsSync(path.join(process.resourcesPath, 'app.asar.unpacked'))
  ) {
    return process.resourcesPath;
  }
  return path.resolve(__dirname, '..', '..');
}

function getCandidatePaths(family, weight) {
  const familyDir = family === 'Fira Code' ? 'FiraCode' : 'JetBrainsMono';
  const weightName = WEIGHT_BY_KEY[weight] || 'Regular';
  const filename = `${familyDir}-${weightName}.ttf`;
  const candidates = [];
  candidates.push(path.resolve(getAppRoot(), 'assets', 'fonts', filename));
  const packagedRoot = process.resourcesPath || getAppRoot();
  candidates.push(path.join(packagedRoot, 'app.asar.unpacked', 'assets', 'fonts', filename));
  return candidates;
}

function getMonoFontTtfPath(familyKey, weight = 400) {
  const family = FAMILY_BY_KEY[familyKey] || 'JetBrains Mono';
  const candidates = getCandidatePaths(family, weight);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  const filename = path.basename(candidates[candidates.length - 1]);
  console.warn(
    `[MonospaceFontConfig] bundled font missing: ${filename}; falling back to system monospace`
  );
  return null;
}

function ligaturesEnabled(settings) {
  return isLigaturesEnabled(settings);
}

function getActiveFamily(settings) {
  return getActiveMonoFont(settings);
}

module.exports = { getMonoFontTtfPath, ligaturesEnabled, getActiveFamily };
