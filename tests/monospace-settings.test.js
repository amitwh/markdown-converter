const {
  getDefaults,
  getActiveMonoFont,
  isLigaturesEnabled,
} = require('../src/main/settings/monospaceSettings');

describe('monospaceSettings', () => {
  test('getDefaults returns sane defaults', () => {
    const d = getDefaults();
    expect(d.monospaceFont).toBe('jetbrains-mono');
    expect(d.monospaceLigatures).toBe(false);
  });

  test('getActiveMonoFont returns the active family', () => {
    expect(getActiveMonoFont({ monospaceFont: 'fira-code' })).toBe('Fira Code');
    expect(getActiveMonoFont({})).toBe('JetBrains Mono');
    expect(getActiveMonoFont({ monospaceFont: 'bogus' })).toBe('JetBrains Mono');
  });

  test('isLigaturesEnabled reads boolean strictly', () => {
    expect(isLigaturesEnabled({ monospaceLigatures: true })).toBe(true);
    expect(isLigaturesEnabled({ monospaceLigatures: false })).toBe(false);
    expect(isLigaturesEnabled({})).toBe(false);
    expect(isLigaturesEnabled({ monospaceLigatures: 'yes' })).toBe(false);
  });
});
