import { describe, it, expect } from 'vitest';
import {
  settingsSchema,
  exportPdfSchema,
  exportDocxSchema,
  exportHtmlSchema,
  exportBatchSchema,
} from '@/lib/validators';

describe('settingsSchema', () => {
  it('accepts an empty object (all fields have defaults)', () => {
    const r = settingsSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it('rejects out-of-range fontSize', () => {
    const r = settingsSchema.safeParse({ fontSize: 100 });
    expect(r.success).toBe(false);
  });
});

describe('exportPdfSchema', () => {
  it('accepts a4 + normal margins + embedFonts true', () => {
    expect(exportPdfSchema.safeParse({ format: 'a4', margins: 'normal', embedFonts: true }).success).toBe(true);
  });
  it('rejects unknown format', () => {
    expect(exportPdfSchema.safeParse({ format: 'b4' }).success).toBe(false);
  });
});

describe('exportDocxSchema', () => {
  it('accepts standard template', () => {
    expect(exportDocxSchema.safeParse({ template: 'standard' }).success).toBe(true);
  });
  it('rejects unknown template', () => {
    expect(exportDocxSchema.safeParse({ template: 'fancy' }).success).toBe(false);
  });
});

describe('exportHtmlSchema', () => {
  it('accepts github highlight style', () => {
    expect(exportHtmlSchema.safeParse({ standalone: true, highlightStyle: 'github' }).success).toBe(true);
  });
});

describe('exportBatchSchema', () => {
  it('accepts a non-empty file list', () => {
    expect(exportBatchSchema.safeParse({ format: 'pdf', concurrency: 4, filePaths: ['/a.md'] }).success).toBe(true);
  });
  it('rejects empty file list', () => {
    expect(exportBatchSchema.safeParse({ format: 'pdf', concurrency: 4, filePaths: [] }).success).toBe(false);
  });
});
