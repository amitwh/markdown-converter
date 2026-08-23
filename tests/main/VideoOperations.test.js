const fs = require('fs');
const path = require('path');
const VideoOperations = require('../../src/main/VideoOperations');

describe('VideoOperations argument builders', () => {
  test('buildConvertArgs builds correct ffmpeg args', () => {
    const args = VideoOperations.buildConvertArgs({ inputPath: '/a.mov', outputPath: '/b.mp4' });
    expect(args).toEqual(['-i', '/a.mov', '-y', '/b.mp4']);
  });

  test('buildCompressArgs builds correct compress args with given crf', () => {
    const args = VideoOperations.buildCompressArgs({
      inputPath: '/a.mp4',
      outputPath: '/b.mp4',
      crf: 23,
    });
    expect(args).toEqual(['-i', '/a.mp4', '-vcodec', 'libx264', '-crf', '23', '-y', '/b.mp4']);
  });

  test('buildCompressArgs defaults crf to 28', () => {
    const args = VideoOperations.buildCompressArgs({ inputPath: '/a.mp4', outputPath: '/b.mp4' });
    expect(args).toEqual(['-i', '/a.mp4', '-vcodec', 'libx264', '-crf', '28', '-y', '/b.mp4']);
  });

  test('buildCompressArgs rejects out-of-range crf', () => {
    expect(() =>
      VideoOperations.buildCompressArgs({ inputPath: '/a.mp4', outputPath: '/b.mp4', crf: 52 })
    ).toThrow();
  });

  test('buildCompressArgs rejects non-integer crf', () => {
    expect(() =>
      VideoOperations.buildCompressArgs({ inputPath: '/a.mp4', outputPath: '/b.mp4', crf: 12.5 })
    ).toThrow();
  });

  test('buildTrimArgs builds correct trim args', () => {
    const args = VideoOperations.buildTrimArgs({
      inputPath: '/a.mp4',
      outputPath: '/b.mp4',
      startTime: 5,
      duration: 10,
    });
    expect(args).toEqual(['-i', '/a.mp4', '-ss', '5', '-t', '10', '-y', '/b.mp4']);
  });

  test('buildTrimArgs rejects non-finite startTime', () => {
    expect(() =>
      VideoOperations.buildTrimArgs({
        inputPath: '/a.mp4',
        outputPath: '/b.mp4',
        startTime: NaN,
        duration: 10,
      })
    ).toThrow('Invalid trim range');
  });

  test('buildFramesArgs builds correct frame extraction args with given fps', () => {
    const args = VideoOperations.buildFramesArgs({
      inputPath: '/a.mp4',
      outputDir: '/out',
      fps: 2,
    });
    expect(args).toEqual(['-i', '/a.mp4', '-vf', 'fps=2', path.join('/out', 'frame-%04d.png')]);
  });

  test('buildFramesArgs defaults fps to 1', () => {
    const args = VideoOperations.buildFramesArgs({ inputPath: '/a.mp4', outputDir: '/out' });
    expect(args).toEqual(['-i', '/a.mp4', '-vf', 'fps=1', path.join('/out', 'frame-%04d.png')]);
  });

  test('buildFramesArgs rejects non-positive fps', () => {
    expect(() =>
      VideoOperations.buildFramesArgs({ inputPath: '/a.mp4', outputDir: '/out', fps: 0 })
    ).toThrow();
  });

  test('buildFramesArgs rejects non-finite fps', () => {
    expect(() =>
      VideoOperations.buildFramesArgs({ inputPath: '/a.mp4', outputDir: '/out', fps: Infinity })
    ).toThrow();
  });

  test('buildGifArgs builds correct gif args with defaults', () => {
    const args = VideoOperations.buildGifArgs({ inputPath: '/a.mp4', outputPath: '/b.gif' });
    expect(args).toEqual([
      '-i',
      '/a.mp4',
      '-vf',
      'fps=10,scale=480:-1:flags=lanczos',
      '-y',
      '/b.gif',
    ]);
  });

  test('buildGifArgs builds correct gif args with given fps and width', () => {
    const args = VideoOperations.buildGifArgs({
      inputPath: '/a.mp4',
      outputPath: '/b.gif',
      fps: 15,
      width: 320,
    });
    expect(args).toEqual([
      '-i',
      '/a.mp4',
      '-vf',
      'fps=15,scale=320:-1:flags=lanczos',
      '-y',
      '/b.gif',
    ]);
  });
});

describe('VideoOperations.executeOperation', () => {
  test('convert calls execFileFn with ffmpeg path and args, resolves success', async () => {
    const execFileFn = (cmd, args, opts, cb) => cb(null, '', '');
    const result = await VideoOperations.executeOperation(
      'convert',
      { inputPath: '/a.mov', outputPath: '/b.mp4' },
      { ffmpegPath: '/usr/bin/ffmpeg', execFileFn }
    );
    expect(result.success).toBe(true);
    expect(result.outputPath).toBe('/b.mp4');
  });

  test('frames creates the output directory before spawning ffmpeg and resolves success', async () => {
    const mkdirSpy = jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
    const execFileFn = jest.fn((cmd, args, opts, cb) => cb(null, '', ''));

    const result = await VideoOperations.executeOperation(
      'frames',
      { inputPath: '/a.mp4', outputDir: '/out', fps: 1 },
      { ffmpegPath: '/usr/bin/ffmpeg', execFileFn }
    );

    expect(mkdirSpy).toHaveBeenCalledWith('/out', { recursive: true });
    expect(mkdirSpy.mock.invocationCallOrder[0]).toBeLessThan(
      execFileFn.mock.invocationCallOrder[0]
    );
    expect(result.success).toBe(true);
    expect(result.outputDir).toBe('/out');

    mkdirSpy.mockRestore();
  });

  test('unknown operation rejects', async () => {
    await expect(
      VideoOperations.executeOperation(
        'bogus',
        {},
        { ffmpegPath: '/usr/bin/ffmpeg', execFileFn: () => {} }
      )
    ).rejects.toThrow();
  });
});
