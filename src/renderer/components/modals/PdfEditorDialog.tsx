import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/lib/toast';
import {
  FilePlus2,
  Scissors,
  FileDown,
  RotateCw,
  Trash2,
  ArrowUpDown,
  Droplets,
  Lock,
  Unlock,
  Shield,
  Loader2,
  FolderOpen,
  File,
  X,
} from 'lucide-react';

type Operation =
  | 'merge'
  | 'split'
  | 'compress'
  | 'rotate'
  | 'delete'
  | 'reorder'
  | 'watermark'
  | 'encrypt'
  | 'decrypt'
  | 'permissions';

interface OperationConfig {
  id: Operation;
  label: string;
  icon: React.ReactNode;
  needsInput: boolean;
  needsOutput: boolean;
  needsFolder: boolean;
  multiInput: boolean;
}

const OPERATIONS: OperationConfig[] = [
  {
    id: 'merge',
    label: 'Merge',
    icon: <FilePlus2 className="size-3.5" />,
    needsInput: false,
    needsOutput: true,
    needsFolder: false,
    multiInput: true,
  },
  {
    id: 'split',
    label: 'Split',
    icon: <Scissors className="size-3.5" />,
    needsInput: true,
    needsOutput: false,
    needsFolder: true,
    multiInput: false,
  },
  {
    id: 'compress',
    label: 'Compress',
    icon: <FileDown className="size-3.5" />,
    needsInput: true,
    needsOutput: true,
    needsFolder: false,
    multiInput: false,
  },
  {
    id: 'rotate',
    label: 'Rotate',
    icon: <RotateCw className="size-3.5" />,
    needsInput: true,
    needsOutput: true,
    needsFolder: false,
    multiInput: false,
  },
  {
    id: 'delete',
    label: 'Delete',
    icon: <Trash2 className="size-3.5" />,
    needsInput: true,
    needsOutput: true,
    needsFolder: false,
    multiInput: false,
  },
  {
    id: 'reorder',
    label: 'Reorder',
    icon: <ArrowUpDown className="size-3.5" />,
    needsInput: true,
    needsOutput: true,
    needsFolder: false,
    multiInput: false,
  },
  {
    id: 'watermark',
    label: 'Watermark',
    icon: <Droplets className="size-3.5" />,
    needsInput: true,
    needsOutput: true,
    needsFolder: false,
    multiInput: false,
  },
  {
    id: 'encrypt',
    label: 'Encrypt',
    icon: <Lock className="size-3.5" />,
    needsInput: true,
    needsOutput: true,
    needsFolder: false,
    multiInput: false,
  },
  {
    id: 'decrypt',
    label: 'Decrypt',
    icon: <Unlock className="size-3.5" />,
    needsInput: true,
    needsOutput: true,
    needsFolder: false,
    multiInput: false,
  },
  {
    id: 'permissions',
    label: 'Permissions',
    icon: <Shield className="size-3.5" />,
    needsInput: true,
    needsOutput: true,
    needsFolder: false,
    multiInput: false,
  },
];

const WATERMARK_POSITIONS = [
  'center',
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
] as const;

const PERMISSION_OPTIONS = [
  { key: 'printing', label: 'Printing' },
  { key: 'modifying', label: 'Modifying' },
  { key: 'copying', label: 'Copying' },
  { key: 'annotating', label: 'Annotating' },
  { key: 'filling', label: 'Form filling' },
  { key: 'extracting', label: 'Content extraction' },
  { key: 'assembling', label: 'Document assembly' },
] as const;

const SPLIT_MODES = ['ranges', 'interval', 'size'] as const;
type SplitMode = (typeof SPLIT_MODES)[number];

interface Props {
  onClose: () => void;
  initialFilePath?: string;
}

export function PdfEditorDialog({ onClose, initialFilePath }: Props) {
  const [activeTab, setActiveTab] = useState<Operation>('merge');
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [inputPath, setInputPath] = useState(initialFilePath ?? '');
  const [outputPath, setOutputPath] = useState('');
  const [outputFolder, setOutputFolder] = useState('');
  const [mergeFiles, setMergeFiles] = useState<string[]>([]);

  const [pages, setPages] = useState('');
  const [rotateAngle, setRotateAngle] = useState('90');
  const [newOrder, setNewOrder] = useState('');

  const [splitMode, setSplitMode] = useState<SplitMode>('ranges');
  const [pageRanges, setPageRanges] = useState('');
  const [splitInterval, setSplitInterval] = useState('5');
  const [splitSize, setSplitSize] = useState('1');

  const [compressLevel, setCompressLevel] = useState(50);
  const [compressImages, setCompressImages] = useState(true);
  const [compressDuplicates, setCompressDuplicates] = useState(true);
  const [compressFonts, setCompressFonts] = useState(true);

  const [watermarkText, setWatermarkText] = useState('');
  const [watermarkFontSize, setWatermarkFontSize] = useState('48');
  const [watermarkOpacity, setWatermarkOpacity] = useState(30);
  const [watermarkPosition, setWatermarkPosition] = useState('center');
  const [watermarkColor, setWatermarkColor] = useState('#ff0000');
  const [watermarkPages, setWatermarkPages] = useState('');

  const [userPassword, setUserPassword] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [encryptionLevel, setEncryptionLevel] = useState('128');
  const [encryptPermissions, setEncryptPermissions] = useState<Record<string, boolean>>({});

  const [decryptPassword, setDecryptPassword] = useState('');

  const [permissionsPassword, setPermissionsPassword] = useState('');
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (initialFilePath) setInputPath(initialFilePath);
  }, [initialFilePath]);

  const handleProgress = useCallback((e: Event) => {
    const detail = (e as CustomEvent).detail;
    setProgress(detail.message);
  }, []);

  const handleComplete = useCallback(
    (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setSubmitting(false);
      setProgress(null);
      if (detail.success) {
        toast.success(detail.message || 'Operation completed successfully');
        onClose();
      } else {
        const msg = detail.error || 'Operation failed';
        toast.error(msg);
        setError(msg);
      }
    },
    [onClose]
  );

  useEffect(() => {
    window.addEventListener('pdf-operation-progress', handleProgress);
    window.addEventListener('pdf-operation-complete', handleComplete);
    return () => {
      window.removeEventListener('pdf-operation-progress', handleProgress);
      window.removeEventListener('pdf-operation-complete', handleComplete);
    };
  }, [handleProgress, handleComplete]);

  const pickFile = async (): Promise<string | null> => {
    const r = await window.electronAPI?.file?.pickFile();
    return r?.data ?? null;
  };

  const pickFolder = async (): Promise<string | null> => {
    const r = await window.electronAPI?.file?.pickFolder();
    return r?.data ?? null;
  };

  const handleAddMergeFiles = async () => {
    const path = await pickFile();
    if (path) setMergeFiles((prev) => [...prev, path]);
  };

  const handleRemoveMergeFile = (index: number) => {
    setMergeFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePickInput = async () => {
    const path = await pickFile();
    if (path) setInputPath(path);
  };

  const handlePickOutput = async () => {
    const r = await window.electronAPI?.app?.showSaveDialog({
      title: 'Save output PDF',
      defaultPath: outputPath || 'output.pdf',
    });
    if (r?.ok && r.data) setOutputPath(r.data);
  };

  const handlePickFolder = async () => {
    const path = await pickFolder();
    if (path) setOutputFolder(path);
  };

  const buildPayload = (): Record<string, unknown> => {
    const base = { operation: activeTab };
    switch (activeTab) {
      case 'merge':
        return { ...base, inputPaths: mergeFiles, outputPath };
      case 'split': {
        const splitData: Record<string, unknown> = {
          ...base,
          inputPath,
          outputFolder,
          mode: splitMode,
        };
        if (splitMode === 'ranges') splitData.pageRanges = pageRanges;
        if (splitMode === 'interval') splitData.interval = Number(splitInterval);
        if (splitMode === 'size') splitData.maxSizeMB = Number(splitSize);
        return splitData;
      }
      case 'compress':
        return {
          ...base,
          inputPath,
          outputPath,
          compressionLevel: compressLevel,
          compressImages,
          removeDuplicates: compressDuplicates,
          subsetFonts: compressFonts,
        };
      case 'rotate':
        return { ...base, inputPath, outputPath, pages, angle: Number(rotateAngle) };
      case 'delete':
        return { ...base, inputPath, outputPath, pages };
      case 'reorder':
        return {
          ...base,
          inputPath,
          outputPath,
          newOrder: newOrder
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        };
      case 'watermark':
        return {
          ...base,
          inputPath,
          outputPath,
          text: watermarkText,
          fontSize: Number(watermarkFontSize),
          opacity: watermarkOpacity / 100,
          position: watermarkPosition,
          color: watermarkColor,
          pages: watermarkPages,
        };
      case 'encrypt':
        return {
          ...base,
          inputPath,
          outputPath,
          userPassword,
          ownerPassword,
          encryptionLevel: Number(encryptionLevel),
          permissions: encryptPermissions,
        };
      case 'decrypt':
        return { ...base, inputPath, outputPath, password: decryptPassword };
      case 'permissions':
        return { ...base, inputPath, outputPath, ownerPassword: permissionsPassword, permissions };
      default:
        return base;
    }
  };

  const validate = (): string | null => {
    const op = OPERATIONS.find((o) => o.id === activeTab)!;
    if (op.multiInput && mergeFiles.length < 2) return 'Add at least 2 PDF files to merge';
    if (op.needsInput && !inputPath) return 'Select an input PDF file';
    if (op.needsOutput && !outputPath) return 'Select an output path';
    if (op.needsFolder && !outputFolder) return 'Select an output folder';
    if (activeTab === 'watermark' && !watermarkText) return 'Enter watermark text';
    if (activeTab === 'encrypt' && !userPassword) return 'Enter a user password';
    if (activeTab === 'decrypt' && !decryptPassword) return 'Enter the password';
    if (activeTab === 'permissions' && !permissionsPassword) return 'Enter the owner password';
    if (activeTab === 'split' && splitMode === 'ranges' && !pageRanges) return 'Enter page ranges';
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    setError(null);
    setProgress('Starting operation...');
    try {
      const payload = buildPayload();
      await window.electronAPI?.pdf?.processOperation?.(payload);
    } catch (err) {
      setSubmitting(false);
      setProgress(null);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
      setError(msg);
    }
  };

  const renderFileField = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    onPick: () => void,
    placeholder = ''
  ) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1"
        />
        <Button variant="outline" size="sm" onClick={onPick}>
          <File className="size-3.5" />
        </Button>
      </div>
    </div>
  );

  const renderFolderField = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    onPick: () => void,
    placeholder = ''
  ) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1"
        />
        <Button variant="outline" size="sm" onClick={onPick}>
          <FolderOpen className="size-3.5" />
        </Button>
      </div>
    </div>
  );

  const renderError = () =>
    error ? (
      <div
        role="alert"
        className="rounded border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive"
      >
        {error}
      </div>
    ) : null;

  const renderProgress = () =>
    progress ? (
      <div className="flex items-center gap-2 rounded border border-primary/40 bg-primary/5 p-2 text-xs text-primary">
        <Loader2 className="size-3.5 animate-spin" />
        {progress}
      </div>
    ) : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>PDF Editor</DialogTitle>
          <DialogDescription>Manipulate and transform PDF files</DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            setActiveTab(v as Operation);
            setError(null);
          }}
        >
          <TabsList className="flex-wrap">
            {OPERATIONS.map((op) => (
              <TabsTrigger key={op.id} value={op.id} className="gap-1 text-xs">
                {op.icon}
                <span className="hidden sm:inline">{op.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex-1 overflow-y-auto">
            <TabsContent value="merge" className="space-y-3 pt-3">
              <div className="space-y-1.5">
                <Label>PDF files</Label>
                <div className="flex flex-col gap-1.5">
                  {mergeFiles.map((f, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 rounded border border-border bg-card/20 px-2 py-1 text-xs"
                    >
                      <span className="flex-1 truncate">{f}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-6 p-0"
                        onClick={() => handleRemoveMergeFile(i)}
                      >
                        <X className="size-3" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddMergeFiles}
                    disabled={submitting}
                  >
                    <FilePlus2 className="size-3.5" />
                    Add file
                  </Button>
                </div>
              </div>
              {renderFileField(
                'Output path',
                outputPath,
                setOutputPath,
                handlePickOutput,
                'output.pdf'
              )}
              {renderError()}
            </TabsContent>

            <TabsContent value="split" className="space-y-3 pt-3">
              {renderFileField(
                'Input PDF',
                inputPath,
                setInputPath,
                handlePickInput,
                'Select input PDF'
              )}
              {renderFolderField(
                'Output folder',
                outputFolder,
                setOutputFolder,
                handlePickFolder,
                'Select output folder'
              )}
              <div className="space-y-1.5">
                <Label>Split mode</Label>
                <Select value={splitMode} onValueChange={(v) => setSplitMode(v as SplitMode)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ranges">Page ranges</SelectItem>
                    <SelectItem value="interval">Every N pages</SelectItem>
                    <SelectItem value="size">Max file size (MB)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {splitMode === 'ranges' && (
                <div className="space-y-1.5">
                  <Label>Page ranges (e.g. 1-3,5,7-10)</Label>
                  <Input
                    value={pageRanges}
                    onChange={(e) => setPageRanges(e.target.value)}
                    placeholder="1-3,5,7-10"
                  />
                </div>
              )}
              {splitMode === 'interval' && (
                <div className="space-y-1.5">
                  <Label>Pages per split</Label>
                  <Input
                    type="number"
                    value={splitInterval}
                    onChange={(e) => setSplitInterval(e.target.value)}
                    placeholder="5"
                  />
                </div>
              )}
              {splitMode === 'size' && (
                <div className="space-y-1.5">
                  <Label>Max file size (MB)</Label>
                  <Input
                    type="number"
                    value={splitSize}
                    onChange={(e) => setSplitSize(e.target.value)}
                    placeholder="1"
                  />
                </div>
              )}
              {renderError()}
            </TabsContent>

            <TabsContent value="compress" className="space-y-3 pt-3">
              {renderFileField(
                'Input PDF',
                inputPath,
                setInputPath,
                handlePickInput,
                'Select input PDF'
              )}
              {renderFileField(
                'Output path',
                outputPath,
                setOutputPath,
                handlePickOutput,
                'output.pdf'
              )}
              <div className="space-y-1.5">
                <Label>Compression level: {compressLevel}%</Label>
                <Slider
                  value={[compressLevel]}
                  onValueChange={(v) => setCompressLevel(v[0])}
                  min={0}
                  max={100}
                  step={5}
                  aria-label="Compression level"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Low quality / small size</span>
                  <span>High quality / large size</span>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={compressImages}
                    onCheckedChange={(c) => setCompressImages(!!c)}
                  />
                  Compress images
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={compressDuplicates}
                    onCheckedChange={(c) => setCompressDuplicates(!!c)}
                  />
                  Remove duplicate objects
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={compressFonts}
                    onCheckedChange={(c) => setCompressFonts(!!c)}
                  />
                  Subset embedded fonts
                </label>
              </div>
              {renderError()}
            </TabsContent>

            <TabsContent value="rotate" className="space-y-3 pt-3">
              {renderFileField(
                'Input PDF',
                inputPath,
                setInputPath,
                handlePickInput,
                'Select input PDF'
              )}
              {renderFileField(
                'Output path',
                outputPath,
                setOutputPath,
                handlePickOutput,
                'output.pdf'
              )}
              <div className="space-y-1.5">
                <Label>Pages (e.g. 1,3,5-8 — leave blank for all)</Label>
                <Input
                  value={pages}
                  onChange={(e) => setPages(e.target.value)}
                  placeholder="All pages"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Rotation angle</Label>
                <Select value={rotateAngle} onValueChange={setRotateAngle}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="90">90° clockwise</SelectItem>
                    <SelectItem value="180">180°</SelectItem>
                    <SelectItem value="270">270° clockwise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {renderError()}
            </TabsContent>

            <TabsContent value="delete" className="space-y-3 pt-3">
              {renderFileField(
                'Input PDF',
                inputPath,
                setInputPath,
                handlePickInput,
                'Select input PDF'
              )}
              {renderFileField(
                'Output path',
                outputPath,
                setOutputPath,
                handlePickOutput,
                'output.pdf'
              )}
              <div className="space-y-1.5">
                <Label>Pages to delete (e.g. 1,3,5-8)</Label>
                <Input
                  value={pages}
                  onChange={(e) => setPages(e.target.value)}
                  placeholder="1,3,5-8"
                />
              </div>
              {renderError()}
            </TabsContent>

            <TabsContent value="reorder" className="space-y-3 pt-3">
              {renderFileField(
                'Input PDF',
                inputPath,
                setInputPath,
                handlePickInput,
                'Select input PDF'
              )}
              {renderFileField(
                'Output path',
                outputPath,
                setOutputPath,
                handlePickOutput,
                'output.pdf'
              )}
              <div className="space-y-1.5">
                <Label>New page order (comma-separated, e.g. 3,1,2)</Label>
                <Textarea
                  value={newOrder}
                  onChange={(e) => setNewOrder(e.target.value)}
                  placeholder="3,1,2,5,4"
                  rows={2}
                />
              </div>
              {renderError()}
            </TabsContent>

            <TabsContent value="watermark" className="space-y-3 pt-3">
              {renderFileField(
                'Input PDF',
                inputPath,
                setInputPath,
                handlePickInput,
                'Select input PDF'
              )}
              {renderFileField(
                'Output path',
                outputPath,
                setOutputPath,
                handlePickOutput,
                'output.pdf'
              )}
              <div className="space-y-1.5">
                <Label>Watermark text</Label>
                <Input
                  value={watermarkText}
                  onChange={(e) => setWatermarkText(e.target.value)}
                  placeholder="CONFIDENTIAL"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Font size</Label>
                  <Input
                    type="number"
                    value={watermarkFontSize}
                    onChange={(e) => setWatermarkFontSize(e.target.value)}
                    placeholder="48"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Color</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={watermarkColor}
                      onChange={(e) => setWatermarkColor(e.target.value)}
                      className="h-10 w-14 cursor-pointer p-1"
                    />
                    <Input
                      value={watermarkColor}
                      onChange={(e) => setWatermarkColor(e.target.value)}
                      placeholder="#ff0000"
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Opacity: {watermarkOpacity}%</Label>
                <Slider
                  value={[watermarkOpacity]}
                  onValueChange={(v) => setWatermarkOpacity(v[0])}
                  min={5}
                  max={100}
                  step={5}
                  aria-label="Watermark opacity"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Position</Label>
                <Select value={watermarkPosition} onValueChange={setWatermarkPosition}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WATERMARK_POSITIONS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Pages (leave blank for all)</Label>
                <Input
                  value={watermarkPages}
                  onChange={(e) => setWatermarkPages(e.target.value)}
                  placeholder="All pages"
                />
              </div>
              {renderError()}
            </TabsContent>

            <TabsContent value="encrypt" className="space-y-3 pt-3">
              {renderFileField(
                'Input PDF',
                inputPath,
                setInputPath,
                handlePickInput,
                'Select input PDF'
              )}
              {renderFileField(
                'Output path',
                outputPath,
                setOutputPath,
                handlePickOutput,
                'output.pdf'
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>User password</Label>
                  <Input
                    type="password"
                    value={userPassword}
                    onChange={(e) => setUserPassword(e.target.value)}
                    placeholder="Password to open"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Owner password</Label>
                  <Input
                    type="password"
                    value={ownerPassword}
                    onChange={(e) => setOwnerPassword(e.target.value)}
                    placeholder="Password for permissions"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Encryption level</Label>
                <Select value={encryptionLevel} onValueChange={setEncryptionLevel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="40">40-bit RC4</SelectItem>
                    <SelectItem value="128">128-bit RC4</SelectItem>
                    <SelectItem value="128-aes">128-bit AES</SelectItem>
                    <SelectItem value="256-aes">256-bit AES</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                {PERMISSION_OPTIONS.map((p) => (
                  <label key={p.key} className="flex items-center gap-2">
                    <Checkbox
                      checked={!!encryptPermissions[p.key]}
                      onCheckedChange={(c) =>
                        setEncryptPermissions((prev) => ({ ...prev, [p.key]: !!c }))
                      }
                    />
                    {p.label}
                  </label>
                ))}
              </div>
              {renderError()}
            </TabsContent>

            <TabsContent value="decrypt" className="space-y-3 pt-3">
              {renderFileField(
                'Input PDF',
                inputPath,
                setInputPath,
                handlePickInput,
                'Select input PDF'
              )}
              {renderFileField(
                'Output path',
                outputPath,
                setOutputPath,
                handlePickOutput,
                'output.pdf'
              )}
              <div className="space-y-1.5">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={decryptPassword}
                  onChange={(e) => setDecryptPassword(e.target.value)}
                  placeholder="Enter document password"
                />
              </div>
              {renderError()}
            </TabsContent>

            <TabsContent value="permissions" className="space-y-3 pt-3">
              {renderFileField(
                'Input PDF',
                inputPath,
                setInputPath,
                handlePickInput,
                'Select input PDF'
              )}
              {renderFileField(
                'Output path',
                outputPath,
                setOutputPath,
                handlePickOutput,
                'output.pdf'
              )}
              <div className="space-y-1.5">
                <Label>Owner password</Label>
                <Input
                  type="password"
                  value={permissionsPassword}
                  onChange={(e) => setPermissionsPassword(e.target.value)}
                  placeholder="Enter owner password"
                />
              </div>
              <div className="flex flex-col gap-2">
                {PERMISSION_OPTIONS.map((p) => (
                  <label key={p.key} className="flex items-center gap-2">
                    <Checkbox
                      checked={!!permissions[p.key]}
                      onCheckedChange={(c) => setPermissions((prev) => ({ ...prev, [p.key]: !!c }))}
                    />
                    {p.label}
                  </label>
                ))}
              </div>
              {renderError()}
            </TabsContent>
          </div>
        </Tabs>

        {renderProgress()}

        <div className="flex justify-end gap-2 border-t pt-3">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Processing…
              </>
            ) : (
              'Apply'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
