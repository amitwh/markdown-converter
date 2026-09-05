/**
 * MarkItDown bridge — "any file → Markdown" import via Microsoft's
 * markitdown Python tool (https://github.com/microsoft/markitdown, MIT).
 *
 * markitdown is a Python CLI, so like Pandoc/LibreOffice/FFmpeg it is used
 * when installed rather than bundled: the module probes for it once
 * (`markitdown` binary, then `python -m markitdown` / `python3 -m markitdown`)
 * and caches the resolved command. Every invocation goes through an argv
 * array via execFile — user-controlled paths are never passed through a
 * shell (same SEC-1 discipline as the Pandoc path).
 *
 * Supported by markitdown (core install): PDF, DOCX, PPTX, XLSX, Outlook
 * .msg/.eml, HTML, EPUB, images (EXIF), CSV/JSON/XML, ZIP archives, YouTube
 * URLs. Audio transcription and image OCR need the `[all]` extras:
 *   pip install 'markitdown[all]'
 *
 * The execFile runner is injectable so tests can stub process spawning.
 *
 * @module MarkItDown
 */

const CONVERT_TIMEOUT_MS = 120000;
const MAX_OUTPUT_BUFFER = 20 * 1024 * 1024;

/**
 * Candidate command templates probed in order. `argsPrefix` is prepended to
 * the user path when invoking (e.g. ['-m', 'markitdown'] for module-style
 * invocation through a python launcher).
 */
const COMMAND_CANDIDATES = [
  { command: 'markitdown', argsPrefix: [] },
  { command: process.platform === 'win32' ? 'python' : 'python3', argsPrefix: ['-m', 'markitdown'] },
  { command: 'python3', argsPrefix: ['-m', 'markitdown'] },
];

/** Run one probe: `--version` exits 0 when the tool is importable. */
function probeCandidate(runner, candidate) {
  return new Promise((resolve) => {
    runner(
      candidate.command,
      [...candidate.argsPrefix, '--version'],
      { timeout: 15000 },
      (error, stdout) => {
        if (error) return resolve(null);
        const match = /(\d+\.\d+(?:\.\d+)?)/.exec(String(stdout || ''));
        resolve({
          command: candidate.command,
          argsPrefix: candidate.argsPrefix,
          version: match ? match[1] : null,
        });
      }
    );
  });
}

/**
 * Resolve the markitdown invocation. Probes candidates in order and returns
 * the first that answers `--version`, or null when none is installed.
 *
 * @param {Function} runner execFile-style (cmd, args, opts, cb)
 * @returns {Promise<{command: string, argsPrefix: string[], version: string|null}|null>}
 */
async function resolveMarkItDown(runner) {
  for (const candidate of COMMAND_CANDIDATES) {
    const resolved = await probeCandidate(runner, candidate);
    if (resolved) return resolved;
  }
  return null;
}

/**
 * Convert any supported file to Markdown.
 *
 * @param {string} inputPath Absolute path to the source file
 * @param {object} [options]
 * @param {Function} [options.runner] injectable execFile (defaults to child_process)
 * @param {Function} [options.pathUtil] injected path module
 * @param {{command: string, argsPrefix: string[]}} [options.resolved] skip
 *        probing when the caller already knows the command (main caches it)
 * @returns {Promise<{content: string}>} Markdown printed by markitdown on stdout
 * @throws {Error} with a user-safe message when the tool is missing or fails
 */
async function convertToMarkdown(inputPath, options = {}) {
  const runner = options.runner || require('child_process').execFile;
  const pathUtil = options.pathUtil || require('path');

  // Validate the path BEFORE probing for the tool: a bad path is the user's
  // most actionable error and shouldn't be masked by an install hint
  if (typeof inputPath !== 'string' || !pathUtil.isAbsolute(inputPath)) {
    const err = new Error('MarkItDown import needs an absolute file path.');
    err.code = 'bad_path';
    throw err;
  }

  const resolved = options.resolved || (await resolveMarkItDown(runner));
  if (!resolved) {
    const err = new Error(
      'MarkItDown is not installed. Install it with:\n\npip install "markitdown[all]"\n\n' +
        '(or the lighter core: pip install markitdown)'
    );
    err.code = 'not_installed';
    throw err;
  }

  return new Promise((resolve, reject) => {
    // markitdown prints the converted Markdown to stdout; keep everything in
    // argv so the path is never re-interpreted by a shell.
    runner(
      resolved.command,
      [...resolved.argsPrefix, inputPath],
      { timeout: CONVERT_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BUFFER },
      (error, stdout, stderr) => {
        if (error) {
          // Strip absolute paths, then keep the first informative line from
          // either the error or stderr — markitdown writes tracebacks there
          // (e.g. a missing optional dependency like pdfminer.six for PDFs).
          const safe = (text) =>
            String(text || '')
              .replace(/[A-Z]:\\[^\s"']+/gi, '(path)')
              .replace(/\/(?:home|Users|tmp|mnt)\/[^\s"']+/g, '(path)');
          // Prefer the LAST informative stderr line: markitdown ends its
          // output with the actionable install hint ("pip install
          // 'markitdown[pdf]'"), while the first lines are a traceback.
          const stderrLines = safe(stderr).split('\n').filter((l) => l.trim().length > 0);
          const detail =
            stderrLines[stderrLines.length - 1] ||
            safe(error.message).split('\n')[0] ||
            'unknown error';
          const err2 = new Error(`MarkItDown conversion failed: ${detail}`);
          err2.code = String(error.code || '').startsWith('ETIMEDOUT') ? 'timeout' : 'failed';
          err2.stderr = safe(stderr).slice(0, 2000);
          reject(err2);
          return;
        }
        const content = String(stdout || '');
        if (!content.trim()) {
          const err3 = new Error(
            'MarkItDown produced no output — the file type may be unsupported ' +
              '(core install covers PDF/DOCX/PPTX/XLSX/MSG/HTML/EPUB/images/CSV/JSON/XML/ZIP; ' +
              "audio/OCR need pip install 'markitdown[all]')."
          );
          err3.code = 'empty_output';
          reject(err3);
          return;
        }
        // Strip a UTF-8 BOM if present so downstream markdown tooling is happy
        resolve({ content: content.replace(/^\uFEFF/, '') });
      }
    );
  });
}

module.exports = {
  resolveMarkItDown,
  convertToMarkdown,
  COMMAND_CANDIDATES,
};
