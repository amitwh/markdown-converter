/**
 * Tests ensuring the codebase has no ESLint warnings.
 */

const { execSync } = require('child_process');
const path = require('path');

describe('ESLint quality gate', () => {
  test('src and tests have no ESLint warnings', () => {
    const rootDir = path.resolve(__dirname, '..');
    const result = execSync('npm run lint', {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    expect(result).not.toMatch(/warning/);
  });
});
