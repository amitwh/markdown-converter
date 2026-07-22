#!/usr/bin/env node
/**
 * Downloads pandoc binary for the current build platform.
 * Run automatically via `npm run download-tools` before building.
 * Skips download if binary already exists (idempotent).
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const PANDOC_VERSION = '3.9.0.2';

/**
 * Pandoc's archive inner layout has shifted across releases and platforms:
 *   linux  tarball: pandoc-3.9.0.2/bin/pandoc
 *   win32  zip:     pandoc-3.9.0.2/pandoc.exe
 *   darwin zip:     pandoc-3.9.0.2-x86_64/bin/pandoc   (arch-suffixed inner dir)
 *                   pandoc-3.9.0.2-arm64/bin/pandoc    (on Apple Silicon builds)
 * Rather than hard-coding the intermediate path — which has already broken
 * once when pandoc 3.9 added the arch suffix to the macOS archive — we walk
 * the extracted tree and find the binary by name. This is robust to future
 * layout shifts (e.g., universal binaries renaming the inner dir).
 */
function findFile(rootDir, targetName) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(rootDir, entry.name);
    if (entry.isFile() && entry.name === targetName) return full;
    if (entry.isDirectory()) {
      const found = findFile(full, targetName);
      if (found) return found;
    }
  }
  return null;
}

const PANDOC_CONFIG = {
  linux: {
    url: `https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-linux-amd64.tar.gz`,
    archiveExt: '.tar.gz',
    destFile: 'pandoc',
    extract(archivePath, destDir) {
      const tmpDir = path.join(os.tmpdir(), `pandoc-${Date.now()}`);
      fs.mkdirSync(tmpDir, { recursive: true });
      execSync(`tar -xzf "${archivePath}" -C "${tmpDir}"`);
      const src = findFile(tmpDir, 'pandoc');
      if (!src) throw new Error(`pandoc binary not found under ${tmpDir}`);
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
      const src = findFile(tmpDir, 'pandoc.exe');
      if (!src) throw new Error(`pandoc.exe not found under ${tmpDir}`);
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
      const src = findFile(tmpDir, 'pandoc');
      if (!src) throw new Error(`pandoc binary not found under ${tmpDir}`);
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
    console.log(`[download-tools] pandoc already present at ${destFile} — skipping.`);
    return;
  }

  fs.mkdirSync(destDir, { recursive: true });

  const tmpArchive = path.join(os.tmpdir(), `pandoc-download${config.archiveExt}`);

  console.log(`[download-tools] Downloading pandoc ${PANDOC_VERSION} for ${platform}...`);
  await download(config.url, tmpArchive);

  console.log(`[download-tools] Extracting to ${destDir}...`);
  config.extract(tmpArchive, destDir);

  try {
    fs.unlinkSync(tmpArchive);
  } catch (_) {
    /* ignore */
  }

  console.log(`[download-tools] pandoc ready: ${destFile}`);
}

async function downloadFiraCode() {
  const targetDir = path.resolve(__dirname, '..', 'assets', 'fonts');
  fs.mkdirSync(targetDir, { recursive: true });
  // Pinned to an immutable release tag with explicit SHA-256 digests so the
  // build fails loudly on any upstream tampering or accidental change.
  // Update the version + digests together when bumping Fira Code.
  const FIRA_CODE_VERSION = '6.2';
  const baseUrl = `https://github.com/tonsky/FiraCode/releases/download/${FIRA_CODE_VERSION}`;
  const files = [
    { url: `${baseUrl}/FiraCode-Regular.ttf`, out: 'FiraCode-Regular.ttf', sha256: '3c79d234a9161c790410ebb2a80de7efb7c15f581062c130e0fa78503ccdd0da' },
    { url: `${baseUrl}/FiraCode-Bold.ttf`, out: 'FiraCode-Bold.ttf', sha256: '975f26779fac1029c2cbdac1e9fac7e9ddeec05e064675e4aac63bffa121742f' },
    { url: `${baseUrl}/FiraCode-LICENSE.txt`, out: 'FiraCode-LICENSE.txt', sha256: null },
  ];
  for (const f of files) {
    const dest = path.join(targetDir, f.out);
    if (fs.existsSync(dest)) {
      console.log(`[download-tools] Fira Code asset already present at ${dest} — skipping.`);
      continue;
    }
    if (!f.sha256 || !/^[a-f0-9]{64}$/i.test(f.sha256)) {
      throw new Error(
        `[download-tools] Refusing to download ${f.url}: SHA-256 digest not pinned. ` +
          'Update scripts/download-tools.js with the digest from the official Fira Code release before building.'
      );
    }
    const tmp = `${dest}.tmp`;
    console.log(`[download-tools] Downloading ${f.url}...`);
    await download(f.url, tmp);
    const actual = require('crypto').createHash('sha256').update(fs.readFileSync(tmp)).digest('hex');
    if (actual !== f.sha256) {
      fs.unlinkSync(tmp);
      throw new Error(
        `[download-tools] SHA-256 mismatch for ${f.url}: expected ${f.sha256}, got ${actual}`
      );
    }
    fs.renameSync(tmp, dest);
  }
  console.log('[download-tools] Fira Code ready');
}

Promise.all([downloadPandoc(), downloadFiraCode()]).catch((err) => {
  console.error('[download-tools] FAILED:', err.message);
  process.exit(1);
});
