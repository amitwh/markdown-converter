import { useSettingsStore } from '@/stores/settings-store';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

export function ExportSettings() {
  const { pdfFormat, pdfMargins, pdfEmbedFonts, docxTemplate, htmlHighlightStyle, renderTablesAsAscii, setSetting } = useSettingsStore();

  return (
    <div className="space-y-5 text-sm">
      <div>
        <Label htmlFor="export-pdf-format">Default PDF format</Label>
        <Select value={pdfFormat} onValueChange={(v) => setSetting('pdfFormat', v as any)}>
          <SelectTrigger id="export-pdf-format" aria-label="Default PDF format"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="letter">Letter</SelectItem>
            <SelectItem value="a4">A4</SelectItem>
            <SelectItem value="legal">Legal</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="export-pdf-margins">Default PDF margins</Label>
        <Select value={pdfMargins} onValueChange={(v) => setSetting('pdfMargins', v as any)}>
          <SelectTrigger id="export-pdf-margins" aria-label="Default PDF margins"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="narrow">Narrow</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="wide">Wide</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <label className="flex items-center justify-between">
        <span>Embed fonts in PDFs</span>
        <Switch checked={pdfEmbedFonts} onCheckedChange={(c) => setSetting('pdfEmbedFonts', c)} aria-label="Embed fonts" />
      </label>
      <div>
        <Label htmlFor="export-docx-template">Default DOCX template</Label>
        <Select value={docxTemplate} onValueChange={(v) => setSetting('docxTemplate', v as any)}>
          <SelectTrigger id="export-docx-template" aria-label="Default DOCX template"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="standard">Standard</SelectItem>
            <SelectItem value="minimal">Minimal</SelectItem>
            <SelectItem value="modern">Modern</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="export-html-highlight">Default HTML highlight</Label>
        <Select value={htmlHighlightStyle} onValueChange={(v) => setSetting('htmlHighlightStyle', v as any)}>
          <SelectTrigger id="export-html-highlight" aria-label="Default HTML highlight"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="github">GitHub</SelectItem>
            <SelectItem value="monokai">Monokai</SelectItem>
            <SelectItem value="nord">Nord</SelectItem>
            <SelectItem value="none">None</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <label className="flex items-center justify-between">
        <span>Render tables as ASCII by default</span>
        <Switch checked={renderTablesAsAscii} onCheckedChange={(c) => setSetting('renderTablesAsAscii', c)} aria-label="ASCII tables by default" />
      </label>
    </div>
  );
}