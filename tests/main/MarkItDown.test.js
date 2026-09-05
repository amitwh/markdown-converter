/**
 * @jest-environment node
 *
 * MarkItDown bridge tests with a stubbed execFile — no Python needed.
 * Covers command resolution order, argv-array invocation (SEC-1), stdout
 * capture, error surfacing, and path validation.
 */
const os = require('os');
const path = require('path');
const { resolveMarkItDown, convertToMarkdown, commandCandidates } = require('../../src/main/MarkItDown');
const { setImmediate } = require('timers');

/**
 * Build a runner stub. `script` maps "cmd argline" -> {error?, stdout?, stderr?}.
 * Unmatched invocations fail with ENOENT (an uninstalled command), which is
 * exactly what the real execFile does. Records every call for argv assertions.
 */
function makeRunner(script = {}) {
  const calls = [];
  const runner = (cmd, args, opts, cb) => {
    calls.push({ cmd, args, opts });
    const isVersionProbe = args.length > 0 && args[args.length - 1] === '--version';
    const key = isVersionProbe
      ? [cmd, ...args.slice(0, -1), '--version'].join(' ')
      : [cmd, ...args].join(' ');
    const result = script[key];
    setImmediate(() =>
      cb(
        result ? result.error || null : Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }),
        result?.stdout ?? '',
        result?.stderr ?? ''
      )
    );
  };
  runner.calls = calls;
  return runner;
}

describe('MarkItDown', () => {
  describe('resolveMarkItDown', () => {
    it('prefers a direct markitdown binary when present', async () => {
      const runner = makeRunner({
        'markitdown --version': { stdout: 'markitdown 0.1.7\n' },
      });
      const resolved = await resolveMarkItDown(runner);
      expect(resolved).toEqual({ command: 'markitdown', argsPrefix: [], version: '0.1.7' });
    });

    it('falls back to python -m markitdown', async () => {
      const py = process.platform === 'win32' ? 'python' : 'python3';
      const runner = makeRunner({
        [`${py} -m markitdown --version`]: { stdout: 'markitdown 0.1.6' },
      });
      const resolved = await resolveMarkItDown(runner);
      expect(resolved).toMatchObject({ command: py, argsPrefix: ['-m', 'markitdown'] });
    });

    it('probes every candidate before giving up (null)', async () => {
      const runner = makeRunner({});
      expect(await resolveMarkItDown(runner)).toBeNull();
      // One probe per candidate (bundled binary included when present)
      expect(runner.calls).toHaveLength(commandCandidates().length);
    });

    it('prefers the bundled binary when one ships with the app', async () => {
      const candidates = commandCandidates();
      if (!candidates[0].bundled) {
        // Machine has no bin/<platform>/markitdown — assert ordering of the
        // remaining candidates instead.
        expect(candidates.map((c) => c.command)).toContain('markitdown');
        return;
      }
      const runner = makeRunner({});
      const first = candidates[0];
      runner.calls.length = 0;
      // Stub the bundled path's --version probe
      const script = {};
      script[`${first.command} --version`] = { stdout: 'markitdown 0.1.7' };
      const stub = makeRunner(script);
      const resolved = await resolveMarkItDown(stub);
      expect(resolved.command).toBe(first.command);
      expect(stub.calls[0].cmd).toBe(first.command);
    });

    it('treats a non-zero probe exit as unavailable', async () => {
      const runner = makeRunner({
        'markitdown --version': { error: Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) },
      });
      const resolved = await resolveMarkItDown(runner);
      // Falls through to python candidates which also fail here -> null
      expect(resolved).toBeNull();
    });
  });

  describe('convertToMarkdown', () => {
    const inputPath = path.join(os.tmpdir(), 'any-file.docx');

    it('passes the user path as a literal argv element (no shell)', async () => {
      const runner = makeRunner({
        [`markitdown ${inputPath}`]: { stdout: '# Converted\n' },
      });
      const { content } = await convertToMarkdown(inputPath, {
        runner,
        resolved: { command: 'markitdown', argsPrefix: [], version: null },
      });
      expect(content).toBe('# Converted\n');
      expect(runner.calls[0].cmd).toBe('markitdown');
      expect(runner.calls[0].args).toEqual([inputPath]);
    });

    it('prepends the module prefix for python-style invocation', async () => {
      const calls = [];
      const fake = (cmd, args, opts, cb) => {
        calls.push({ cmd, args, opts });
        setImmediate(() => cb(null, 'ok', ''));
      };
      await convertToMarkdown(inputPath, {
        runner: fake,
        resolved: { command: 'python3', argsPrefix: ['-m', 'markitdown'], version: null },
      });
      expect(calls[0].cmd).toBe('python3');
      expect(calls[0].args).toEqual(['-m', 'markitdown', inputPath]);
    });

    it('strips a UTF-8 BOM from the output', async () => {
      const runner = makeRunner({
        [`markitdown ${inputPath}`]: { stdout: '\uFEFF# Title\n' },
      });
      const { content } = await convertToMarkdown(inputPath, {
        runner,
        resolved: { command: 'markitdown', argsPrefix: [], version: null },
      });
      expect(content.startsWith('\uFEFF')).toBe(false);
    });

    it('surfaces the actionable last stderr line and sanitizes paths', async () => {
      const runner = makeRunner({
        [`markitdown ${inputPath}`]: {
          error: Object.assign(new Error('Command failed'), { code: 1 }),
          stderr:
            'Traceback (most recent call last):\n  File "/home/user/x.py", line 1\n' +
            "* pip install 'markitdown[pdf]'",
        },
      });
      await expect(
        convertToMarkdown(inputPath, {
          runner,
          resolved: { command: 'markitdown', argsPrefix: [], version: null },
        })
      ).rejects.toThrow(/pip install 'markitdown\[pdf\]'/);
    });

    it('classifies timeouts', async () => {
      const runner = makeRunner({
        [`markitdown ${inputPath}`]: {
          error: Object.assign(new Error(' timeout'), { code: 'ETIMEDOUT' }),
        },
      });
      await expect(
        convertToMarkdown(inputPath, {
          runner,
          resolved: { command: 'markitdown', argsPrefix: [], version: null },
        })
      ).rejects.toMatchObject({ code: 'timeout' });
    });

    it('rejects empty output with the supported-formats hint', async () => {
      const runner = makeRunner({
        [`markitdown ${inputPath}`]: { stdout: '   ' },
      });
      await expect(
        convertToMarkdown(inputPath, {
          runner,
          resolved: { command: 'markitdown', argsPrefix: [], version: null },
        })
      ).rejects.toMatchObject({ code: 'empty_output' });
    });

    it('rejects non-absolute and non-string paths', async () => {
      const runner = makeRunner({});
      await expect(
        convertToMarkdown('relative.docx', {
          runner,
          resolved: { command: 'markitdown', argsPrefix: [], version: null },
        })
      ).rejects.toMatchObject({ code: 'bad_path' });
      await expect(convertToMarkdown(null, { runner })).rejects.toMatchObject({
        code: 'bad_path',
      });
    });

    it('fails with install instructions when not installed', async () => {
      const runner = makeRunner({});
      await expect(convertToMarkdown(inputPath, { runner })).rejects.toMatchObject({
        code: 'not_installed',
      });
    });
  });
});
