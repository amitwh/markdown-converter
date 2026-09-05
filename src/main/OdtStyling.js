/**
 * ODT post-export styling: page size + headers/footers.
 *
 * Pandoc's ODT writer always emits a `styles.xml` containing:
 *   - an automatic-styles section with a page layout (typically "pm1") holding
 *     `<style:page-layout-properties>` (width/height/margins), and
 *   - `<office:master-styles>` with a `Standard` master page that references
 *     that page layout. Page headers/footers in ODF attach to the master page
 *     as `<style:header>` / `<style:footer>` children, each split into
 *     `<style:region-left|center|right>` regions.
 *
 * This module patches those two spots in-place with PizZip string surgery
 * (the same technique `addHeaderFooterToDocx`/`setDocxPageSize` use for DOCX).
 * All edits are best-effort: a malformed or unexpected styles.xml logs and
 * leaves the file untouched rather than corrupting the export.
 *
 * Exposed for tests: `parseDimensionsMm`, `escapeOdtText`.
 *
 * @module OdtStyling
 */

const fs = require('fs');

/**
 * Escape text for safe embedding inside ODF XML text nodes.
 * ODF uses standard XML escaping; quotes are escaped too so values can also be
 * used inside attribute values safely.
 *
 * @param {string} text Raw user text
 * @returns {string} XML-safe text
 */
function escapeOdtText(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Parse a PAGE_SIZES `dimensions` string ("210×297mm" — U+00D7 separator)
 * into millimeter numbers. Returns null when the string is unparseable so
 * callers can fall back to A4.
 *
 * @param {string} dimensions e.g. "210×297mm"
 * @returns {{widthMm: number, heightMm: number}|null}
 */
function parseDimensionsMm(dimensions) {
  if (typeof dimensions !== 'string') return null;
  const match = /^(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)\s*mm$/i.exec(dimensions.trim());
  if (!match) return null;
  return { widthMm: parseFloat(match[1]), heightMm: parseFloat(match[2]) };
}

/**
 * Read `styles.xml` out of an ODT (zip) file as text.
 *
 * @param {string} odtPath Path to the .odt file
 * @param {Function} PizZipUtil Injected PizZip constructor (keeps the module
 *     lazy-load friendly and lets tests pass the real one)
 * @returns {{zip: object, stylesXml: string}}
 */
function openOdtStyles(odtPath, PizZipUtil) {
  const zip = new PizZipUtil(fs.readFileSync(odtPath));
  const stylesFile = zip.file('styles.xml');
  if (!stylesFile) {
    throw new Error('styles.xml not found in ODT package');
  }
  return { zip, stylesXml: stylesFile.asText() };
}

/**
 * Set the page size/orientation on every `<style:page-layout-properties>`
 * element in styles.xml (an ODT normally has exactly one). Width/height are
 * written as `fo:page-width`/`fo:page-height` in mm, orientation as
 * `style:print-orientation`, and landscape swaps width/height (ODF expects
 * portrait-orientation dimensions plus the print-orientation flag, matching
 * how LibreOffice itself saves landscape documents).
 *
 * @param {string} odtPath Path to the .odt to patch (modified in place)
 * @param {{size?: string, customWidth?: string|number, customHeight?: string|number,
 *          orientation?: string, pageSizes?: object}} pageSettings App page
 *   settings; `pageSizes` injects the app's PAGE_SIZES map (main.js owns it).
 * @returns {Promise<void>} Resolves when written; errors are logged, never thrown
 */
async function setOdtPageSize(odtPath, pageSettings = {}) {
  try {
    const PizZipUtil = require('pizzip');
    const { zip, stylesXml } = openOdtStyles(odtPath, PizZipUtil);

    // Resolve width/height in mm, mirroring setDocxPageSize's priority:
    // named size → custom → A4 default.
    const sizes = pageSettings.pageSizes || {};
    let widthMm;
    let heightMm;
    const named = sizes[pageSettings.size];
    const parsed = named ? parseDimensionsMm(named.dimensions) : null;
    if (parsed) {
      widthMm = parsed.widthMm;
      heightMm = parsed.heightMm;
    } else if (pageSettings.customWidth && pageSettings.customHeight) {
      // Custom sizes are entered in mm in the export dialog
      widthMm = parseFloat(pageSettings.customWidth) || 210;
      heightMm = parseFloat(pageSettings.customHeight) || 297;
    } else {
      widthMm = 210;
      heightMm = 297;
    }

    const orientation = pageSettings.orientation === 'landscape' ? 'landscape' : 'portrait';
    if (orientation === 'landscape') {
      [widthMm, heightMm] = [heightMm, widthMm];
    }

    let updated = stylesXml;
    let patched = false;

    // Replace attributes on every existing page-layout-properties element
    updated = updated.replace(/<style:page-layout-properties\b[^>]*>/g, (tag) => {
      patched = true;
      let next = tag;
      // Drop any prior size/orientation attributes so re-exports stay correct
      next = next.replace(
        /\s(?:fo:page-width|fo:page-height|style:print-orientation)="[^"]*"/g,
        ''
      );
      return next.replace(
        /<style:page-layout-properties\b/,
        `<style:page-layout-properties fo:page-width="${widthMm}mm" fo:page-height="${heightMm}mm"` +
          ` style:print-orientation="${orientation}"`
      );
    });

    // Pandoc always emits a page layout, but if one is missing (self-closing
    // <style:page-layout .../> with no properties), inject the properties in
    if (!patched) {
      updated = updated.replace(
        /<style:page-layout\b([^>]*)\/>/g,
        (_m, attrs) =>
          `<style:page-layout${attrs}>` +
          `<style:page-layout-properties fo:page-width="${widthMm}mm" fo:page-height="${heightMm}mm"` +
          ` style:print-orientation="${orientation}"` +
          `/></style:page-layout>`
      );
    }

    zip.file('styles.xml', updated);
    fs.writeFileSync(odtPath, zip.generate({ type: 'nodebuffer' }));
  } catch (error) {
    // Best-effort: a failed style patch must never lose the user's export
    console.error('Failed to set ODT page size:', error);
  }
}

/**
 * Build the XML for one header/footer region triple. $PAGE$/$TOTAL$ become ODF
 * fields (`<text:page-number>` / `<text:page-count>`), matching the DOCX
 * exporter's PAGE/NUMPAGES field handling.
 *
 * @param {{left?: string, center?: string, right?: string}} regions
 * @param {'header'|'footer'} kind Only used for the element name
 * @returns {string} `<style:header>…</style:header>` XML, or '' when all regions empty
 */
function buildHeaderFooterXml(regions, kind) {
  const regionNames = ['left', 'center', 'right'];
  const used = regionNames.some((name) => regions[name] && regions[name].trim());
  if (!used) return '';

  const fields = {
    $PAGE$: '<text:page-number>1</text:page-number>',
    $TOTAL$: '<text:page-count>1</text:page-count>',
  };

  const regionXml = regionNames
    .map((name) => {
      const raw = regions[name] || '';
      if (!raw.trim()) return '';
      // Split on the field markers and emit literal runs / field elements
      const parts = raw.split(/(\$PAGE\$|\$TOTAL\$)/);
      const inner = parts
        .map((part) => (fields[part] ? fields[part] : escapeOdtText(part)))
        .join('');
      return `<style:region-${name}><text:p text:style-name="HeaderAndFooter">${inner}</text:p></style:region-${name}>`;
    })
    .join('');

  return `<style:${kind}>${regionXml}</style:${kind}>`;
}

/**
 * Add headers/footers to an ODT by injecting `<style:header>`/`<style:footer>`
 * into the `Standard` master page in styles.xml. Existing header/footer
 * elements on that master page are removed first so re-exports don't nest.
 * The `settings` shape mirrors `headerFooterSettings` in main.js; dynamic
 * fields ($DATE$, $TITLE$, …) are expected to be resolved by the caller via
 * processDynamicFields before this runs (mirroring addHeaderFooterToDocx).
 *
 * @param {string} odtPath Path to the .odt to patch (modified in place)
 * @param {{enabled?: boolean, header?: object, footer?: object}} settings
 * @returns {Promise<void>} Resolves when written; errors are logged, never thrown
 */
async function addHeaderFooterToOdt(odtPath, settings = {}) {
  if (!settings.enabled) return;
  try {
    const PizZipUtil = require('pizzip');
    const { zip, stylesXml } = openOdtStyles(odtPath, PizZipUtil);

    const headerXml = buildHeaderFooterXml(settings.header || {}, 'header');
    const footerXml = buildHeaderFooterXml(settings.footer || {}, 'footer');
    if (!headerXml && !footerXml) return;

    let updated = stylesXml;

    if (/<style:master-page\b[^>]*style:name="Standard"/.test(updated)) {
      // Paired <style:master-page ...>…</style:master-page>: strip any existing
      // header/footer from the inner content, then prepend the new ones.
      // Self-closing <style:master-page ... /> (Pandoc's usual output) has no
      // inner content, so it is expanded into a paired tag instead.
      const paired =
        /(<style:master-page\b[^>]*style:name="Standard"[^>]*>)([\s\S]*?)(<\/style:master-page>)/.exec(
          updated
        );
      if (paired) {
        updated = updated.replace(paired[0], (_m, openTag, inner) => {
          const cleaned = inner
            .replace(/<style:header\b[\s\S]*?<\/style:header>/g, '')
            .replace(/<style:footer\b[\s\S]*?<\/style:footer>/g, '')
            .replace(/<style:header\b[^>]*\/>/g, '')
            .replace(/<style:footer\b[^>]*\/>/g, '');
          return `${openTag}${headerXml}${footerXml}${cleaned}</style:master-page>`;
        });
      } else {
        updated = updated.replace(
          /<style:master-page\b([^>]*?)\s*\/>/,
          (_m, attrs) => `<style:master-page${attrs}>${headerXml}${footerXml}</style:master-page>`
        );
      }
    } else if (/<office:master-styles\b/.test(updated)) {
      // Master-styles section exists but no Standard page: append one that
      // uses the document's first page layout (Pandoc's "pm1" convention).
      const layoutName = /<style:page-layout\b[^>]*style:name="([^"]+)"/.exec(updated);
      const ref = layoutName ? ` style:page-layout-name="${layoutName[1]}"` : '';
      updated = updated.replace(
        /<office:master-styles\b[^>]*>/,
        (openTag) =>
          `${openTag}<style:master-page style:name="Standard"${ref}>${headerXml}${footerXml}</style:master-page>`
      );
    } else {
      // No master-styles at all: master-styles is the last child element of
      // office:document-styles, so inserting before its close tag is valid ODF
      updated = updated.replace(
        /<\/office:document-styles>/,
        `<office:master-styles><style:master-page style:name="Standard">${headerXml}${footerXml}</style:master-page></office:master-styles></office:document-styles>`
      );
    }

    zip.file('styles.xml', updated);
    fs.writeFileSync(odtPath, zip.generate({ type: 'nodebuffer' }));
  } catch (error) {
    console.error('Failed to add headers/footers to ODT:', error);
  }
}

module.exports = {
  setOdtPageSize,
  addHeaderFooterToOdt,
  // Exported for unit tests
  parseDimensionsMm,
  escapeOdtText,
};
