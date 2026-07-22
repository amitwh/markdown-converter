import { useState, useEffect } from 'react';
import { AppShell } from './components/layout/AppShell';
import { ModalLayer } from './components/modals/ModalLayer';
import { CommandPalette } from './components/modals/CommandPalette';
import { Toaster } from './components/ui/sonner';
import { ReplPanel } from './components/tools/ReplPanel';
import { PrintPreview } from './components/tools/PrintPreview';
import { UpdateBanner } from './components/UpdateBanner';
import { FirstRunWizard } from './components/FirstRunWizard';
import { useWelcomeTrigger } from './hooks/use-welcome-trigger';
import { useAutoUpdateCheck } from './hooks/useAutoUpdateCheck';
import { useMonospaceClasses } from './hooks/use-monospace-classes';

import { useSettingsStore } from './stores/settings-store';
import { ipc } from './lib/ipc';
import { toast } from './lib/toast';

function scopeCSS(cssText: string, scopeSelector: string) {
  if (!cssText) return '';
  return cssText.replace(/([^\r\n,{}]+)(,(?=[^}]*{)|(?=[^{]*{))/g, (match, selector, separator) => {
    const trimmed = selector.trim();
    if (
      !trimmed ||
      trimmed.startsWith('@') ||
      trimmed.startsWith(':root') ||
      trimmed.startsWith('from') ||
      trimmed.startsWith('to') ||
      /^\d+%$/.test(trimmed)
    ) {
      return match;
    }
    return scopeSelector + ' ' + trimmed + (separator || '');
  });
}

function App() {
  useWelcomeTrigger();
  useAutoUpdateCheck();
  useMonospaceClasses();
  const [printOpen, setPrintOpen] = useState(false);
  const customCssPath = useSettingsStore((s) => s.customCssPath);

  useEffect(() => {
    let active = true;
    const styleId = 'custom-preview-style';

    async function applyCSS() {
      if (!customCssPath) {
        const styleTag = document.getElementById(styleId);
        if (styleTag) styleTag.remove();
        return;
      }

      const r = await ipc.file.read(customCssPath);
      if (!active) return;
      if (r.ok && r.data) {
        let styleTag = document.getElementById(styleId);
        if (!styleTag) {
          styleTag = document.createElement('style');
          styleTag.id = styleId;
          document.head.appendChild(styleTag);
        }
        styleTag.textContent = scopeCSS(r.data, '.preview-content');
      } else {
        toast.error('Failed to load custom CSS file');
      }
    }

    void applyCSS();
    return () => {
      active = false;
    };
  }, [customCssPath]);

  useEffect(() => {
    window.electronAPI?.file?.rendererReady?.();
  }, []);

  useEffect(() => {
    const handler = () => setPrintOpen(true);
    window.addEventListener('mc:print', handler);
    window.addEventListener('mc:print-preview', handler);
    window.addEventListener('mc:print-preview-styled', handler);
    return () => {
      window.removeEventListener('mc:print', handler);
      window.removeEventListener('mc:print-preview', handler);
      window.removeEventListener('mc:print-preview-styled', handler);
    };
  }, []);

  return (
    <>
      <AppShell />
      <ModalLayer />
      <CommandPalette />
      <Toaster />
      <UpdateBanner />
      <FirstRunWizard />
      <ReplPanel />
      {printOpen && <PrintPreview onClose={() => setPrintOpen(false)} />}
    </>
  );
}
export default App;
