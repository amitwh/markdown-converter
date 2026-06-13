const simpleGit = require('simple-git');

function getGitInstance(dir) {
  return simpleGit(dir);
}

async function getStatus(dir) {
  try {
    const git = getGitInstance(dir);
    const result = await git.status();
    const files = [];
    for (const [filePath, status] of Object.entries(result.files || {})) {
      files.push({
        filePath,
        status:
          status.working_dir === 'M'
            ? 'modified'
            : status.working_dir === 'A' || status.index === 'A'
              ? 'added'
              : status.working_dir === 'D' || status.index === 'D'
                ? 'deleted'
                : 'untracked',
      });
    }
    return { files };
  } catch (_err) {
    return { files: [], error: 'Not a git repository' };
  }
}

async function stage(dir, files) {
  try {
    const git = getGitInstance(dir);
    await git.add(files);
    const result = await git.status();
    const staged = [];
    for (const [filePath, status] of Object.entries(result.files || {})) {
      staged.push({
        filePath,
        status:
          status.index === 'A'
            ? 'added'
            : status.index === 'M'
              ? 'modified'
              : status.index === 'D'
                ? 'deleted'
                : 'untracked',
      });
    }
    return { files: staged };
  } catch (err) {
    return { files: [], error: err.message };
  }
}

async function commit(dir, message) {
  try {
    const git = getGitInstance(dir);
    const result = await git.commit(message);
    return { summary: result?.summary || 'Committed' };
  } catch (err) {
    return { error: err.message };
  }
}

async function log(dir, maxCount = 20) {
  try {
    const git = getGitInstance(dir);
    const result = await git.log({ maxCount });
    return {
      latest: result?.latest || null,
      all: (result?.all || []).map((entry) => ({
        hash: entry.hash,
        message: entry.message,
        author: entry.author_name,
        date: entry.date,
      })),
    };
  } catch (err) {
    return { all: [], error: err.message };
  }
}

async function diff(dir, filePath) {
  try {
    const git = getGitInstance(dir);
    const args = filePath ? ['--', filePath] : [];
    return await git.diff(args);
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = { getStatus, stage, commit, log, diff };
