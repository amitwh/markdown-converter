/**
 * Video Operations Module
 *
 * Handles video manipulation via `ffmpeg`: format conversion, compression, trim,
 * frame extraction, and GIF conversion. Because ffmpeg is an external binary, this
 * module is split into pure/testable argument-builder functions and a single
 * `executeOperation` that is the only piece which actually spawns ffmpeg — the
 * ffmpeg binary path and the `execFile` implementation are both injected so tests
 * can replace them with fakes, without invoking a real binary.
 *
 * @module VideoOperations
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

/**
 * Build args for a straight format conversion. ffmpeg infers the output format
 * from outputPath's extension.
 */
function buildConvertArgs({ inputPath, outputPath }) {
  return ['-i', inputPath, '-y', outputPath];
}

/**
 * Build args to re-encode inputPath with libx264 at the given CRF (Constant Rate
 * Factor). Lower CRF = higher quality/larger file, per libx264 convention. crf
 * must be an integer in [0, 51].
 */
function buildCompressArgs({ inputPath, outputPath, crf = 28 }) {
  if (!Number.isInteger(crf) || crf < 0 || crf > 51) {
    throw new Error('Invalid crf: must be an integer between 0 and 51');
  }

  return ['-i', inputPath, '-vcodec', 'libx264', '-crf', String(crf), '-y', outputPath];
}

/**
 * Build args to trim inputPath to [startTime, startTime + duration) seconds.
 * startTime/duration must be finite, non-negative numbers — they become argv
 * elements passed straight to execFile with no shell involved, so there's no
 * injection risk, but malformed values should still fail fast rather than reach
 * ffmpeg with garbage.
 */
function buildTrimArgs({ inputPath, outputPath, startTime, duration }) {
  const isValid = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0;

  if (!isValid(startTime) || !isValid(duration)) {
    throw new Error('Invalid trim range');
  }

  return ['-i', inputPath, '-ss', String(startTime), '-t', String(duration), '-y', outputPath];
}

/**
 * Build args to extract frames from inputPath at fps frames-per-second, written
 * as sequentially numbered PNGs into outputDir. fps must be a positive finite
 * number.
 */
function buildFramesArgs({ inputPath, outputDir, fps = 1 }) {
  if (typeof fps !== 'number' || !Number.isFinite(fps) || fps <= 0) {
    throw new Error('Invalid fps: must be a positive finite number');
  }

  return ['-i', inputPath, '-vf', `fps=${fps}`, path.join(outputDir, 'frame-%04d.png')];
}

/**
 * Build args to convert inputPath to an animated GIF at the given fps and width
 * (height scales automatically via -1), using the lanczos scaling filter.
 */
function buildGifArgs({ inputPath, outputPath, fps = 10, width = 480 }) {
  return ['-i', inputPath, '-vf', `fps=${fps},scale=${width}:-1:flags=lanczos`, '-y', outputPath];
}

/**
 * Run ffmpeg with the given args via the injected execFileFn, wrapped in a Promise.
 */
function runFfmpeg(ffmpegPath, args, execFileFn) {
  return new Promise((resolve, reject) => {
    execFileFn(ffmpegPath, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve();
    });
  });
}

async function executeOperation(operation, data, { ffmpegPath, execFileFn } = {}) {
  const resolvedFfmpegPath = ffmpegPath || 'ffmpeg';
  const resolvedExecFileFn = execFileFn || execFile;

  switch (operation) {
    case 'convert': {
      const { inputPath, outputPath } = data || {};
      const args = buildConvertArgs({ inputPath, outputPath });
      await runFfmpeg(resolvedFfmpegPath, args, resolvedExecFileFn);
      return { success: true, outputPath };
    }

    case 'compress': {
      const { inputPath, outputPath, crf } = data || {};
      const args = buildCompressArgs({ inputPath, outputPath, crf });
      await runFfmpeg(resolvedFfmpegPath, args, resolvedExecFileFn);
      return { success: true, outputPath };
    }

    case 'trim': {
      const { inputPath, outputPath, startTime, duration } = data || {};
      const args = buildTrimArgs({ inputPath, outputPath, startTime, duration });
      await runFfmpeg(resolvedFfmpegPath, args, resolvedExecFileFn);
      return { success: true, outputPath };
    }

    case 'frames': {
      const { inputPath, outputDir, fps } = data || {};
      const args = buildFramesArgs({ inputPath, outputDir, fps });
      fs.mkdirSync(outputDir, { recursive: true });
      await runFfmpeg(resolvedFfmpegPath, args, resolvedExecFileFn);
      return { success: true, outputDir };
    }

    case 'gif': {
      const { inputPath, outputPath, fps, width } = data || {};
      const args = buildGifArgs({ inputPath, outputPath, fps, width });
      await runFfmpeg(resolvedFfmpegPath, args, resolvedExecFileFn);
      return { success: true, outputPath };
    }

    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}

module.exports = {
  executeOperation,
  buildConvertArgs,
  buildCompressArgs,
  buildTrimArgs,
  buildFramesArgs,
  buildGifArgs,
};
