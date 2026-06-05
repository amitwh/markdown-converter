export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modifiedAt?: string;
}

export interface FileResult {
  path: string;
  content: string;
}

export interface PdfOptions {
  inputPath: string;
  outputPath: string;
  format?: 'letter' | 'a4' | 'legal';
  margins?: { top: number; right: number; bottom: number; left: number };
  toc?: boolean;
  embedFonts?: boolean;
}

export interface DocxOptions {
  inputPath: string;
  outputPath: string;
  template?: string;
  referenceDoc?: string;
}

export interface HtmlOptions {
  inputPath: string;
  outputPath: string;
  standalone?: boolean;
  highlightStyle?: string;
}

export interface ExportResult {
  outputPath: string;
  bytes: number;
  durationMs: number;
}

export interface BatchItem {
  inputPath: string;
  outputPath: string;
}

export interface BatchOptions {
  format: 'pdf' | 'docx' | 'html' | 'png';
  concurrency?: number;
}

export interface BatchResult {
  total: number;
  succeeded: number;
  failed: number;
  results: Array<{ item: BatchItem; ok: boolean; error?: string }>;
}