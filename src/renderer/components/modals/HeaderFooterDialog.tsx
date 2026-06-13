import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAppStore } from '@/stores/app-store';
import { toast } from '@/lib/toast';

interface HeaderFooterSettings {
  headerEnabled: boolean;
  footerEnabled: boolean;
  headerLeft: string;
  headerCenter: string;
  headerRight: string;
  footerLeft: string;
  footerCenter: string;
  footerRight: string;
  logoPosition: 'none' | 'left' | 'right';
  logoPath: string | null;
}

const DYNAMIC_FIELDS = [
  { token: '$PAGE$', label: 'Page' },
  { token: '$TOTAL$', label: 'Total Pages' },
  { token: '$DATE$', label: 'Date' },
  { token: '$TIME$', label: 'Time' },
  { token: '$TITLE$', label: 'Title' },
  { token: '$AUTHOR$', label: 'Author' },
  { token: '$FILENAME$', label: 'Filename' },
] as const;

const DEFAULTS: HeaderFooterSettings = {
  headerEnabled: false,
  footerEnabled: false,
  headerLeft: '',
  headerCenter: '',
  headerRight: '',
  footerLeft: '',
  footerCenter: '',
  footerRight: '',
  logoPosition: 'none',
  logoPath: null,
};

type FieldKey = keyof Pick<
  HeaderFooterSettings,
  'headerLeft' | 'headerCenter' | 'headerRight' | 'footerLeft' | 'footerCenter' | 'footerRight'
>;

export function HeaderFooterDialog() {
  const closeModal = useAppStore((s) => s.closeModal);
  const [settings, setSettings] = useState<HeaderFooterSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const result = await window.electronAPI?.headerFooter?.getSettings?.();
        if (mounted && result && typeof result === 'object') {
          setSettings({ ...DEFAULTS, ...result });
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const updateField = useCallback((key: FieldKey, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const insertToken = useCallback((key: FieldKey, token: string) => {
    setSettings((prev) => ({
      ...prev,
      [key]: prev[key] + token,
    }));
  }, []);

  const handleBrowseLogo = useCallback(async () => {
    const result = await window.electronAPI?.headerFooter?.browseLogo?.();
    if (typeof result === 'string') {
      setSettings((prev) => ({
        ...prev,
        logoPath: result,
        logoPosition: prev.logoPosition === 'none' ? 'left' : prev.logoPosition,
      }));
    }
  }, []);

  const handleClearLogo = useCallback(() => {
    setSettings((prev) => ({ ...prev, logoPath: null, logoPosition: 'none' }));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await window.electronAPI?.headerFooter?.saveSettings?.(settings);
      toast.success('Header & footer settings saved');
      closeModal();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to save: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const fieldRows: Array<{ key: FieldKey; label: string; enabled: boolean }> = [
    { key: 'headerLeft', label: 'Left', enabled: settings.headerEnabled },
    { key: 'headerCenter', label: 'Center', enabled: settings.headerEnabled },
    { key: 'headerRight', label: 'Right', enabled: settings.headerEnabled },
    { key: 'footerLeft', label: 'Left', enabled: settings.footerEnabled },
    { key: 'footerCenter', label: 'Center', enabled: settings.footerEnabled },
    { key: 'footerRight', label: 'Right', enabled: settings.footerEnabled },
  ];

  if (loading) return null;

  return (
    <Dialog open onOpenChange={(o) => !o && closeModal()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Header & Footer</DialogTitle>
          <DialogDescription>
            Configure headers and footers for exported documents
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <label className="flex items-center gap-2">
            <Checkbox
              checked={settings.headerEnabled}
              onCheckedChange={(c) => setSettings((p) => ({ ...p, headerEnabled: !!c }))}
              aria-label="Enable header"
            />
            Enable header
          </label>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Header</p>
            {fieldRows
              .filter((r) => r.key.startsWith('header'))
              .map((row) => (
                <div key={row.key} className="flex items-center gap-2">
                  <span className="w-12 text-xs text-muted-foreground">{row.label}</span>
                  <Input
                    value={settings[row.key]}
                    onChange={(e) => updateField(row.key, e.target.value)}
                    placeholder={`Header ${row.label.toLowerCase()}`}
                    className="flex-1"
                    disabled={!settings.headerEnabled}
                    aria-label={`Header ${row.label.toLowerCase()}`}
                  />
                  <div className="flex gap-0.5">
                    {DYNAMIC_FIELDS.slice(0, 4).map((field) => (
                      <Button
                        key={field.token}
                        variant="ghost"
                        size="sm"
                        className="h-7 px-1.5 text-[10px]"
                        disabled={!settings.headerEnabled}
                        onClick={() => insertToken(row.key, field.token)}
                        title={field.label}
                      >
                        {field.token}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
          </div>

          <label className="flex items-center gap-2">
            <Checkbox
              checked={settings.footerEnabled}
              onCheckedChange={(c) => setSettings((p) => ({ ...p, footerEnabled: !!c }))}
              aria-label="Enable footer"
            />
            Enable footer
          </label>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Footer</p>
            {fieldRows
              .filter((r) => r.key.startsWith('footer'))
              .map((row) => (
                <div key={row.key} className="flex items-center gap-2">
                  <span className="w-12 text-xs text-muted-foreground">{row.label}</span>
                  <Input
                    value={settings[row.key]}
                    onChange={(e) => updateField(row.key, e.target.value)}
                    placeholder={`Footer ${row.label.toLowerCase()}`}
                    className="flex-1"
                    disabled={!settings.footerEnabled}
                    aria-label={`Footer ${row.label.toLowerCase()}`}
                  />
                  <div className="flex gap-0.5">
                    {DYNAMIC_FIELDS.slice(0, 4).map((field) => (
                      <Button
                        key={field.token}
                        variant="ghost"
                        size="sm"
                        className="h-7 px-1.5 text-[10px]"
                        disabled={!settings.footerEnabled}
                        onClick={() => insertToken(row.key, field.token)}
                        title={field.label}
                      >
                        {field.token}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Logo</p>
            <div className="flex items-center gap-2">
              <Select
                value={settings.logoPosition}
                onValueChange={(v) =>
                  setSettings((p) => ({
                    ...p,
                    logoPosition: v as HeaderFooterSettings['logoPosition'],
                  }))
                }
              >
                <SelectTrigger className="w-32" aria-label="Logo position">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                </SelectContent>
              </Select>
              {settings.logoPosition !== 'none' && (
                <>
                  <Input
                    value={settings.logoPath ?? ''}
                    readOnly
                    placeholder="No logo selected"
                    className="flex-1"
                    aria-label="Logo path"
                  />
                  <Button variant="outline" size="sm" onClick={handleBrowseLogo}>
                    Browse
                  </Button>
                  {settings.logoPath && (
                    <Button variant="ghost" size="sm" onClick={handleClearLogo}>
                      Clear
                    </Button>
                  )}
                </>
              )}
            </div>
            {settings.logoPath && (
              <img
                src={`file://${settings.logoPath}`}
                alt="Logo preview"
                className="h-8 rounded border object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={closeModal} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
