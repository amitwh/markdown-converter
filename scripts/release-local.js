#!/usr/bin/env node
/**
 * Local release builder.
 *
 * Every invocation produces a *new* version + git tag and a local Linux
 * deb/AppImage build, so a build can be verified before any GitHub CI/CD
 * release is triggered.
 *
 * Usage:
 *   npm run release:local                 # patch bump, deb + AppImage
 *   npm run release:local -- --bump minor # minor bump
 *   npm run release:local -- --bump minor --publish
 *                                          # also push branch + tag (CI release)
 *   npm run release:local -- --skip-checks # skip test/lint (emergency only)
 *
 * The build writes `buildInfo` into package.json so the in-app About dialog
 * shows the version, build date and source commit for this artifact.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const pkgPath = path.join(ROOT, 'package.json');
const args = process.argv.slice(2);

function flag(name) {
  return args.includes(name);
}
function option(name, fallback) {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
}
function run(cmd, cmdArgs, opts = {}) {
  return execFileSync(cmd, cmdArgs, {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
    ...opts,
  });
}
function capture(cmd, cmdArgs) {
  return execFileSync(cmd, cmdArgs, { cwd: ROOT, encoding: 'utf8' }).trim();
}
function fail(message) {
  console.error(`\n[release:local] ${message}\n`);
  process.exit(1);
}
function istDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
function nextVersion(version, bump) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m) fail(`Unsupported version "${version}" — expected MAJOR.MINOR.PATCH`);
  let [, major, minor, patch] = m.map(Number);
  if (bump === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (bump === 'minor') {
    minor += 1;
    patch = 0;
  } else if (bump === 'patch') {
    patch += 1;
  } else {
    fail(`Unknown --bump value "${bump}" (use patch, minor or major)`);
  }
  return `${major}.${minor}.${patch}`;
}
function replaceOnce(file, from, to) {
  const abs = path.join(ROOT, file);
  const text = fs.readFileSync(abs, 'utf8');
  if (!text.includes(from)) return false;
  fs.writeFileSync(abs, text.replace(from, to));
  return true;
}

const bump = option('--bump', 'patch');
const publish = flag('--publish');
const skipChecks = flag('--skip-checks');

// 1. Refuse to release from a dirty tree unless explicitly overridden.
const dirty = capture('git', ['status', '--porcelain']);
if (dirty && !skipChecks) {
  fail('Working tree is dirty. Commit/stash changes first (or use --skip-checks).');
}

// 2. Verify before building.
if (!skipChecks) {
  console.log('[release:local] Running tests…');
  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['test']);
  console.log('[release:local] Running lint…');
  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'lint']);
}

const oldVersion = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
const newVersion = nextVersion(oldVersion, bump);
const headCommit = capture('git', ['rev-parse', '--short', 'HEAD']);
const electronVersion = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'node_modules', 'electron', 'package.json'), 'utf8')
).version;

// 3. Bump package.json + package-lock.json.
run(process.platform === 'win32' ? 'npm.cmd' : 'npm', [
  'version',
  bump,
  '--no-git-tag-version',
]);

// 4. Stamp build metadata for the About dialog.
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.buildInfo = {
  date: istDate(),
  commit: headCommit,
  electron: electronVersion,
};
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// 5. Keep the human-facing version strings in sync.
replaceOnce('README.md', `**Current release: v${oldVersion}**`, `**Current release: v${newVersion}**`);
replaceOnce('README.md', `\nv${oldVersion}\n`, `\nv${newVersion}\n`);
replaceOnce('CLAUDE.md', `**Version:** ${oldVersion}`, `**Version:** ${newVersion}`);

// 6. Release commit + tag.
run('git', ['add', '-A']);
run('git', ['commit', '-m', `chore(release): v${newVersion}`]);
run('git', ['tag', `v${newVersion}`]);

// 7. Local Linux release artifacts (deb + AppImage) — verified before CI.
console.log(`[release:local] Building flowchart editor bundle…`);
run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build:flowchart-editor']);
console.log(`[release:local] Building v${newVersion} Linux artifacts…`);
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
run(npx, [
  'electron-builder',
  '--config',
  'electron-builder.config.js',
  '--linux',
  'deb',
  'AppImage',
  '--publish=never',
]);

const dist = path.join(ROOT, 'dist');
const artifacts = fs.existsSync(dist)
  ? fs
      .readdirSync(dist)
      .filter((f) => /\.(deb|AppImage)$/.test(f) && f.includes(newVersion))
      .sort()
  : [];
console.log(`\n[release:local] v${newVersion} built.`);
for (const artifact of artifacts) console.log(`  dist/${artifact}`);
console.log(`  tag: v${newVersion}`);

if (publish) {
  const branch = capture('git', ['branch', '--show-current']);
  console.log(`[release:local] Pushing ${branch} and v${newVersion}…`);
  run('git', ['push', 'origin', branch]);
  run('git', ['push', 'origin', `v${newVersion}`]);
  console.log('[release:local] Pushed — GitHub Actions will create the release.');
} else {
  console.log(
    `[release:local] Not pushed. Publish with:\n  git push origin ${capture('git', ['branch', '--show-current'])} && git push origin v${newVersion}`
  );
}
