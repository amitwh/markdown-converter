/**
 * Icon Generator for MarkdownConverter
 * Generates all required icon sizes from NewIcon.jpg
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Source image
const sourceImage = path.join(__dirname, '..', 'assets', 'docico1.png');
const assetsDir = path.join(__dirname, '..', 'assets');

// Icon sizes needed for different platforms
const iconSizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

async function generateIcons() {
  console.log('Generating icons from docico1.png...');

  // Check if source exists
  if (!fs.existsSync(sourceImage)) {
    console.error('Source image not found:', sourceImage);
    process.exit(1);
  }

  try {
    // Generate main icon.png (512x512)
    await sharp(sourceImage)
      .resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toFile(path.join(assetsDir, 'icon.png'));
    console.log('Generated icon.png (512x512)');

    // Generate icon@2x.png (1024x1024)
    await sharp(sourceImage)
      .resize(1024, 1024, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toFile(path.join(assetsDir, 'icon@2x.png'));
    console.log('Generated icon@2x.png (1024x1024)');

    // Create icons directory for multi-size icons
    const iconsDir = path.join(assetsDir, 'icons');
    if (!fs.existsSync(iconsDir)) {
      fs.mkdirSync(iconsDir, { recursive: true });
    }

    // Generate all sizes
    for (const size of iconSizes) {
      await sharp(sourceImage)
        .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
        .png()
        .toFile(path.join(iconsDir, `${size}x${size}.png`));
      console.log(`Generated icons/${size}x${size}.png`);
    }

    // Generate favicon
    await sharp(sourceImage)
      .resize(32, 32, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toFile(path.join(assetsDir, 'favicon.png'));
    console.log('Generated favicon.png (32x32)');

    // Generate tray icon (smaller, for system tray)
    await sharp(sourceImage)
      .resize(24, 24, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toFile(path.join(assetsDir, 'tray-icon.png'));
    console.log('Generated tray-icon.png (24x24)');

    console.log('\nIcon generation complete!');
    console.log('\nFor Windows .ico file, use an online converter or:');
    console.log('  magick convert assets/icons/*.png assets/icon.ico');
    console.log('\nFor macOS .icns file, use:');
    console.log('  iconutil -c icns assets/icon.iconset -o assets/icon.icns');

  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();
