const AudioOperations = require('../../src/main/AudioOperations');

describe('AudioOperations argument builders', () => {
  test('buildConvertArgs builds correct ffmpeg args', () => {
    const args = AudioOperations.buildConvertArgs({ inputPath: '/a.wav', outputPath: '/b.mp3' });
    expect(args).toEqual(['-i', '/a.wav', '-y', '/b.mp3']);
  });

  test('buildTrimArgs builds correct trim args', () => {
    const args = AudioOperations.buildTrimArgs({
      inputPath: '/a.mp3',
      outputPath: '/b.mp3',
      startTime: 5,
      duration: 10,
    });
    expect(args).toEqual(['-i', '/a.mp3', '-ss', '5', '-t', '10', '-y', '/b.mp3']);
  });

  test('buildTrimArgs rejects non-finite startTime', () => {
    expect(() =>
      AudioOperations.buildTrimArgs({
        inputPath: '/a.mp3',
        outputPath: '/b.mp3',
        startTime: NaN,
        duration: 10,
      })
    ).toThrow('Invalid trim range');
  });

  test('buildMergeArgs builds concat-demuxer args and list content', () => {
    const { args, concatListContent } = AudioOperations.buildMergeArgs({
      inputPaths: ['/a.mp3', '/b.mp3'],
      outputPath: '/out.mp3',
    });
    expect(concatListContent).toContain("file '/a.mp3'");
    expect(concatListContent).toContain("file '/b.mp3'");
    expect(args).toContain('-f');
    expect(args).toContain('concat');
  });
});

describe('AudioOperations.executeOperation', () => {
  test('convert calls execFileFn with ffmpeg path and args, resolves success', async () => {
    const execFileFn = (cmd, args, opts, cb) => cb(null, '', '');
    const result = await AudioOperations.executeOperation(
      'convert',
      { inputPath: '/a.wav', outputPath: '/b.mp3' },
      { ffmpegPath: '/usr/bin/ffmpeg', execFileFn }
    );
    expect(result.success).toBe(true);
    expect(result.outputPath).toBe('/b.mp3');
  });

  test('unknown operation rejects', async () => {
    await expect(
      AudioOperations.executeOperation(
        'bogus',
        {},
        { ffmpegPath: '/usr/bin/ffmpeg', execFileFn: () => {} }
      )
    ).rejects.toThrow();
  });
});
