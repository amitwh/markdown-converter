import { AppShell } from './components/layout/AppShell';
import { ModalLayer } from './components/modals/ModalLayer';
import { Toaster } from './components/ui/sonner';
import { useWelcomeTrigger } from './hooks/use-welcome-trigger';

function App() {
  useWelcomeTrigger();
  return (
    <>
      <AppShell />
      <ModalLayer />
      <Toaster />
    </>
  );
}
export default App;
