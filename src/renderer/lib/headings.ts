export interface HeadingItem {
  level: number;
  text: string;
  line: number;
}

const HEADING_RE = /^(#{1,6})\s+(.+)$/;

/**
 * Extract ATX-style headings from a Markdown document. Order matches the order
 * they appear in the source; one entry per line.
 */
export function extractHeadings(content: string): HeadingItem[] {
  const headings: HeadingItem[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(HEADING_RE);
    if (m) {
      headings.push({ level: m[1].length, text: m[2].trim(), line: i + 1 });
    }
  }
  return headings;
}
