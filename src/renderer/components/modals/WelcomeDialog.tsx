import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useAppStore } from '@/stores/app-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useCommandStore } from '@/stores/command-store';
import { cn } from '@/lib/utils';

interface QuickStartItem {
  label: string;
  shortcut: string;
  commandId: string;
}

interface FeatureItem {
  label: string;
  description: string;
  icon: string;
}

const quickStartItems: QuickStartItem[] = [
  { label: 'New File', shortcut: 'Ctrl+N', commandId: 'file.new' },
  { label: 'Open File', shortcut: 'Ctrl+O', commandId: 'file.open' },
  { label: 'Open Folder', shortcut: 'Ctrl+Shift+O', commandId: 'file.openFolder' },
  { label: 'Command Palette', shortcut: 'Ctrl+Shift+P', commandId: 'shortcuts.show' },
];

const features: FeatureItem[] = [
  { label: 'CodeMirror 6', description: 'Fast, extensible editor', icon: 'code' },
  { label: 'Live Preview', description: 'Mermaid, KaTeX support', icon: 'eye' },
  { label: 'PDF Editing', description: 'Print-ready export', icon: 'file-text' },
  { label: '25+ Themes', description: 'Light, dark, custom', icon: 'palette' },
  { label: 'Batch Conversion', description: 'ImageMagick, FFmpeg, more', icon: 'layers' },
  { label: 'Plugin System', description: 'Extend with plugins', icon: 'puzzle' },
];

const shortcutEntries = [
  { keys: 'Ctrl+S', action: 'Save' },
  { keys: 'Ctrl+B', action: 'Toggle sidebar' },
  { keys: 'Ctrl+\\', action: 'Toggle preview' },
  { keys: 'Ctrl+W', action: 'Close tab' },
  { keys: 'Ctrl+F', action: 'Find' },
  { keys: 'Ctrl+Shift+P', action: 'Command palette' },
  { keys: 'Ctrl+K Z', action: 'Zen mode' },
  { keys: 'Ctrl+Tab', action: 'Next tab' },
];

export function WelcomeDialog() {
  const closeModal = useAppStore((s) => s.closeModal);
  const setSetting = useSettingsStore((s) => s.setSetting);
  const [dontShow, setDontShow] = useState(false);
  const [version, setVersion] = useState('');
  const [recentFiles, setRecentFiles] = useState<string[]>([]);

  useEffect(() => {
    async function loadVersion() {
      const result = await window.electronAPI?.app?.getVersion?.();
      if (result && typeof result === 'object' && 'data' in result) {
        setVersion((result as { data: string }).data);
      } else if (typeof result === 'string') {
        setVersion(result);
      }
    }
    void loadVersion();
    const stored = localStorage.getItem('mc-recent-files');
    if (stored) {
      try {
        setRecentFiles(JSON.parse(stored).slice(0, 5));
      } catch {
        /* ignore */
      }
    }
  }, []);

  const handleClose = () => {
    if (dontShow) setSetting('welcomeDismissed', true);
    closeModal();
  };

  const handleQuickStart = (commandId: string) => {
    useCommandStore.getState().dispatch(commandId);
    handleClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">
            Welcome to MarkdownConverter{version ? ` v${version}` : ''}
          </DialogTitle>
          <DialogDescription>
            A powerful Markdown editor with PDF, DOCX, HTML export and universal file conversion.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 text-sm">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Quick Start
              </h3>
              {quickStartItems.map((item) => (
                <button
                  key={item.commandId}
                  onClick={() => handleQuickStart(item.commandId)}
                  className="flex w-full items-center justify-between rounded-md border border-border bg-card/30 p-2.5 text-left transition-colors hover:bg-accent/50"
                >
                  <span className="font-medium">{item.label}</span>
                  <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {item.shortcut}
                  </kbd>
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Features
              </h3>
              {features.map((feat) => (
                <div
                  key={feat.label}
                  className="flex items-start gap-2 rounded-md border border-border bg-card/30 p-2.5"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
                    <FeatureIcon name={feat.icon} />
                  </div>
                  <div>
                    <p className="font-medium leading-tight">{feat.label}</p>
                    <p className="text-xs text-muted-foreground">{feat.description}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Recent Files
              </h3>
              {recentFiles.length === 0 ? (
                <div className="rounded-md border border-border bg-card/30 p-4 text-center text-muted-foreground">
                  No recent files
                </div>
              ) : (
                recentFiles.map((path, idx) => (
                  <button
                    key={`${path}-${idx}`}
                    onClick={() => {
                      useCommandStore.getState().dispatch('file.opened', { path });
                      handleClose();
                    }}
                    className="flex w-full items-center rounded-md border border-border bg-card/30 px-2.5 py-2 text-left transition-colors hover:bg-accent/50"
                  >
                    <span className="flex-1 truncate text-xs" title={path}>
                      {path.split('/').pop()}
                    </span>
                    <span
                      className="ml-2 truncate font-mono text-[10px] text-muted-foreground"
                      title={path}
                    >
                      {path}
                    </span>
                  </button>
                ))
              )}

              <h3 className="pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Shortcuts
              </h3>
              <div className="rounded-md border border-border bg-card/30">
                {shortcutEntries.map((s) => (
                  <div
                    key={s.keys}
                    className={cn(
                      'flex items-center justify-between px-2.5 py-1.5 text-xs',
                      shortcutEntries.indexOf(s) < shortcutEntries.length - 1 &&
                        'border-b border-border'
                    )}
                  >
                    <span className="text-muted-foreground">{s.action}</span>
                    <kbd className="font-mono text-[10px]">{s.keys}</kbd>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={dontShow}
              onCheckedChange={(c) => setDontShow(!!c)}
              aria-label="Don't show again"
            />
            Don't show on startup
          </label>
          <Button onClick={handleClose}>Get started</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FeatureIcon({ name }: { name: string }) {
  const icons: Record<string, JSX.Element> = {
    code: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
    eye: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
    'file-text': (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
        <path d="M14 2v4a2 2 0 0 0 2 2h4" />
        <path d="M10 9H8" />
        <path d="M16 13H8" />
        <path d="M16 17H8" />
      </svg>
    ),
    palette: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
        <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
        <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
        <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
      </svg>
    ),
    layers: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
        <path d="m22 12.5-8.58 3.91a2 2 0 0 1-1.66 0L2 12.08" />
      </svg>
    ),
    puzzle: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877l-1.568-1.568A2.402 2.402 0 0 1 1.998 12c0-.617.236-1.234.706-1.704L4.315 8.685a.98.98 0 0 1 .837-.276c.47.07.802.48.968.925a2.501 2.501 0 1 0 3.214-3.214c-.446-.166-.855-.497-.925-.968a.979.979 0 0 1 .276-.837l1.61-1.61a2.404 2.404 0 0 1 1.705-.707c.618 0 1.234.236 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.968a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02Z" />
      </svg>
    ),
  };
  return icons[name] ?? null;
}
