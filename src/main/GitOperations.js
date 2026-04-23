const simpleGit = require('simple-git');

function getGitInstance(dir) {
  return simpleGit(dir);
}

async function getStatus(dir) {
  try {
    const git = getGitInstance(dir);
    return await git.status();
  } catch (err) {
    return { error: 'Not a git repository' };
  }
}

async function stage(dir, files) {
  try {
    const git = getGitInstance(dir);
    await git.add(files);
    return await git.status();
  } catch (err) {
    return { error: err.message };
  }
}

async function commit(dir, message) {
  try {
    const git = getGitInstance(dir);
    return await git.commit(message);
  } catch (err) {
    return { error: err.message };
  }
}

async function log(dir, maxCount = 20) {
  try {
    const git = getGitInstance(dir);
    return await git.log({ maxCount });
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = { getStatus, stage, commit, log };
