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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAppStore } from '@/stores/app-store';
import { ExportDialogFooter } from './ExportDialogFooter';
import { toast } from '@/lib/toast';

type ToolKey = 'imagemagick' | 'ffmpeg';

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
};

const toolLabels: Record<ToolKey, string> = {
  imagemagick: 'ImageMagick',
  ffmpeg: 'FFmpeg',
};

export function BatchMediaConverterDialog() {
  const closeModal = useAppStore((s) => s.closeModal);
  const [tool, setTool] = useState<ToolKey>('imagemagick');
  const [fromFormat, setFromFormat] = useState('');
  const [toFormat, setToFormat] = useState('');
  const [inputFolder, setInputFolder] = useState('');
  const [outputFolder, setOutputFolder] = useState('');
  const [includeSubfolders, setIncludeSubfolders] = useState(false);
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const inputFormats = converterFormats[tool].input;
  const outputFormats = converterFormats[tool].output;

  useEffect(() => {
    setFromFormat('');
    setToFormat('');
  }, [tool]);

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

    const batchProgressHandler = (_event: unknown, data: { current?: number; total?: number }) => {
      if (typeof data?.current === 'number' && typeof data?.total === 'number') {
        setProgress(Math.round((data.current / data.total) * 100));
      }
    };
    const completeHandler = (_event: unknown, data: { outputPath?: string; error?: string }) => {
      setConverting(false);
      setProgress(100);
      if (data?.error) {
        setError(data.error);
        toast.error(`Batch conversion failed: ${data.error}`);
      } else {
        toast.success('Batch conversion complete');
        closeModal();
      }
    };

    const unsubBatch =
      window.electronAPI?.on?.('batch-progress', batchProgressHandler) ?? (() => {});
    const unsubComplete =
      window.electronAPI?.on?.('conversion-complete', completeHandler) ?? (() => {});
    handlers.push(unsubBatch, unsubComplete);

    return () => handlers.forEach((h) => h());
  }, [closeModal]);

  const handleConvert = async () => {
    if (!fromFormat || !toFormat) {
      setError('Select both source and target formats');
      return;
    }
    if (!inputFolder || !outputFolder) {
      setError('Select both input and output folders');
      return;
    }

    setConverting(true);
    setProgress(0);
    setError(null);

    try {
      await window.electronAPI?.converter?.convertBatch?.({
        tool,
        fromFormat,
        toFormat,
        inputFolder,
        outputFolder,
        includeSubfolders,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      toast.error(`Batch conversion failed: ${msg}`);
      setConverting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && closeModal()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Batch Media Converter</DialogTitle>
          <DialogDescription>
            Convert multiple media files between formats using ImageMagick or FFmpeg
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <Tabs value={tool} onValueChange={(v) => setTool(v as ToolKey)}>
            <TabsList>
              <TabsTrigger value="imagemagick">ImageMagick</TabsTrigger>
              <TabsTrigger value="ffmpeg">FFmpeg</TabsTrigger>
            </TabsList>
            <TabsContent value={tool} className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="batch-from">From</Label>
                  <Select value={fromFormat} onValueChange={setFromFormat}>
                    <SelectTrigger id="batch-from" aria-label="Source format">
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
                  <Label htmlFor="batch-to">To</Label>
                  <Select value={toFormat} onValueChange={setToFormat}>
                    <SelectTrigger id="batch-to" aria-label="Target format">
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

              <div className="flex items-center gap-2">
                <Input
                  value={inputFolder}
                  onChange={(e) => setInputFolder(e.target.value)}
                  placeholder="Input folder"
                  className="flex-1"
                  aria-label="Input folder"
                />
                <Button variant="outline" onClick={handleBrowseInputFolder}>
                  Browse
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
                <Button variant="outline" onClick={handleBrowseOutputFolder}>
                  Browse
                </Button>
              </div>

              <div className="flex items-center gap-3">
                <Switch
                  checked={includeSubfolders}
                  onCheckedChange={setIncludeSubfolders}
                  id="batch-subfolders"
                />
                <Label htmlFor="batch-subfolders">Include subdirectories</Label>
              </div>
            </TabsContent>
          </Tabs>

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
