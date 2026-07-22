import { useEffect, useState } from 'react';
import { ipc } from '@/lib/ipc';

interface Dump {
  filename: string;
  kind: string;
  message?: string;
  timestamp: string;
}

export function CrashReportModal({ onClose }: { onClose: () => void }) {
  const [dumps, setDumps] = useState<Dump[]>([]);

  const refresh = async () => {
    const result = await ipc.crash.read();
    if (!result.ok) {
      setDumps([]);
      return;
    }
    setDumps(Array.isArray(result.data) ? (result.data as Dump[]) : []);
  };
  useEffect(() => {
    refresh();
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="crash-report-modal"
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
    >
      <div className="bg-white dark:bg-neutral-900 rounded-lg p-6 w-[36rem] max-h-[80vh] overflow-y-auto shadow-xl">
        <header className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Crash reports</h2>
          <button onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <button
          onClick={() => ipc.crash.openDir()}
          className="mb-4 px-3 py-1 text-sm border rounded"
        >
          Open dump folder
        </button>
        {dumps.length === 0 ? (
          <p data-testid="empty-state" className="text-neutral-500">
            No crashes recorded — nice work!
          </p>
        ) : (
          <ul className="space-y-2">
            {dumps.map((d) => (
              <li
                key={d.filename}
                className="border rounded p-2 text-sm flex justify-between items-start gap-2"
              >
                <div>
                  <div className="font-mono text-xs text-neutral-500">{d.timestamp}</div>
                  <div>{d.message ?? '(no message)'}</div>
                </div>
                <button
                  onClick={async () => {
                    await ipc.crash.delete(d.filename);
                    refresh();
                  }}
                  className="text-red-600 text-xs"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
