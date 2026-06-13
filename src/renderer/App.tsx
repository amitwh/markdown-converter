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

function App() {
  useWelcomeTrigger();
  useAutoUpdateCheck();
  const [printOpen, setPrintOpen] = useState(false);

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
