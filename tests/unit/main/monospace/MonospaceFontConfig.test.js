const fs = require('fs');
const path = require('path');
const os = require('os');

describe('MonospaceFontConfig', () => {
  let tmpDir;
  let originalResourcesPath;
  let originalCwd;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mono-font-cfg-'));
    originalResourcesPath = process.resourcesPath;
    originalCwd = process.cwd();
    process.resourcesPath = undefined;
  });

  afterEach(() => {
    process.resourcesPath = originalResourcesPath;
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function loadFresh() {
    delete require.cache[require.resolve('../../../../src/main/MonospaceFontConfig')];
    return require('../../../../src/main/MonospaceFontConfig');
  }

  test('resolves JetBrains Mono Regular TTF from repo assets', () => {
    const repoRoot = path.resolve(__dirname, '../../../..');
    const fontsDir = path.join(repoRoot, 'assets', 'fonts');
    fs.mkdirSync(fontsDir, { recursive: true });
    const target = path.join(fontsDir, 'JetBrainsMono-Regular.ttf');
    fs.writeFileSync(target, 'fake-ttf');
    try {
      const cfg = loadFresh();
      const result = cfg.getMonoFontTtfPath('jetbrains-mono', 400);
      expect(result).toBe(target);
    } finally {
      fs.unlinkSync(target);
    }
  });

  test('resolves Fira Code Bold TTF when family is fira-code and weight 700', () => {
    const repoRoot = path.resolve(__dirname, '../../../..');
    const target = path.join(repoRoot, 'assets', 'fonts', 'FiraCode-Bold.ttf');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'fake-ttf');
    try {
      const cfg = loadFresh();
      const result = cfg.getMonoFontTtfPath('fira-code', 700);
      expect(result).toBe(target);
    } finally {
      fs.unlinkSync(target);
    }
  });

  test('returns null when TTF is missing', () => {
    const cfg = loadFresh();
    const result = cfg.getMonoFontTtfPath('jetbrains-mono', 400);
    expect(result).toBeNull();
  });

  test('ligaturesEnabled delegates to settings', () => {
    const cfg = loadFresh();
    expect(cfg.ligaturesEnabled({ monospaceLigatures: true })).toBe(true);
    expect(cfg.ligaturesEnabled({ monospaceLigatures: false })).toBe(false);
    expect(cfg.ligaturesEnabled({})).toBe(false);
  });

  test('getActiveFamily returns the human-readable family name', () => {
    const cfg = loadFresh();
    expect(cfg.getActiveFamily({ monospaceFont: 'fira-code' })).toBe('Fira Code');
    expect(cfg.getActiveFamily({})).toBe('JetBrains Mono');
  });
});
