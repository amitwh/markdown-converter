const {
  FAMILY_BY_KEY,
  getActiveMonoFont,
  isLigaturesEnabled,
  safeMonospaceSettings,
  DEFAULT_SETTINGS,
} = require('../../../../src/main/settings/monospaceSettings');

describe('monospaceSettings', () => {
  test('FAMILY_BY_KEY maps jetbrains-mono → "JetBrains Mono"', () => {
    expect(FAMILY_BY_KEY['jetbrains-mono']).toBe('JetBrains Mono');
  });
  test('getActiveMonoFont returns family for valid key', () => {
    expect(getActiveMonoFont({ monospaceFont: 'fira-code' })).toBe('Fira Code');
  });
  test('getActiveMonoFont falls back to default for unknown key', () => {
    expect(getActiveMonoFont({ monospaceFont: 'unknown' })).toBe('JetBrains Mono');
  });
  test('getActiveMonoFont returns default when key missing', () => {
    expect(getActiveMonoFont({})).toBe('JetBrains Mono');
  });
  test('isLigaturesEnabled is true only when explicitly true', () => {
    expect(isLigaturesEnabled({ monospaceLigatures: true })).toBe(true);
    expect(isLigaturesEnabled({ monospaceLigatures: false })).toBe(false);
    expect(isLigaturesEnabled({ monospaceLigatures: 'yes' })).toBe(false);
    expect(isLigaturesEnabled({})).toBe(false);
  });
  test('safeMonospaceSettings rejects unknown fonts', () => {
    expect(safeMonospaceSettings({ monospaceFont: 'comic-sans' })).toEqual(DEFAULT_SETTINGS);
  });
  test('safeMonospaceSettings coerces ligatures to boolean', () => {
    expect(safeMonospaceSettings({ monospaceLigatures: 1 })).toEqual({
      monospaceFont: 'jetbrains-mono',
      monospaceLigatures: true,
    });
  });
  test('safeMonospaceSettings returns DEFAULT_SETTINGS for empty input', () => {
    expect(safeMonospaceSettings({})).toEqual(DEFAULT_SETTINGS);
  });
});
