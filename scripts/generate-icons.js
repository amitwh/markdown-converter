/**
 * Icon Generator for MarkdownConverter
 *
 * Rasterizes the brand kit's vector app icon (the "M↓" mark,
 * assets/markdown-converter-assets/app-icon.svg) into every size the app and
 * its packaging need:
 *
 *   assets/icon.png      512×512   — app icon (electron-builder converts to
 *                                    .ico/.icns for Windows/macOS from this)
 *   assets/icon@2x.png  1024×1024  — hi-dpi variant
 *   assets/favicon.png    32×32    — in-app/browser favicon
 *   assets/tray-icon.png  24×24    — system tray
 *   assets/icons/*      16…1024    — multi-size set (ico/icns input)
 *
 * assets/logo.png is NOT touched — that is the ConcreteInfo logo used in the
 * app header and About dialog.
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Brand kit sources (vector, primary)
const brandDir = path.join(__dirname, '..', 'assets', 'markdown-converter-assets');
const sourceSvg = path.join(brandDir, 'app-icon.svg');
const assetsDir = path.join(__dirname, '..', 'assets');

// Icon sizes needed for different platforms
const iconSizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

/**
 * Rasterize the SVG source at a given size. `density` scales the vector so
 * small renders stay crisp; the explicit resize guarantees exact dimensions.
 */
async function renderIcon(size, outPath) {
  await sharp(sourceSvg, { density: Math.max(72, Math.round((size / 512) * 384)) })
    .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toFile(outPath);
  console.log(`Generated ${path.relative(process.cwd(), outPath)} (${size}x${size})`);
}

async function generateIcons() {
  console.log('Generating icons from the brand kit (app-icon.svg)...');

  if (!fs.existsSync(sourceSvg)) {
    console.error('Brand source not found:', sourceSvg);
    process.exit(1);
  }

  try {
    // Main app icons consumed by main.js windows and electron-builder
    await renderIcon(512, path.join(assetsDir, 'icon.png'));
    await renderIcon(1024, path.join(assetsDir, 'icon@2x.png'));

    // Favicon + tray
    await renderIcon(32, path.join(assetsDir, 'favicon.png'));
    await renderIcon(24, path.join(assetsDir, 'tray-icon.png'));

    // Multi-size set for packaging converters (ico/icns)
    const iconsDir = path.join(assetsDir, 'icons');
    fs.mkdirSync(iconsDir, { recursive: true });
    for (const size of iconSizes) {
      await renderIcon(size, path.join(iconsDir, `${size}x${size}.png`));
    }

    console.log('\nIcon generation complete!');
    console.log('Windows .ico and macOS .icns are generated automatically by');
    console.log('electron-builder from assets/icon.png during packaging.');
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();
