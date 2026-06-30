/**
 * Tests ensuring production code does not contain leftover diagnostic console.log statements.
 */

const fs = require('fs');
const path = require('path');

describe('No leftover diagnostic console.log statements', () => {
  const rootDir = path.resolve(__dirname, '..');
  const filesToCheck = ['src/main.js', 'src/renderer.js'];

  filesToCheck.forEach((relativePath) => {
    test(`${relativePath} has no console.log statements`, () => {
      const content = fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
      const matches = content.match(/console\.log\(/g) || [];
      expect(matches).toHaveLength(0);
    });
  });
});
