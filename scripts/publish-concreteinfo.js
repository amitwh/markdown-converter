#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const version = process.argv[2] || require('../package.json').version;
const hook = process.env.CONCRETEINFO_DEPLOY_HOOK;
if (!hook) {
  console.error('CONCRETEINFO_DEPLOY_HOOK not set');
  process.exit(1);
}

const candidates = [
  'latest-mac.yml',
  'latest-linux.yml',
  'latest-windows.yml',
  `MarkdownConverter-${version}.dmg`,
  `markdown-converter_${version}_amd64.deb`,
  `MarkdownConverter-Setup-${version}.exe`,
];

const dist = path.resolve(__dirname, '..', 'dist');
for (const f of candidates) {
  if (!fs.existsSync(path.join(dist, f))) {
    console.error(`missing ${f} — run electron-builder first`);
    process.exit(1);
  }
}

const form = new FormData();
form.append('version', version);
for (const f of candidates) {
  if (fs.existsSync(path.join(dist, f))) {
    form.append('artifacts', fs.createReadStream(path.join(dist, f)), f);
  }
}

fetch('https://updates.concreteinfo.co.in/api/v1/ingest', {
  method: 'POST',
  headers: { Authorization: `Bearer ${hook}` },
  body: form,
})
  .then((r) => {
    console.log('ingest status', r.status);
    process.exit(r.ok ? 0 : 1);
  })
  .catch((e) => {
    console.error('ingest failed:', e);
    process.exit(1);
  });