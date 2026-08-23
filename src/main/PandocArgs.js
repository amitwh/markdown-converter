/**
 * Pure builders for Pandoc execFile argument arrays.
 *
 * Every Pandoc invocation in the main process must call
 * execFile(pandocPath, args) with an argument array built here or with plain
 * Array.push calls — never a command string that is later re-tokenized.
 * Values that come from the user (file paths, template names, metadata values)
 * are pushed verbatim as single argv elements, so a crafted value such as
 * `/tmp/x.bib" --lua-filter=/tmp/evil.lua` can never break out of its argument
 * and inject additional Pandoc flags (security finding SEC-1).
 */

/**
 * Formats exported through a plain `-t <target>` conversion. The export dialog
 * replaces the whole command for these formats (dialog options like template or
 * metadata are not applied) — this map preserves that pre-existing behavior.
 */
const SIMPLE_TARGET_FORMATS = {
  json: 'json',
  beamer: 'beamer',
  confluence: 'jira',
  jira: 'jira',
  asciidoc: 'asciidoc',
  rst: 'rst',
  mediawiki: 'mediawiki',
  org: 'org',
  textile: 'textile',
  man: 'man',
  ipynb: 'ipynb',
};

/**
 * Append the export-dialog options shared by the export, batch-conversion and
 * fallback paths. Each value lands in argv exactly once, unquoted and
 * unescaped — execFile passes array elements as literal arguments.
 * @param {string[]} args - Argument array to append to (mutated)
 * @param {Object} options - Export options ({ template, metadata, variables,
 *   toc, tocDepth, numberSections, citeproc, bibliography, csl })
 */
function appendCommonOptions(args, options) {
  if (!options) return;

  if (options.template && options.template !== 'default') {
    args.push(`--template=${options.template}`);
  }

  if (options.metadata) {
    for (const [key, value] of Object.entries(options.metadata)) {
      if (value.trim()) {
        args.push('-M', `${key}=${value}`);
      }
    }
  }

  if (options.variables) {
    for (const [key, value] of Object.entries(options.variables)) {
      if (value.trim()) {
        args.push('-V', `${key}=${value}`);
      }
    }
  }

  if (options.toc) args.push('--toc');
  if (options.tocDepth) args.push(`--toc-depth=${options.tocDepth}`);
  if (options.numberSections) args.push('--number-sections');
  if (options.citeproc) args.push('--citeproc');
  if (options.bibliography) args.push(`--bibliography=${options.bibliography}`);
  if (options.csl) args.push(`--csl=${options.csl}`);
}

/**
 * Append the shared prefix of every PDF invocation: the pdf engine flag and,
 * when set, the page geometry variable.
 * @param {string[]} args - Argument array to append to (mutated)
 * @param {Object} params
 * @param {string} [params.pdfEngine] - Falls back to xelatex when omitted
 * @param {string} [params.geometry] - LaTeX geometry string (e.g. margin=1in)
 */
function appendPdfEngineOptions(args, { pdfEngine, geometry } = {}) {
  args.push(`--pdf-engine=${pdfEngine || 'xelatex'}`);
  if (geometry) args.push('-V', `geometry:${geometry}`);
}

/**
 * Append the PowerPoint footer variable (used when header/footer is enabled).
 * @param {string[]} args - Argument array to append to (mutated)
 * @param {string} footerText - Processed footer text
 */
function appendFooterVariable(args, footerText) {
  if (footerText) args.push('--variable', `footer=${footerText}`);
}

/**
 * Build the base argument array for the export dialog and batch conversion:
 * input, -o output, the shared export options, and the `-t docx` tail for
 * Word exports. Format-specific extras (PDF engine flags, EPUB fonts, HTML
 * css, reveal.js themes) are appended by the call site.
 * @param {Object} params
 * @param {string} params.inputFile - Path passed to pandoc verbatim
 * @param {string} params.outputFile - Path passed to pandoc verbatim
 * @param {string} [params.format] - Export format name
 * @param {Object} [params.options] - Export dialog options
 * @returns {string[]}
 */
function buildPandocArgs({ inputFile, outputFile, format, options = {} }) {
  const args = [inputFile, '-o', outputFile];
  appendCommonOptions(args, options);
  if (format === 'docx') {
    args.push('-t', 'docx');
  }
  return args;
}

/**
 * Build args for the simple `-t <target>` formats (see SIMPLE_TARGET_FORMATS).
 * @param {string} inputFile - Input path
 * @param {string} outputFile - Output path
 * @param {string} format - Export format name
 * @returns {string[]|null} Argument array, or null when format is not one of
 *   the simple target formats
 */
function buildSimpleTargetArgs(inputFile, outputFile, format) {
  const target = SIMPLE_TARGET_FORMATS[format];
  if (!target) return null;
  return [inputFile, '-t', target, '-o', outputFile];
}

module.exports = {
  SIMPLE_TARGET_FORMATS,
  appendCommonOptions,
  appendPdfEngineOptions,
  appendFooterVariable,
  buildPandocArgs,
  buildSimpleTargetArgs,
};
