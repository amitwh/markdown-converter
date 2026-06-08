import { useState } from 'react';
import { useAppStore } from '@/stores/app-store';
import { useSettingsStore } from '@/stores/settings-store';

const TEMPLATES = {
  blank: '',
  readme: '# Project\n\nDescription.\n\n## Usage\n\n```\nnpm install\n```\n',
  meeting: '# Meeting Notes — YYYY-MM-DD\n\n## Attendees\n\n- \n## Agenda\n\n1. \n\n## Action items\n\n- [ ] \n',
  blog: '# Title\n\n*Subtitle*\n\nLorem ipsum.\n\n---\n\n## Section 1\n',
};

export function FirstRunWizard() {
  const firstRun = useAppStore((s) => s.firstRun);
  const setFirstRun = useAppStore((s) => s.setFirstRun);
  const theme = useSettingsStore((s) => s.theme);
  const setSetting = useSettingsStore((s) => s.setSetting);
  const updateChannel = useSettingsStore((s) => s.updateChannel);
  const [step, setStep] = useState(0);
  const [template, setTemplate] = useState<keyof typeof TEMPLATES>('blank');

  if (!firstRun) return null;

  const close = () => setFirstRun(false);

  return (
    <div data-testid="first-run-wizard" role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <div className="bg-white dark:bg-neutral-900 rounded-lg p-6 w-[28rem] shadow-xl">
        {step === 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-2">Pick a theme</h2>
            <div className="flex gap-2 mb-4">
              {(['light', 'dark', 'system'] as const).map((t) => (
                <label key={t} className="flex items-center gap-1">
                  <input type="radio" name="theme" checked={theme === t} onChange={() => setSetting('theme', t)} />
                  {t}
                </label>
              ))}
            </div>
          </div>
        )}
        {step === 1 && (
          <div>
            <h2 className="text-lg font-semibold mb-2">Update channel</h2>
            <div className="flex flex-col gap-2 mb-4">
              <label className="flex items-center gap-2">
                <input type="radio" name="channel" checked={updateChannel === 'github'} onChange={() => setSetting('updateChannel', 'github')} />
                GitHub Releases (public)
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="channel" checked={updateChannel === 'concreteinfo'} onChange={() => setSetting('updateChannel', 'concreteinfo')} />
                ConcreteInfo self-hosted
              </label>
            </div>
          </div>
        )}
        {step === 2 && (
          <div>
            <h2 className="text-lg font-semibold mb-2">Starter template</h2>
            <select value={template} onChange={(e) => setTemplate(e.target.value as any)} className="border rounded px-2 py-1 w-full mb-4">
              <option value="blank">Blank</option>
              <option value="readme">README</option>
              <option value="meeting">Meeting notes</option>
              <option value="blog">Blog post</option>
            </select>
          </div>
        )}
        <div className="flex justify-between items-center mt-4">
          <button onClick={close} className="text-sm text-neutral-500">Skip</button>
          <div className="flex gap-2">
            {step > 0 && <button onClick={() => setStep(step - 1)}>Back</button>}
            {step < 2 ? (
              <button onClick={() => setStep(step + 1)} className="px-3 py-1 rounded bg-brand text-white">Next</button>
            ) : (
              <button onClick={() => { useAppStore.getState().newBuffer(TEMPLATES[template]); close(); }} className="px-3 py-1 rounded bg-brand text-white">Done</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
