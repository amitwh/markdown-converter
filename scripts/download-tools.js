#!/usr/bin/env node
/**
 * Downloads pandoc binary for the current build platform.
 * Run automatically via `npm run download-tools` before building.
 * Skips download if binary already exists (idempotent).
 *
 * Security: every artifact with a known hash is verified with SHA-256 after
 * download AND on every run (defending the build against a tampered cache /
 * compromised mirror). When a hash is missing for a platform, the computed
 * hash is printed so CI can pin it — add it to KNOWN_SHA256 below.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');

const PANDOC_VERSION = '3.9.0.2';
const FIRACODE_VERSION = '6.2';

/**
 * SHA-256 of each downloaded artifact, keyed "<platform>:<file>" or
 * "fonts:<file>". Computed with `sha256sum` from the pristine upstream
 * artifacts; keep in sync when bumping versions.
 */
const KNOWN_SHA256 = {
  'linux:pandoc': '7d124235998ecd3cdd9a463b1e5f6691a178b6461824c29a36170a0882f05597',
  'win32:pandoc.exe': 'e83f8354c0f507222b5684797b9c5ae766f03889785995d14aac27816ec456ba',
  // Fill these from a trusted machine after the first download of each
  // platform (the script prints the computed hash):
  // 'darwin:pandoc': '…',
  // Fira Code 6.2 (immutable GitHub release asset)
  'fonts:FiraCode-Regular.ttf': '5992ab9640e2df491b2f609467b1de60e8bc39b2c28db184342a0592d98f6117',
  'fonts:FiraCode-Bold.ttf': '41f6554e845e2f5b70adad3950122334b866aac436793b7742ade600067701be',
  'fonts:FiraCode-LICENSE.txt': '1d41e10031ab125302780a05ec4c91d218e47db0c7e37cf315cce5e608cdc25c',
};

/** sha256 of a file's contents, hex-encoded. */
function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

/** Recursively find an executable file by name inside a directory. */
function findBinary(dir, name) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const hit = findBinary(full, name);
      if (hit) return hit;
    } else if (entry.name === name || entry.name === name + '.exe') {
      return full;
    }
  }
  return null;
}

/**
 * Verify a file against KNOWN_SHA256. Throws on mismatch; prints the computed
 * hash with a pin-me hint when no hash is recorded yet (soft-fail so new
 * platforms bootstrap, hard-fail so tampering never passes silently).
 */
function verifyArtifact(key, filePath) {
  const actual = sha256File(filePath);
  const expected = KNOWN_SHA256[key];
  if (!expected) {
    console.warn(
      `[download-tools] WARNING: no pinned SHA-256 for "${key}".\n` +
        `  Computed: ${actual}\n` +
        '  Verify it against the upstream artifact and add it to KNOWN_SHA256.'
    );
    return;
  }
  if (actual !== expected) {
    throw new Error(
      `SHA-256 mismatch for ${key}!\n  expected ${expected}\n  actual   ${actual}\n` +
        'Delete the file and re-run; if the mismatch persists, do NOT ship it.'
    );
  }
  console.log(`[download-tools] SHA-256 OK for ${key}`);
}

const PANDOC_CONFIG = {
  linux: {
    url: `https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-linux-amd64.tar.gz`,
    archiveExt: '.tar.gz',
    destFile: 'pandoc',
    extract(archivePath, destDir) {
      const tmpDir = path.join(os.tmpdir(), `pandoc-${Date.now()}`);
      fs.mkdirSync(tmpDir, { recursive: true });
      execSync(`tar -xzf "${archivePath}" -C "${tmpDir}" pandoc-${PANDOC_VERSION}/bin/pandoc`);
      const src = path.join(tmpDir, `pandoc-${PANDOC_VERSION}`, 'bin', 'pandoc');
      fs.copyFileSync(src, path.join(destDir, 'pandoc'));
      fs.chmodSync(path.join(destDir, 'pandoc'), 0o755);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  },
  win32: {
    url: `https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-windows-x86_64.zip`,
    archiveExt: '.zip',
    destFile: 'pandoc.exe',
    extract(archivePath, destDir) {
      const tmpDir = path.join(os.tmpdir(), `pandoc-${Date.now()}`);
      fs.mkdirSync(tmpDir, { recursive: true });
      execSync(
        `powershell -Command "Expand-Archive -Force '${archivePath}' '${tmpDir}'"`,
      );
      const src = path.join(tmpDir, `pandoc-${PANDOC_VERSION}`, 'pandoc.exe');
      fs.copyFileSync(src, path.join(destDir, 'pandoc.exe'));
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  },
  darwin: {
    url: `https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-x86_64-macOS.zip`,
    archiveExt: '.zip',
    destFile: 'pandoc',
    extract(archivePath, destDir) {
      const tmpDir = path.join(os.tmpdir(), `pandoc-${Date.now()}`);
      fs.mkdirSync(tmpDir, { recursive: true });
      execSync(`unzip -o "${archivePath}" -d "${tmpDir}"`);
      // macOS zips don't carry a stable layout (bin/ subdir vs. flat) —
      // locate the binary in the extracted tree instead of guessing a path
      const found = findBinary(tmpDir, 'pandoc');
      if (!found) throw new Error('pandoc binary not found inside the macOS archive');
      fs.copyFileSync(found, path.join(destDir, 'pandoc'));
      fs.chmodSync(path.join(destDir, 'pandoc'), 0o755);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  },
};

function download(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    let received = 0;
    let total = 0;
    let lastPct = -1;

    function get(redirectUrl) {
      const client = redirectUrl.startsWith('https://') ? https : http;
      client
        .get(redirectUrl, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            get(res.headers.location);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} for ${redirectUrl}`));
            return;
          }
          total = parseInt(res.headers['content-length'] || '0', 10);
          res.on('data', (chunk) => {
            received += chunk.length;
            if (total > 0) {
              const pct = Math.floor((received / total) * 100);
              if (pct !== lastPct && pct % 10 === 0) {
                process.stdout.write(`  ${pct}%\r`);
                lastPct = pct;
              }
            }
          });
          res.pipe(file);
          file.on('finish', () => {
            file.close();
            process.stdout.write('  100%\n');
            resolve();
          });
        })
        .on('error', (err) => {
          fs.unlink(destPath, () => {});
          reject(err);
        });
    }
    get(url);
  });
}

async function downloadFiraCode() {
  const destDir = path.join(__dirname, '..', 'assets', 'fonts');
  fs.mkdirSync(destDir, { recursive: true });
  const wanted = ['FiraCode-Regular.ttf', 'FiraCode-Bold.ttf', 'FiraCode-LICENSE.txt'];

  // All three present (and hash-verified) → nothing to do
  const missing = wanted.filter((f) => !fs.existsSync(path.join(destDir, f)));
  if (missing.length === 0) {
    for (const f of wanted) verifyArtifact(`fonts:${f}`, path.join(destDir, f));
    console.log('[download-tools] Fira Code already present — skipping.');
    return;
  }

  // Immutable release asset (raw/master URLs move and break hash pinning)
  const zipUrl = `https://github.com/tonsky/FiraCode/releases/download/${FIRACODE_VERSION}/Fira_Code_v${FIRACODE_VERSION}.zip`;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `firacode-${Date.now()}`));
  const tmpZip = path.join(tmpDir, 'firacode.zip');
  console.log(`[download-tools] Downloading Fira Code ${FIRACODE_VERSION}...`);
  await download(zipUrl, tmpZip);
  execSync(`unzip -o -j "${tmpZip}" "ttf/FiraCode-Regular.ttf" "ttf/FiraCode-Bold.ttf" -d "${tmpDir}"`);

  fs.copyFileSync(path.join(tmpDir, 'FiraCode-Regular.ttf'), path.join(destDir, 'FiraCode-Regular.ttf'));
  fs.copyFileSync(path.join(tmpDir, 'FiraCode-Bold.ttf'), path.join(destDir, 'FiraCode-Bold.ttf'));
  // License text from the immutable tag
  await download(
    `https://raw.githubusercontent.com/tonsky/FiraCode/${FIRACODE_VERSION}/LICENSE`,
    path.join(destDir, 'FiraCode-LICENSE.txt')
  );
  fs.rmSync(tmpDir, { recursive: true, force: true });

  for (const f of wanted) verifyArtifact(`fonts:${f}`, path.join(destDir, f));
}

async function downloadPandoc() {
  const platform = process.platform;
  const config = PANDOC_CONFIG[platform];

  if (!config) {
    console.log(`[download-tools] No pandoc config for platform "${platform}" — skipping.`);
    return;
  }

  const destDir = path.join(__dirname, '..', 'bin', platform);
  const destFile = path.join(destDir, config.destFile);

  if (fs.existsSync(destFile)) {
    verifyArtifact(`${platform}:${config.destFile}`, destFile);
    console.log(`[download-tools] pandoc already present at ${destFile} — skipping.`);
    return;
  }

  fs.mkdirSync(destDir, { recursive: true });

  const tmpArchive = path.join(os.tmpdir(), `pandoc-download${config.archiveExt}`);

  console.log(`[download-tools] Downloading pandoc ${PANDOC_VERSION} for ${platform}...`);
  await download(config.url, tmpArchive);

  console.log(`[download-tools] Extracting to ${destDir}...`);
  config.extract(tmpArchive, destDir);
  verifyArtifact(`${platform}:${config.destFile}`, destFile);

  try {
    fs.unlinkSync(tmpArchive);
  } catch (_) {
    /* ignore */
  }

  console.log(`[download-tools] pandoc ready: ${destFile}`);
}

Promise.all([downloadPandoc(), downloadFiraCode()]).catch((err) => {
  console.error('[download-tools] FAILED:', err.message);
  process.exit(1);
});
