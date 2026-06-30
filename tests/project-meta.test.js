/**
 * Tests for project metadata consistency
 */

const fs = require('fs');
const path = require('path');

describe('Project version consistency', () => {
  const rootDir = path.resolve(__dirname, '..');
  const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const readme = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8');

  test('README version matches package.json version', () => {
    const version = packageJson.version;
    expect(readme).toContain(`v${version}`);
  });

  test('README contains current version string', () => {
    expect(readme).toContain(`v${packageJson.version}`);
  });
});
