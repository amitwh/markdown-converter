import { AppShell } from './components/layout/AppShell';
import { ModalLayer } from './components/modals/ModalLayer';
import { useWelcomeTrigger } from './hooks/use-welcome-trigger';

function App() {
  useWelcomeTrigger();
  return (
    <>
      <AppShell />
      <ModalLayer />
    </>
  );
}
export default App;
