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
