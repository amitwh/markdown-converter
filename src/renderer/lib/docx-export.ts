import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import { applyAsciiTransform } from './ascii-table';

export interface DocxOptions {
  source: string;
  title?: string;
  customTemplatePath?: string | null; // for future use
}

export async function generateDocx(options: DocxOptions): Promise<Blob> {
  // Apply ASCII transform (convert markdown tables to preformatted)
  const transformed = applyAsciiTransform(options.source);

  // Parse the source into a list of Paragraphs
  // For v1, simple line-by-line: each line is a paragraph
  // Headings (# ## ###) get heading styles
  const lines = transformed.split('\n');
  const children = lines.map((line) => {
    if (line.startsWith('### '))
      return new Paragraph({ text: line.slice(4), heading: HeadingLevel.HEADING_3 });
    if (line.startsWith('## '))
      return new Paragraph({ text: line.slice(3), heading: HeadingLevel.HEADING_2 });
    if (line.startsWith('# '))
      return new Paragraph({ text: line.slice(2), heading: HeadingLevel.HEADING_1 });
    if (line.startsWith('```'))
      return new Paragraph({ text: line, alignment: AlignmentType.CENTER });
    return new Paragraph({ children: [new TextRun(line)] });
  });

  const doc = new Document({
    sections: [{ children }],
  });

  return await Packer.toBlob(doc);
}
