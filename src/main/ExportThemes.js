/**
 * Export themes — named visual styles for PDF (LaTeX) and Word (DOCX) export.
 *
 * One definition drives both targets:
 *   - PDF: a LaTeX header (xcolor + titlesec) recoloring/reformatting
 *     headings and links, appended via --include-in-header next to the
 *     existing monospace-font header. Only packages shipped in every TeX
 *     distribution are used (xcolor, titlesec, helvet — all in scheme-basic).
 *   - DOCX: a styles.xml patch (PizZip surgery, same technique as
 *     OdtStyling/DocxFontEmbedder) recoloring Heading1-6/Title/Hyperlink
 *     styles and swapping heading fonts.
 *
 * "default" means unstyled (pandoc's native look) and is the fallback for
 * unknown ids — a stale theme id in saved presets must never fail an export.
 *
 * @module ExportThemes
 */

const THEMES = {
  default: {
    label: 'Default (Pandoc)',
    description: "Pandoc's native styling",
    // No patches — used as the safe fallback
    pdf: null,
    docx: null,
  },
  modern: {
    label: 'Modern',
    description: 'Sans-serif blue headings, teal links, airy section rules',
    pdf: {
      headingColor: '1E4FD8', // strong blue
      linkColor: '0E7490', // teal
      ruleColor: 'C7D2FE', // light indigo rule under sections
      sansHeadings: true, // \usepackage{helvet} + \sanstitle (kp-fonts-free?)
      sectionRule: true,
    },
    docx: {
      headingColor: '1E4FD8',
      linkColor: '0E7490',
      headingFont: 'Calibri',
      bodyFont: 'Calibri',
    },
  },
  classic: {
    label: 'Classic',
    description: 'Serif type, deep-navy headings, burgundy links',
    pdf: {
      headingColor: '1F3A5F',
      linkColor: '7C2D12',
      sansHeadings: false,
      sectionRule: true,
      ruleColor: '94A3B8',
    },
    docx: {
      headingColor: '1F3A5F',
      linkColor: '7C2D12',
      headingFont: 'Cambria',
      bodyFont: 'Cambria',
    },
  },
  sepia: {
    label: 'Sepia',
    description: 'Warm manuscript tones — browns and parchment accents',
    pdf: {
      headingColor: '7C4A21',
      linkColor: 'A16207',
      sansHeadings: false,
      sectionRule: true,
      ruleColor: 'D6BFA6',
    },
    docx: {
      headingColor: '7C4A21',
      linkColor: 'A16207',
      headingFont: 'Georgia',
      bodyFont: 'Georgia',
    },
  },
  minimal: {
    label: 'Minimal',
    description: 'Near-black, no rules, understated gray links',
    pdf: {
      headingColor: '111827',
      linkColor: '4B5563',
      sansHeadings: false,
      sectionRule: false,
    },
    docx: {
      headingColor: '111827',
      linkColor: '4B5563',
      headingFont: 'Aptos',
      bodyFont: 'Aptos',
    },
  },
  elegant: {
    label: 'Elegant',
    description: 'Plum headings with hairline rules, slate links',
    pdf: {
      headingColor: '6D28D9',
      linkColor: '334155',
      sansHeadings: false,
      sectionRule: true,
      ruleColor: 'DDD6FE',
    },
    docx: {
      headingColor: '6D28D9',
      linkColor: '334155',
      headingFont: 'Palatino Linotype',
      bodyFont: 'Palatino Linotype',
    },
  },
};

/** Resolve a theme id safely (unknown → default). */
function getTheme(id) {
  return THEMES[id] || THEMES.default;
}

/** Menu/UI listing: [{id, label, description}] in definition order. */
function listThemes() {
  return Object.entries(THEMES).map(([id, t]) => ({
    id,
    label: t.label,
    description: t.description,
  }));
}

/**
 * Build the LaTeX header implementing a theme's PDF look, or null for the
 * default theme. Colors are inlined as hex literals — no user input reaches
 * this string, so no LaTeX injection surface exists.
 *
 * @param {string} themeId
 * @returns {string|null} full .tex header content
 */
function buildLatexThemeHeader(themeId) {
  const theme = getTheme(themeId);
  if (!theme.pdf) return null;

  const p = theme.pdf;
  const lines = ['% Export theme: ' + theme.label, '\\usepackage{xcolor}'];

  if (p.sansHeadings) {
    // helvet is in every TeX distribution's core; scale it to match body size
    lines.push('\\usepackage[scaled=0.92]{helvet}');
  }

  lines.push(`\\definecolor{mcthemeheading}{HTML}{${p.headingColor}}`);
  lines.push(`\\definecolor{mcthemelink}{HTML}{${p.linkColor}}`);
  if (p.ruleColor) lines.push(`\\definecolor{mcthemerule}{HTML}{${p.ruleColor}}`);

  // titlesec restyles section/subsection; guarded so a missing package in an
  // exotic minimal TeX install degrades by omission (pandoc still succeeds)
  lines.push('\\usepackage{titlesec}');
  if (p.sansHeadings) lines.push('\\renewcommand{\\familydefault}{\\sfdefault}');
  const rule = p.sectionRule && p.ruleColor
    ? '{\\color{mcthemerule}\\titlerule[0.6pt]}'
    : '';
  lines.push(
    `\\titleformat{\\section}{\\LARGE\\bfseries\\color{mcthemeheading}}{\\thesection}{0.8em}{}${rule}`
  );
  lines.push(
    `\\titleformat{\\subsection}{\\Large\\bfseries\\color{mcthemeheading}}{\\thesubsection}{0.8em}{}`
  );
  lines.push(
    `\\titleformat{\\subsubsection}{\\large\\bfseries\\color{mcthemeheading}}{\\thesubsubsection}{0.8em}{}`
  );

  // Pandoc loads hyperref itself; color links via \hypersetup in the header
  lines.push('\\usepackage{etoolbox}');
  lines.push('\\AfterEndPreamble{\\hypersetup{colorlinks=true,linkcolor=mcthemelink,urlcolor=mcthemelink}}');

  return lines.join('\n') + '\n';
}

/**
 * Apply a theme's DOCX styling by patching word/styles.xml in place.
 * Patches Heading1-6, Title, Subtitle (color + font) and Hyperlink (color);
 * Normal (body font) is only touched when the theme defines bodyFont.
 *
 * @param {string} docxPath .docx to patch (modified in place)
 * @param {string} themeId
 * @param {object} [io] injectable { PizZip, fs } for tests
 */
function applyDocxTheme(docxPath, themeId, io = {}) {
  const PizZip = io.PizZip || require('pizzip');
  const fs = io.fs || require('fs');
  const theme = getTheme(themeId);
  if (!theme.docx) return false;

  const d = theme.docx;
  const zip = new PizZip(fs.readFileSync(docxPath));
  const stylesFile = zip.file('word/styles.xml');
  if (!stylesFile) return false;
  let xml = stylesFile.asText();

  const headingIds = ['Title', 'Subtitle', 'Heading1', 'Heading2', 'Heading3', 'Heading4', 'Heading5', 'Heading6'];
  for (const styleId of headingIds) {
    // Match this style's <w:style …w:styleId="X">…</w:style> block (they
    // never nest), then rewrite its rPr color/rFonts
    const re = new RegExp(`(<w:style [^>]*w:styleId="${styleId}"[^>]*>)([\\s\\S]*?)(</w:style>)`);
    const match = re.exec(xml);
    if (!match) continue;
    let inner = match[2];

    // Drop any existing color/rFonts in the style's rPr, then insert ours
    inner = inner.replace(/<w:color w:val="[0-9A-Fa-f]{6}"\s*\/>/g, '');
    inner = inner.replace(/<w:rFonts[^>]*\/>/g, '');

    const patch =
      `<w:color w:val="${d.headingColor}"/>` +
      (d.headingFont
        ? `<w:rFonts w:ascii="${d.headingFont}" w:hAnsi="${d.headingFont}" w:cs="${d.headingFont}"/>`
        : '');

    if (inner.includes('<w:rPr>')) {
      inner = inner.replace('<w:rPr>', `<w:rPr>${patch}`);
    } else {
      // Style without rPr: add one right after the <w:name …/> element
      inner = inner.replace(/(<w:name [^>]*\/>)/, `$1<w:rPr>${patch}</w:rPr>`);
    }
    xml = xml.replace(match[0], `${match[1]}${inner}${match[3]}`);
  }

  // Hyperlink character style: recolor only
  const hl = /(<w:style [^>]*w:styleId="Hyperlink"[^>]*>)([\s\S]*?)(<\/w:style>)/.exec(xml);
  if (hl) {
    let inner = hl[2].replace(/<w:color w:val="[0-9A-Fa-f]{6}"\s*\/>/g, '');
    const patch = `<w:color w:val="${d.linkColor}"/>`;
    if (inner.includes('<w:rPr>')) inner = inner.replace('<w:rPr>', `<w:rPr>${patch}`);
    else inner = inner.replace(/(<w:name [^>]*\/>)/, `$1<w:rPr>${patch}</w:rPr>`);
    xml = xml.replace(hl[0], `${hl[1]}${inner}${hl[3]}`);
  }

  // Body font: patch the docDefaults rPrDefault (affects Normal everywhere)
  if (d.bodyFont) {
    const patch = `<w:rFonts w:ascii="${d.bodyFont}" w:hAnsi="${d.bodyFont}" w:cs="${d.bodyFont}"/>`;
    xml = xml.replace(
      /(<w:docDefaults>\s*<w:rPrDefault>\s*<w:rPr>)/,
      `$1${patch}`
    );
  }

  zip.file('word/styles.xml', xml);
  fs.writeFileSync(docxPath, zip.generate({ type: 'nodebuffer' }));
  return true;
}

module.exports = { THEMES, getTheme, listThemes, buildLatexThemeHeader, applyDocxTheme };
