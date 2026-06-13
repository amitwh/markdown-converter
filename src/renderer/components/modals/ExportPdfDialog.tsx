import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useAppStore } from '@/stores/app-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useExportSource } from '@/hooks/use-export-source';
import { toast } from '@/lib/toast';
import { ExportDialogFooter } from './ExportDialogFooter';
import { ipc } from '@/lib/ipc';
import { generateHtml } from '@/lib/html-export';

const MARGIN_MAP = {
  normal: { top: 25, right: 25, bottom: 25, left: 25 },
  narrow: { top: 15, right: 15, bottom: 15, left: 15 },
  wide: { top: 35, right: 35, bottom: 35, left: 35 },
} as const;

export function ExportPdfDialog({ sourcePath }: { sourcePath: string }) {
  const closeModal = useAppStore((s) => s.closeModal);
  const { fontSize, pdfFormat, pdfMargins, pdfEmbedFonts, renderTablesAsAscii } =
    useSettingsStore();
  const [format, setFormat] = useState<'letter' | 'a4' | 'legal'>(pdfFormat);
  const [margins, setMargins] = useState<'normal' | 'narrow' | 'wide'>(pdfMargins);
  const [embed, setEmbed] = useState(pdfEmbedFonts);
  const [ascii, setAscii] = useState(renderTablesAsAscii);
  const [engine, setEngine] = useState<'pdflatex' | 'xelatex' | 'lualatex'>('pdflatex');
  const [toc, setToc] = useState(false);
  const [tocDepth, setTocDepth] = useState(3);
  const [numberSections, setNumberSections] = useState(false);
  const [pageGeometry, setPageGeometry] = useState<'margin' | 'crop' | 'bleed'>('margin');
  const [bibliography, setBibliography] = useState('');
  const [mainFont, setMainFont] = useState('');
  const [cjkFont, setCjkFont] = useState('');
  const [highlightStyle, setHighlightStyle] = useState('tango');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const source = useExportSource();

  const handleSubmit = async () => {
    if (!source) {
      setError('No file open.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const html = generateHtml({
        source: source.source,
        title: source.title,
        standalone: true,
        highlightStyle: 'github',
        renderTablesAsAscii: ascii,
      });
      const fmt =
        format === 'a4'
          ? { width: '210mm', height: '297mm' }
          : format === 'legal'
            ? { width: '8.5in', height: '14in' }
            : { width: '8.5in', height: '11in' };
      const m = MARGIN_MAP[margins];
      const pageCss = `@page { size: ${fmt.width} ${fmt.height}; margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm; }`;
      const finalHtml = html.replace('</style>', `${pageCss}</style>`);

      const options = {
        html: finalHtml,
        withStyles: embed,
        engine,
        toc,
        tocDepth,
        numberSections,
        pageGeometry,
        bibliography: bibliography || undefined,
        mainFont: mainFont || undefined,
        cjkFont: cjkFont || undefined,
        highlightStyle,
      };

      const result = await (window.electronAPI?.export?.withOptions?.('pdf', options) ??
        ipc.print.show({ html: finalHtml, withStyles: embed }));

      if (!result.ok) {
        const msg = result.error?.message ?? 'PDF export failed';
        toast.error(`Export failed: ${msg}`);
        setError(msg);
        setSubmitting(false);
        return;
      }
      toast.success(`Sent ${source.title} to printer`);
      closeModal();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Export failed: ${msg}`);
      setError(msg);
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && closeModal()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Export to PDF</DialogTitle>
          <DialogDescription>{sourcePath}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <Label htmlFor="pdf-format">Format</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as typeof format)}>
              <SelectTrigger id="pdf-format" aria-label="Format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="letter">Letter</SelectItem>
                <SelectItem value="a4">A4</SelectItem>
                <SelectItem value="legal">Legal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="pdf-margins">Margins</Label>
            <Select value={margins} onValueChange={(v) => setMargins(v as typeof margins)}>
              <SelectTrigger id="pdf-margins" aria-label="Margins">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="narrow">Narrow</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="wide">Wide</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={embed}
              onCheckedChange={(c) => setEmbed(!!c)}
              aria-label="Embed fonts"
            />
            Embed fonts
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={ascii}
              onCheckedChange={(c) => setAscii(!!c)}
              aria-label="ASCII tables"
            />
            Render tables as ASCII
          </label>
          <div>
            <Label htmlFor="pdf-engine">PDF Engine</Label>
            <Select value={engine} onValueChange={(v) => setEngine(v as typeof engine)}>
              <SelectTrigger id="pdf-engine" aria-label="PDF Engine">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pdflatex">pdflatex</SelectItem>
                <SelectItem value="xelatex">xelatex</SelectItem>
                <SelectItem value="lualatex">lualatex</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={toc} onCheckedChange={setToc} id="pdf-toc" />
            <Label htmlFor="pdf-toc">Table of Contents</Label>
          </div>
          {toc && (
            <div className="pl-9">
              <Label htmlFor="pdf-toc-depth">TOC Depth</Label>
              <Input
                id="pdf-toc-depth"
                type="number"
                min={1}
                max={6}
                value={tocDepth}
                onChange={(e) => setTocDepth(Math.min(6, Math.max(1, Number(e.target.value))))}
                className="w-20"
                aria-label="TOC depth"
              />
            </div>
          )}
          <div className="flex items-center gap-3">
            <Switch checked={numberSections} onCheckedChange={setNumberSections} id="pdf-number-sections" />
            <Label htmlFor="pdf-number-sections">Number sections</Label>
          </div>
          <div>
            <Label htmlFor="pdf-page-geometry">Page Geometry</Label>
            <Select value={pageGeometry} onValueChange={(v) => setPageGeometry(v as typeof pageGeometry)}>
              <SelectTrigger id="pdf-page-geometry" aria-label="Page geometry">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="margin">Margin</SelectItem>
                <SelectItem value="crop">Crop</SelectItem>
                <SelectItem value="bleed">Bleed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="pdf-bibliography">Bibliography file</Label>
            <Input
              id="pdf-bibliography"
              value={bibliography}
              onChange={(e) => setBibliography(e.target.value)}
              placeholder="/path/to/references.bib"
              aria-label="Bibliography file path"
            />
          </div>
          <div>
            <Label htmlFor="pdf-main-font">Main font</Label>
            <Input
              id="pdf-main-font"
              value={mainFont}
              onChange={(e) => setMainFont(e.target.value)}
              placeholder="e.g. Latin Modern"
              aria-label="Main font"
            />
          </div>
          <div>
            <Label htmlFor="pdf-cjk-font">CJK font</Label>
            <Input
              id="pdf-cjk-font"
              value={cjkFont}
              onChange={(e) => setCjkFont(e.target.value)}
              placeholder="e.g. Noto Sans CJK SC"
              aria-label="CJK font"
            />
          </div>
          <div>
            <Label htmlFor="pdf-highlight">Highlight style</Label>
            <Select value={highlightStyle} onValueChange={setHighlightStyle}>
              <SelectTrigger id="pdf-highlight" aria-label="Highlight style">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tango">Tango</SelectItem>
                <SelectItem value="pygments">Pygments</SelectItem>
                <SelectItem value="kateks">Kate (Kateks)</SelectItem>
                <SelectItem value="monochrome">Monochrome</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error && (
            <div
              role="alert"
              className="rounded border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive"
            >
              {error}
            </div>
          )}
        </div>
        <ExportDialogFooter
          onCancel={closeModal}
          onSubmit={handleSubmit}
          submitting={submitting}
          submitLabel="Export"
        />
      </DialogContent>
    </Dialog>
  );
}
