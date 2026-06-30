jest.mock('electron', () => ({
  app: { getPath: () => '/fake/userData' },
}));
jest.mock('fs', () => ({ existsSync: jest.fn(), statSync: jest.fn() }));

const fs = require('fs');
const MonospaceFontConfig = require('../src/main/MonospaceFontConfig');

describe('MonospaceFontConfig', () => {
  afterEach(() => { jest.clearAllMocks(); });

  test('returns null when no file exists', () => {
    fs.existsSync.mockReturnValue(false);
    const p = MonospaceFontConfig.getMonoFontTtfPath('jetbrains-mono', 400);
    expect(p).toBeNull();
  });

  test('returns dev repo path when dev file exists', () => {
    fs.existsSync.mockImplementation((p) => !p.includes('app.asar.unpacked') && p.endsWith('JetBrainsMono-Regular.ttf'));
    const p = MonospaceFontConfig.getMonoFontTtfPath('jetbrains-mono', 400);
    expect(p).toMatch(/assets\/fonts\/JetBrainsMono-Regular\.ttf$/);
  });

  test('returns packaged asar.unpacked path when present and file exists', () => {
    fs.existsSync.mockImplementation((p) => p.includes('app.asar.unpacked') && p.endsWith('FiraCode-Regular.ttf'));
    const p = MonospaceFontConfig.getMonoFontTtfPath('fira-code', 400);
    expect(p).toContain('app.asar.unpacked');
    expect(p).toContain('FiraCode-Regular.ttf');
  });

  test('returns null and warns when file is missing', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    fs.existsSync.mockReturnValue(false);
    const p = MonospaceFontConfig.getMonoFontTtfPath('fira-code', 700);
    expect(p).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/FiraCode-Bold\.ttf/));
    warn.mockRestore();
  });

  test('ligaturesEnabled maps from settings', () => {
    expect(MonospaceFontConfig.ligaturesEnabled({ monospaceLigatures: true })).toBe(true);
    expect(MonospaceFontConfig.ligaturesEnabled({ monospaceLigatures: false })).toBe(false);
    expect(MonospaceFontConfig.ligaturesEnabled({})).toBe(false);
  });
});
