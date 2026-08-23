/**
 * Audio Operations Module
 *
 * Handles audio manipulation via `ffmpeg`: format conversion, trim, extract (audio
 * track from video/audio), and merge (concat demuxer). Because ffmpeg is an external
 * binary, this module is split into pure/testable argument-builder functions and a
 * single `executeOperation` that is the only piece which actually spawns ffmpeg —
 * the ffmpeg binary path and the `execFile` implementation are both injected so tests
 * can replace them with fakes, without invoking a real binary.
 *
 * @module AudioOperations
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

/**
 * Build args for a straight format conversion. ffmpeg infers the output format from
 * outputPath's extension; only pass -f explicitly when format is given and differs
 * from that extension.
 */
function buildConvertArgs({ inputPath, outputPath, format }) {
  const args = ['-i', inputPath, '-y'];

  if (format) {
    const ext = path.extname(outputPath).replace(/^\./, '').toLowerCase();
    if (format.toLowerCase() !== ext) {
      args.push('-f', format);
    }
  }

  args.push(outputPath);
  return args;
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
 * Build args to extract the audio track (stream copy, no video, no re-encode).
 * If codec copy fails, executeOperation's 'extract' case retries without -acodec copy.
 */
function buildExtractArgs({ inputPath, outputPath }) {
  return ['-i', inputPath, '-vn', '-acodec', 'copy', '-y', outputPath];
}

/**
 * Fallback extract args that let ffmpeg transcode instead of stream-copying.
 */
function buildExtractFallbackArgs({ inputPath, outputPath }) {
  return ['-i', inputPath, '-vn', '-y', outputPath];
}

/**
 * Build args to merge 2+ files via the concat demuxer. Returns both concatListContent
 * (the `file '<path>'` lines the caller writes to a temp list file) and args — the
 * caller doesn't know the temp list file's path until it creates it, so tempListPath
 * is an optional param: executeOperation's 'merge' case calls this once to obtain
 * concatListContent, writes it to disk, then calls it again with the real
 * tempListPath to obtain the final args referencing that file.
 */
function buildMergeArgs({ inputPaths, outputPath, tempListPath = null }) {
  if (!Array.isArray(inputPaths) || inputPaths.length < 2) {
    throw new Error('inputPaths must contain at least 2 files');
  }

  const concatListContent = inputPaths.map((p) => `file '${p}'`).join('\n') + '\n';

  const args = ['-f', 'concat', '-safe', '0', '-i', tempListPath, '-c', 'copy', '-y', outputPath];

  return { args, concatListContent };
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
      const { inputPath, outputPath, format } = data || {};
      const args = buildConvertArgs({ inputPath, outputPath, format });
      await runFfmpeg(resolvedFfmpegPath, args, resolvedExecFileFn);
      return { success: true, outputPath };
    }

    case 'trim': {
      const { inputPath, outputPath, startTime, duration } = data || {};
      const args = buildTrimArgs({ inputPath, outputPath, startTime, duration });
      await runFfmpeg(resolvedFfmpegPath, args, resolvedExecFileFn);
      return { success: true, outputPath };
    }

    case 'extract': {
      const { inputPath, outputPath } = data || {};
      try {
        const args = buildExtractArgs({ inputPath, outputPath });
        await runFfmpeg(resolvedFfmpegPath, args, resolvedExecFileFn);
      } catch {
        // Codec copy can fail when the source audio codec isn't valid in the target
        // container — fall back to letting ffmpeg transcode instead.
        const fallbackArgs = buildExtractFallbackArgs({ inputPath, outputPath });
        await runFfmpeg(resolvedFfmpegPath, fallbackArgs, resolvedExecFileFn);
      }
      return { success: true, outputPath };
    }

    case 'merge': {
      const { inputPaths, outputPath } = data || {};
      const { concatListContent } = buildMergeArgs({ inputPaths, outputPath });

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audio-merge-'));
      const tempListPath = path.join(tempDir, 'concat-list.txt');

      try {
        fs.writeFileSync(tempListPath, concatListContent, 'utf8');
        const { args } = buildMergeArgs({ inputPaths, outputPath, tempListPath });
        await runFfmpeg(resolvedFfmpegPath, args, resolvedExecFileFn);
      } finally {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {
          /* best-effort cleanup */
        }
      }

      return { success: true, outputPath };
    }

    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}

module.exports = {
  executeOperation,
  buildConvertArgs,
  buildTrimArgs,
  buildExtractArgs,
  buildMergeArgs,
};
