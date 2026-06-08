import { useUpdaterStore } from '@/lib/updater-store';
import { ipc } from '@/lib/ipc';
import { toast } from 'sonner';

export function UpdateBanner() {
  const { state, version, percent, install, check } = useUpdaterStore();

  if (state === 'idle' || state === 'checking') return null;

  if (state === 'error') {
    return (
      <div data-testid="update-banner" role="status" className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm">
        Couldn't check for updates.{' '}
        <button onClick={async () => { try { await check(); } catch (e: any) { toast.error(e.message); } }} className="underline">
          Try again
        </button>
      </div>
    );
  }

  if (state === 'downloading') {
    return (
      <div data-testid="update-banner" className="bg-blue-50 border-b border-blue-200 px-4 py-2 text-sm">
        Downloading update… {Math.round(percent)}%
      </div>
    );
  }

  if (state === 'ready') {
    return (
      <div data-testid="update-banner" className="bg-green-50 border-b border-green-200 px-4 py-2 text-sm flex items-center gap-3">
        <span>v{version} is ready.</span>
        <button onClick={() => ipc.app.openExternal(`https://github.com/amitwh/markdown-converter/releases/tag/v${version}`)} className="underline">
          View release notes
        </button>
        <button onClick={install} className="px-3 py-1 rounded bg-brand text-white">
          Restart to update
        </button>
      </div>
    );
  }

  return null;
}