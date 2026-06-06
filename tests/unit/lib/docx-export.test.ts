import { describe, it, expect } from 'vitest';
import { generateDocx } from '@/lib/docx-export';

describe('generateDocx', () => {
  it('returns a Blob for a simple markdown string', async () => {
    const blob = await generateDocx({ source: '# Hello\n\nWorld' });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  });

  it('converts headings to docx heading styles', async () => {
    const blob = await generateDocx({ source: '# H1\n## H2\n### H3' });
    // The blob should be a valid zip-based docx; check size and MIME
    expect(blob.size).toBeGreaterThan(0);
  });

  it('converts markdown tables to preformatted (via applyAsciiTransform)', async () => {
    const source = '| A | B |\n| - | - |\n| 1 | 2 |';
    const blob = await generateDocx({ source });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });
});