/**
 * electron-builder configuration (replaces the static package.json "build"
 * section so it can be computed dynamically).
 *
 * Why a JS config: the bundled markitdown binary is OPTIONAL at build time —
 * PyInstaller can only build for the host OS, so e.g. a Windows package
 * built on a machine without bin/win32/markitdown.exe must simply omit it
 * (the app falls back to system-installed markitdown at runtime) instead of
 * failing on a missing extraFiles source.
 *
 * Everything else mirrors the previous static config verbatim.
 */
const fs = require('fs');
const path = require('path');

/** Common extraFiles for a platform: pandoc always, markitdown when built. */
function toolExtraFiles(platform) {
  const exe = platform === 'win32' ? '.exe' : '';
  const files = [{ from: `bin/${platform}/pandoc${exe}`, to: `bin/pandoc${exe}` }];
  const markitdown = `bin/${platform}/markitdown${exe}`;
  if (fs.existsSync(path.join(__dirname, markitdown))) {
    files.push({ from: markitdown, to: `bin/markitdown${exe}` });
  } else {
    console.warn(
      `[electron-builder.config] ${markitdown} not found — building WITHOUT the ` +
        'bundled markitdown (the app will use a system install if present). ' +
        'Run "npm run bundle:markitdown" on this platform to bundle it.'
    );
  }
  return files;
}

module.exports = {
  appId: 'com.concreteinfo.markdownconverter',
  productName: 'MarkdownConverter',
  copyright: 'Copyright (C) 2024-2025 ConcreteInfo',
  directories: { output: 'dist' },
  icon: 'assets/icon',
  files: [
    'src/**/*',
    'assets/**/*',
    'scripts/**/*',
    'node_modules/**/*',
    'package.json',
    'THIRD-PARTY-NOTICES.md',
    'SOURCES.md',
    'third-party-licenses/**/*',
  ],
  asarUnpack: [
    'node_modules/ffmpeg-static/**',
    'node_modules/sharp/**',
    'node_modules/@img/**',
    'node_modules/@napi-rs/**',
    'assets/fonts/**',
  ],
  fileAssociations: [
    {
      ext: 'md',
      name: 'Markdown Document',
      description: 'Markdown Document',
      mimeType: 'text/markdown',
      role: 'Editor',
    },
    {
      ext: 'markdown',
      name: 'Markdown Document',
      description: 'Markdown Document',
      mimeType: 'text/markdown',
      role: 'Editor',
    },
    {
      ext: 'pdf',
      name: 'PDF Document',
      description: 'PDF Document',
      mimeType: 'application/pdf',
      role: 'Editor',
    },
  ],
  mac: {
    category: 'public.app-category.productivity',
    identity: null,
    extraFiles: toolExtraFiles('darwin'),
  },
  win: {
    target: [
      { target: 'nsis', arch: ['x64'] },
      { target: 'portable', arch: ['x64'] },
      { target: 'zip', arch: ['x64'] },
    ],
    artifactName: '${productName}-${version}-${arch}.${ext}',
    requestedExecutionLevel: 'asInvoker',
    legalTrademarks: 'Copyright (C) 2024-2025 ConcreteInfo',
    verifyUpdateCodeSignature: false,
    signAndEditExecutable: false,
    extraFiles: toolExtraFiles('win32'),
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    displayLanguageSelector: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'MarkdownConverter',
    runAfterFinish: true,
    menuCategory: 'Productivity',
    license: 'LICENSE',
    warningsAsErrors: false,
    artifactName: '${productName}-Setup-${version}.${ext}',
    deleteAppDataOnUninstall: false,
    differentialPackage: true,
  },
  linux: {
    target: ['deb', 'AppImage', 'snap'],
    category: 'Utility',
    maintainer: 'ConcreteInfo <amit.wh@gmail.com>',
    extraFiles: toolExtraFiles('linux'),
  },
  deb: {
    depends: ['imagemagick', 'libreoffice-common'],
    description: 'Professional Markdown editor and universal file converter',
    maintainer: 'ConcreteInfo <amit.wh@gmail.com>',
  },
};
