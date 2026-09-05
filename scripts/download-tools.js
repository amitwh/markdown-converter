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

/**
 * SHA-256 of each downloaded artifact, keyed "<platform>:<file>" or
 * "fonts:<file>". Computed with `sha256sum` from the pristine upstream
 * artifacts; keep in sync when bumping versions.
 */
const KNOWN_SHA256 = {
  'linux:pandoc': '7d124235998ecd3cdd9a463b1e5f6691a178b6461824c29a36170a0882f05597',
  // Fill these from a trusted machine after the first download of each
  // platform (the script prints the computed hash):
  // 'win32:pandoc.exe': '…',
  // 'darwin:pandoc': '…',
  'fonts:FiraCode-Regular.ttf': '3c79d234a9161c790410ebb2a80de7efb7c15f581062c130e0fa78503ccdd0da',
  'fonts:FiraCode-Bold.ttf': '975f26779fac1029c2cbdac1e9fac7e9ddeec05e064675e4aac63bffa121742f',
  'fonts:FiraCode-LICENSE.txt': '1d41e10031ab125302780a05ec4c91d218e47db0c7e37cf315cce5e608cdc25c',
};

/** sha256 of a file's contents, hex-encoded. */
function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
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
      const src = path.join(tmpDir, `pandoc-${PANDOC_VERSION}`, 'bin', 'pandoc');
      fs.copyFileSync(src, path.join(destDir, 'pandoc'));
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

  const targets = [
    { url: 'https://github.com/tonsky/FiraCode/raw/master/distr/ttf/FiraCode-Regular.ttf', out: 'FiraCode-Regular.ttf' },
    { url: 'https://github.com/tonsky/FiraCode/raw/master/distr/ttf/FiraCode-Bold.ttf',    out: 'FiraCode-Bold.ttf' },
    { url: 'https://raw.githubusercontent.com/tonsky/FiraCode/master/LICENSE',            out: 'FiraCode-LICENSE.txt' },
  ];

  for (const t of targets) {
    const destFile = path.join(destDir, t.out);
    if (fs.existsSync(destFile)) {
      // Re-verify cached artifacts so a tampered cache never ships
      verifyArtifact(`fonts:${t.out}`, destFile);
      console.log(`[download-tools] ${t.out} already present — skipping.`);
      continue;
    }
    console.log(`[download-tools] Downloading ${t.out}...`);
    await download(t.url, destFile);
    verifyArtifact(`fonts:${t.out}`, destFile);
  }
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
