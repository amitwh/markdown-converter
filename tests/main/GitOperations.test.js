const fs = require('fs');
const os = require('os');
const path = require('path');
const simpleGit = require('simple-git');
const GitOperations = require('../../src/main/GitOperations');

describe('GitOperations', () => {
  let tmpDir, filePath;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitops_'));
    const git = simpleGit(tmpDir);
    await git.init();
    await git.addConfig('user.name', 'Test User');
    await git.addConfig('user.email', 'test@example.com');
    filePath = path.join(tmpDir, 'file.txt');
    fs.writeFileSync(filePath, 'line1\n');
    await git.add(['file.txt']);
    await git.commit('initial commit');
  });

  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  describe('diff', () => {
    test('returns full working-tree diff when no file given', async () => {
      fs.writeFileSync(filePath, 'line1\nline2\n');
      const result = await GitOperations.diff(tmpDir);
      expect(typeof result).toBe('string');
      expect(result).toContain('file.txt');
      expect(result).toContain('+line2');
    });

    test('returns diff scoped to a single file', async () => {
      fs.writeFileSync(filePath, 'line1\nline2\n');
      const result = await GitOperations.diff(tmpDir, 'file.txt');
      expect(typeof result).toBe('string');
      expect(result).toContain('+line2');
    });

    test('returns error object for non-git directory', async () => {
      const nonGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notgit_'));
      const result = await GitOperations.diff(nonGitDir);
      expect(result).toHaveProperty('error');
      fs.rmSync(nonGitDir, { recursive: true, force: true });
    });
  });

  describe('branches', () => {
    test('returns local branch summary with current branch set', async () => {
      const result = await GitOperations.branches(tmpDir);
      expect(result).toHaveProperty('all');
      expect(result).toHaveProperty('current');
      expect(result).toHaveProperty('branches');
      expect(result.all).toContain(result.current);
    });

    test('returns error object for non-git directory', async () => {
      const nonGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notgit_'));
      const result = await GitOperations.branches(nonGitDir);
      expect(result).toHaveProperty('error');
      fs.rmSync(nonGitDir, { recursive: true, force: true });
    });
  });

  describe('checkoutBranch', () => {
    test('creates and switches to a new branch when isNew is true', async () => {
      const result = await GitOperations.checkoutBranch(tmpDir, 'feature-x', true);
      expect(result).not.toHaveProperty('error');
      const branchInfo = await GitOperations.branches(tmpDir);
      expect(branchInfo.current).toBe('feature-x');
    });

    test('switches to an existing branch when isNew is false', async () => {
      const initialBranches = await GitOperations.branches(tmpDir);
      const original = initialBranches.current;
      await GitOperations.checkoutBranch(tmpDir, 'feature-y', true);
      const result = await GitOperations.checkoutBranch(tmpDir, original, false);
      expect(result).not.toHaveProperty('error');
      const branchInfo = await GitOperations.branches(tmpDir);
      expect(branchInfo.current).toBe(original);
    });

    test('returns error object when checking out a nonexistent branch', async () => {
      const result = await GitOperations.checkoutBranch(tmpDir, 'does-not-exist', false);
      expect(result).toHaveProperty('error');
    });
  });

  describe('push', () => {
    test('returns error object when no remote is configured', async () => {
      const result = await GitOperations.push(tmpDir);
      expect(result).toHaveProperty('error');
    });
  });

  describe('pull', () => {
    test('returns error object when no remote is configured', async () => {
      const result = await GitOperations.pull(tmpDir);
      expect(result).toHaveProperty('error');
    });
  });
});
