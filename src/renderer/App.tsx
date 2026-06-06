import { useState, useEffect } from 'react';
import { AppShell } from './components/layout/AppShell';
import { ModalLayer } from './components/modals/ModalLayer';
import { Toaster } from './components/ui/sonner';
import { ReplPanel } from './components/tools/ReplPanel';
import { PrintPreview } from './components/tools/PrintPreview';
import { useWelcomeTrigger } from './hooks/use-welcome-trigger';

function App() {
  useWelcomeTrigger();
  const [printOpen, setPrintOpen] = useState(false);

  useEffect(() => {
    const handler = () => setPrintOpen(true);
    window.addEventListener('mc:print', handler);
    return () => window.removeEventListener('mc:print', handler);
  }, []);

  return (
    <>
      <AppShell />
      <ModalLayer />
      <Toaster />
      <ReplPanel />
      {printOpen && <PrintPreview onClose={() => setPrintOpen(false)} />}
    </>
  );
}
export default App;
