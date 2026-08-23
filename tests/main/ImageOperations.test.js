const sharp = require('sharp');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ImageOperations = require('../../src/main/ImageOperations');

describe('ImageOperations', () => {
  let tmpDir, inputPath;
  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imgops_'));
    inputPath = path.join(tmpDir, 'in.png');
    await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } } })
      .png()
      .toFile(inputPath);
  });
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  test('imageConvert converts PNG to JPEG', async () => {
    const outputPath = path.join(tmpDir, 'out.jpg');
    const result = await ImageOperations.imageConvert({ inputPath, outputPath, format: 'jpeg' });
    expect(result.success).toBe(true);
    expect(fs.existsSync(outputPath)).toBe(true);
    const meta = await sharp(outputPath).metadata();
    expect(meta.format).toBe('jpeg');
  });

  test('imageResize resizes to given width preserving aspect', async () => {
    const outputPath = path.join(tmpDir, 'out.png');
    await ImageOperations.imageResize({ inputPath, outputPath, width: 50, height: null, fit: 'inside' });
    const meta = await sharp(outputPath).metadata();
    expect(meta.width).toBe(50);
  });

  test('imageRotate rotates by given angle', async () => {
    const outputPath = path.join(tmpDir, 'out.png');
    await ImageOperations.imageRotate({ inputPath, outputPath, angle: 90 });
    const meta = await sharp(outputPath).metadata();
    expect(meta.width).toBe(100); // 90deg on square stays square
  });

  test('imageCompress produces a smaller or equal-size JPEG at low quality', async () => {
    const jpegPath = path.join(tmpDir, 'in.jpg');
    await sharp(inputPath).jpeg({ quality: 100 }).toFile(jpegPath);
    const outputPath = path.join(tmpDir, 'compressed.jpg');
    await ImageOperations.imageCompress({ inputPath: jpegPath, outputPath, quality: 10 });
    expect(fs.statSync(outputPath).size).toBeLessThanOrEqual(fs.statSync(jpegPath).size);
  });

  test('executeOperation dispatches to the correct function', async () => {
    const outputPath = path.join(tmpDir, 'out.png');
    const result = await ImageOperations.executeOperation('rotate', { inputPath, outputPath, angle: 180 });
    expect(result.success).toBe(true);
  });

  test('unknown operation throws', async () => {
    await expect(ImageOperations.executeOperation('bogus', {})).rejects.toThrow();
  });
});
