/**
 * Tests for bundled external tools
 */

const fs = require('fs');
const path = require('path');

describe('Bundled Pandoc binary', () => {
  const rootDir = path.resolve(__dirname, '..');
  const platform = process.platform;
  const binaryPath = path.join(rootDir, 'bin', platform, 'pandoc');
  const windowsBinaryPath = path.join(rootDir, 'bin', platform, 'pandoc.exe');

  test('Pandoc binary exists for current platform', () => {
    const exists = fs.existsSync(binaryPath) || fs.existsSync(windowsBinaryPath);
    expect(exists).toBe(true);
  });

  test('Pandoc binary is executable', () => {
    if (platform === 'win32') {
      expect(fs.existsSync(windowsBinaryPath)).toBe(true);
    } else {
      expect(fs.existsSync(binaryPath)).toBe(true);
      const stats = fs.statSync(binaryPath);
      expect(stats.mode & 0o111).toBeGreaterThan(0);
    }
  });
});

describe('Bundled MarkItDown binary (optional)', () => {
  const rootDir = path.resolve(__dirname, '..');
  const platform = process.platform;
  const binaryPath = path.join(rootDir, 'bin', platform, 'markitdown');
  const windowsBinaryPath = path.join(rootDir, 'bin', platform, 'markitdown.exe');

  // The binary is built on demand (npm run bundle:markitdown), so CI machines
  // that haven't built it yet skip these — but when present it must be valid.
  const hasBinary = fs.existsSync(binaryPath) || fs.existsSync(windowsBinaryPath);
  const which = platform === 'win32' ? windowsBinaryPath : binaryPath;

  (hasBinary ? describe : describe.skip)('binary present', () => {
    test('is executable', () => {
      const stats = fs.statSync(which);
      expect(stats.mode & 0o111).toBeGreaterThan(0);
    });

    test('answers --version', (done) => {
      const { execFile } = require('child_process');
      execFile(which, ['--version'], { timeout: 30000 }, (error, stdout) => {
        expect(error).toBeNull();
        expect(stdout.toLowerCase()).toContain('markitdown');
        done();
      });
    }, 60000);
  });
});

describe('Legal compliance artifacts', () => {
  const rootDir = path.resolve(__dirname, '..');

  test('THIRD-PARTY-NOTICES.md and SOURCES.md ship at the repo root', () => {
    expect(fs.existsSync(path.join(rootDir, 'THIRD-PARTY-NOTICES.md'))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, 'SOURCES.md'))).toBe(true);
  });

  test('canonical copyleft license texts are present', () => {
    for (const file of ['GPL-2.0.txt', 'LGPL-2.1.txt', 'MPL-2.0.txt', 'Apache-2.0.txt', 'OFL-1.1.txt']) {
      expect(fs.existsSync(path.join(rootDir, 'third-party-licenses', file))).toBe(true);
    }
  });

  test('notices mention every bundled external binary', () => {
    const notices = fs.readFileSync(path.join(rootDir, 'THIRD-PARTY-NOTICES.md'), 'utf-8');
    for (const component of ['Pandoc', 'FFmpeg', 'MarkItDown', 'libvips', 'KaTeX', 'JetBrains Mono']) {
      expect(notices).toContain(component);
    }
    // GPL source offer must reference the sources document
    expect(notices).toContain('SOURCES.md');
  });

  test('SOURCES.md covers every GPL-licensed binary with a source link', () => {
    const sources = fs.readFileSync(path.join(rootDir, 'SOURCES.md'), 'utf-8');
    for (const section of ['Pandoc', 'FFmpeg', 'PyInstaller', 'libvips']) {
      expect(sources).toContain(section);
    }
    expect(sources).toMatch(/https:\/\/github\.com\/jgm\/pandoc/);
    expect(sources).toMatch(/https:\/\/ffmpeg\.org\/releases\//);
  });

  test('packaging includes the legal documents in build.files', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));
    expect(pkg.build.files).toContain('THIRD-PARTY-NOTICES.md');
    expect(pkg.build.files).toContain('SOURCES.md');
  });
});
