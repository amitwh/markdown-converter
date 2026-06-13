import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useAppStore } from '@/stores/app-store';
import { ExportDialogFooter } from './ExportDialogFooter';
import { toast } from '@/lib/toast';

type ToolKey = 'imagemagick' | 'ffmpeg' | 'libreoffice' | 'pandoc';

interface FormatOption {
  value: string;
  label: string;
}

const converterFormats: Record<ToolKey, { input: FormatOption[]; output: FormatOption[] }> = {
  imagemagick: {
    input: [
      { value: 'png', label: 'PNG' },
      { value: 'jpg', label: 'JPEG' },
      { value: 'webp', label: 'WebP' },
      { value: 'gif', label: 'GIF' },
      { value: 'bmp', label: 'BMP' },
      { value: 'tiff', label: 'TIFF' },
      { value: 'svg', label: 'SVG' },
      { value: 'ico', label: 'ICO' },
    ],
    output: [
      { value: 'png', label: 'PNG' },
      { value: 'jpg', label: 'JPEG' },
      { value: 'webp', label: 'WebP' },
      { value: 'gif', label: 'GIF' },
      { value: 'pdf', label: 'PDF' },
      { value: 'bmp', label: 'BMP' },
      { value: 'ico', label: 'ICO' },
    ],
  },
  ffmpeg: {
    input: [
      { value: 'mp4', label: 'MP4' },
      { value: 'mp3', label: 'MP3' },
      { value: 'wav', label: 'WAV' },
      { value: 'avi', label: 'AVI' },
      { value: 'mkv', label: 'MKV' },
      { value: 'flac', label: 'FLAC' },
      { value: 'ogg', label: 'OGG' },
      { value: 'mov', label: 'MOV' },
    ],
    output: [
      { value: 'mp4', label: 'MP4' },
      { value: 'mp3', label: 'MP3' },
      { value: 'wav', label: 'WAV' },
      { value: 'avi', label: 'AVI' },
      { value: 'mkv', label: 'MKV' },
      { value: 'flac', label: 'FLAC' },
      { value: 'ogg', label: 'OGG' },
      { value: 'gif', label: 'GIF' },
      { value: 'webm', label: 'WebM' },
    ],
  },
  libreoffice: {
    input: [
      { value: 'docx', label: 'DOCX' },
      { value: 'xlsx', label: 'XLSX' },
      { value: 'pptx', label: 'PPTX' },
      { value: 'odt', label: 'ODT' },
      { value: 'pdf', label: 'PDF' },
      { value: 'html', label: 'HTML' },
    ],
    output: [
      { value: 'pdf', label: 'PDF' },
      { value: 'docx', label: 'DOCX' },
      { value: 'xlsx', label: 'XLSX' },
      { value: 'pptx', label: 'PPTX' },
      { value: 'odt', label: 'ODT' },
      { value: 'html', label: 'HTML' },
      { value: 'txt', label: 'Text' },
    ],
  },
  pandoc: {
    input: [
      { value: 'md', label: 'Markdown' },
      { value: 'html', label: 'HTML' },
      { value: 'docx', label: 'DOCX' },
      { value: 'latex', label: 'LaTeX' },
      { value: 'rst', label: 'reStructuredText' },
      { value: 'epub', label: 'EPUB' },
      { value: 'org', label: 'Org Mode' },
      { value: 'wiki', label: 'MediaWiki' },
    ],
    output: [
      { value: 'pdf', label: 'PDF' },
      { value: 'docx', label: 'DOCX' },
      { value: 'html', label: 'HTML' },
      { value: 'latex', label: 'LaTeX' },
      { value: 'epub', label: 'EPUB' },
      { value: 'rst', label: 'reStructuredText' },
      { value: 'org', label: 'Org Mode' },
      { value: 'plain', label: 'Plain Text' },
      { value: 'rtf', label: 'RTF' },
      { value: 'odt', label: 'ODT' },
      { value: 'wiki', label: 'MediaWiki' },
    ],
  },
};

const toolLabels: Record<ToolKey, string> = {
  imagemagick: 'ImageMagick',
  ffmpeg: 'FFmpeg',
  libreoffice: 'LibreOffice',
  pandoc: 'Pandoc',
};

export function UniversalConverterDialog() {
  const closeModal = useAppStore((s) => s.closeModal);
  const [tool, setTool] = useState<ToolKey>('pandoc');
  const [fromFormat, setFromFormat] = useState('');
  const [toFormat, setToFormat] = useState('');
  const [filePath, setFilePath] = useState('');
  const [batchMode, setBatchMode] = useState(false);
  const [inputFolder, setInputFolder] = useState('');
  const [outputFolder, setOutputFolder] = useState('');
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const inputFormats = converterFormats[tool].input;
  const outputFormats = converterFormats[tool].output;

  useEffect(() => {
    setFromFormat('');
    setToFormat('');
  }, [tool]);

  const handleBrowseFile = useCallback(async () => {
    const result = await window.electronAPI?.file?.pickFile?.();
    if (typeof result === 'string') {
      setFilePath(result);
    }
  }, []);

  const handleBrowseInputFolder = useCallback(async () => {
    const result = await window.electronAPI?.file?.pickFolder?.();
    if (typeof result === 'string') {
      setInputFolder(result);
    }
  }, []);

  const handleBrowseOutputFolder = useCallback(async () => {
    const result = await window.electronAPI?.file?.pickFolder?.();
    if (typeof result === 'string') {
      setOutputFolder(result);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlers: Array<() => void> = [];

    const statusHandler = (_event: unknown, data: { percent?: number; message?: string }) => {
      if (typeof data?.percent === 'number') setProgress(data.percent);
    };
    const completeHandler = (_event: unknown, data: { outputPath?: string; error?: string }) => {
      setConverting(false);
      setProgress(100);
      if (data?.error) {
        setError(data.error);
        toast.error(`Conversion failed: ${data.error}`);
      } else {
        toast.success('Conversion complete');
        closeModal();
      }
    };
    const batchProgressHandler = (_event: unknown, data: { current?: number; total?: number }) => {
      if (typeof data?.current === 'number' && typeof data?.total === 'number') {
        setProgress(Math.round((data.current / data.total) * 100));
      }
    };

    const unsubStatus = window.electronAPI?.on?.('conversion-status', statusHandler) ?? (() => {});
    const unsubComplete =
      window.electronAPI?.on?.('conversion-complete', completeHandler) ?? (() => {});
    const unsubBatch =
      window.electronAPI?.on?.('batch-progress', batchProgressHandler) ?? (() => {});
    handlers.push(unsubStatus, unsubComplete, unsubBatch);

    return () => handlers.forEach((h) => h());
  }, [closeModal]);

  const handleConvert = async () => {
    if (!fromFormat || !toFormat) {
      setError('Select both source and target formats');
      return;
    }
    if (!batchMode && !filePath) {
      setError('Select a file to convert');
      return;
    }
    if (batchMode && (!inputFolder || !outputFolder)) {
      setError('Select both input and output folders');
      return;
    }

    setConverting(true);
    setProgress(0);
    setError(null);

    try {
      if (batchMode) {
        await window.electronAPI?.converter?.convertBatch?.({
          tool,
          fromFormat,
          toFormat,
          inputFolder,
          outputFolder,
        });
      } else {
        await window.electronAPI?.converter?.convert?.({
          tool,
          inputPath: filePath,
          fromFormat,
          toFormat,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      toast.error(`Conversion failed: ${msg}`);
      setConverting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && closeModal()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Universal Converter</DialogTitle>
          <DialogDescription>
            Convert between image, audio, video, document, and markup formats
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {!batchMode && (
            <div className="flex items-center gap-2">
              <Input
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                placeholder="Select a file..."
                className="flex-1"
                aria-label="File path"
              />
              <Button variant="outline" onClick={handleBrowseFile}>
                Browse
              </Button>
            </div>
          )}

          <div>
            <Label htmlFor="converter-tool">Tool</Label>
            <Select value={tool} onValueChange={(v) => setTool(v as ToolKey)}>
              <SelectTrigger id="converter-tool" aria-label="Conversion tool">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(converterFormats) as ToolKey[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {toolLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="converter-from">From</Label>
              <Select value={fromFormat} onValueChange={setFromFormat}>
                <SelectTrigger id="converter-from" aria-label="Source format">
                  <SelectValue placeholder="Source format" />
                </SelectTrigger>
                <SelectContent>
                  {inputFormats.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="converter-to">To</Label>
              <Select value={toFormat} onValueChange={setToFormat}>
                <SelectTrigger id="converter-to" aria-label="Target format">
                  <SelectValue placeholder="Target format" />
                </SelectTrigger>
                <SelectContent>
                  {outputFormats.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={batchMode} onCheckedChange={setBatchMode} id="batch-mode" />
            <Label htmlFor="batch-mode">Batch mode</Label>
          </div>

          {batchMode && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <Input
                  value={inputFolder}
                  onChange={(e) => setInputFolder(e.target.value)}
                  placeholder="Input folder"
                  className="flex-1"
                  aria-label="Input folder"
                />
                <Button variant="outline" size="sm" onClick={handleBrowseInputFolder}>
                  ...
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={outputFolder}
                  onChange={(e) => setOutputFolder(e.target.value)}
                  placeholder="Output folder"
                  className="flex-1"
                  aria-label="Output folder"
                />
                <Button variant="outline" size="sm" onClick={handleBrowseOutputFolder}>
                  ...
                </Button>
              </div>
            </div>
          )}

          {converting && (
            <div className="space-y-1">
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${Math.max(2, progress)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground text-right">{progress}%</p>
            </div>
          )}

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
          onSubmit={handleConvert}
          submitting={converting}
          submitLabel="Convert"
        />
      </DialogContent>
    </Dialog>
  );
}
