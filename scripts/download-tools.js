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

downloadPandoc().catch((err) => {
  console.error('[download-tools] FAILED:', err.message);
  process.exit(1);
});
