const fs = require('fs');
const path = require('path');

// Regression guard for the deb startup crash (2026-08-23): the packaged build
// pruned the @img/sharp-* native bindings (only the pure-JS @img/colour entries
// landed in the asar), so sharp's loader fell back to a binding that links
// against system libvips and the main process died on ERR_DLOPEN_FAILED before
// any window opened. When a linux build is present, the prebuilt sharp packages
// — including the bundled libvips shared libraries — must be unpacked next to
// the asar (build.asarUnpack claims node_modules/@img/** and node_modules/@napi-rs/**).
const UNPACKED_IMG_DIR = path.join(
  __dirname,
  '..',
  'dist',
  'linux-unpacked',
  'resources',
  'app.asar.unpacked',
  'node_modules',
  '@img'
);

const buildOutputExists = fs.existsSync(UNPACKED_IMG_DIR);

function listFilesRecursively(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursively(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

(buildOutputExists ? describe : describe.skip)('packaged @img sharp prebuilt binaries', () => {
  test('unpacked @img directory exists and is non-empty', () => {
    const entries = fs.readdirSync(UNPACKED_IMG_DIR);
    expect(entries.length).toBeGreaterThan(0);
  });

  test.each(['sharp-linux-x64', 'sharp-libvips-linux-x64'])(
    '%s package is unpacked with contents',
    (pkg) => {
      const pkgDir = path.join(UNPACKED_IMG_DIR, pkg);
      expect(fs.existsSync(pkgDir)).toBe(true);
      expect(listFilesRecursively(pkgDir).length).toBeGreaterThan(0);
    }
  );

  test('sharp-linux-x64 ships its native binding', () => {
    // sharp 0.35 names the binding with a version suffix
    // (sharp-linux-x64-0.35.4.node); 0.34 used a bare name — accept both
    const libDir = path.join(UNPACKED_IMG_DIR, 'sharp-linux-x64', 'lib');
    const bindings = fs.readdirSync(libDir).filter((f) => /^sharp-linux-x64.*\.node$/.test(f));
    expect(bindings.length).toBeGreaterThan(0);
  });

  test('sharp-libvips-linux-x64 ships the bundled libvips shared libraries', () => {
    const libvipsLibDir = path.join(UNPACKED_IMG_DIR, 'sharp-libvips-linux-x64', 'lib');
    const sharedLibs = fs.readdirSync(libvipsLibDir).filter((f) => /^libvips.*\.so/.test(f));
    expect(sharedLibs.length).toBeGreaterThan(0);
  });
});
