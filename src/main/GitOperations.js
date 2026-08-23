const simpleGit = require('simple-git');

function getGitInstance(dir) {
  return simpleGit(dir);
}

async function getStatus(dir) {
  try {
    const git = getGitInstance(dir);
    return await git.status();
  } catch {
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

// againstHead=true compares the working tree (staged + unstaged) against the last
// commit instead of against the index — used by the Document Compare dialog's
// "Git HEAD" mode. Default behavior (worktree vs index) is unchanged.
async function diff(dir, file, againstHead = false) {
  try {
    const git = getGitInstance(dir);
    if (againstHead) {
      return file ? await git.diff(['HEAD', '--', file]) : await git.diff('HEAD');
    }
    return file ? await git.diff([file]) : await git.diff();
  } catch (err) {
    return { error: err.message };
  }
}

async function branches(dir) {
  try {
    const git = getGitInstance(dir);
    return await git.branchLocal();
  } catch (err) {
    return { error: err.message };
  }
}

async function checkoutBranch(dir, name, isNew) {
  try {
    const git = getGitInstance(dir);
    return isNew ? await git.checkoutLocalBranch(name) : await git.checkout(name);
  } catch (err) {
    return { error: err.message };
  }
}

async function push(dir) {
  try {
    const git = getGitInstance(dir);
    return await git.push();
  } catch (err) {
    return { error: err.message };
  }
}

async function pull(dir) {
  try {
    const git = getGitInstance(dir);
    return await git.pull();
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = { getStatus, stage, commit, log, diff, branches, checkoutBranch, push, pull };
