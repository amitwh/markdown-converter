export interface MonospaceSettings {
  monospaceFont: 'jetbrains-mono' | 'fira-code';
  monospaceLigatures: boolean;
}

const DEFAULTS: MonospaceSettings = {
  monospaceFont: 'jetbrains-mono',
  monospaceLigatures: false,
};

const FAMILY_CLASSES = ['mono-jetbrains-mono', 'mono-fira-code'];
const LIG_CLASSES = ['mono-ligatures-on', 'mono-ligatures-off'];

function stripMonospaceClasses(): void {
  for (const c of [...FAMILY_CLASSES, ...LIG_CLASSES]) {
    document.body.classList.remove(c);
  }
}

export function applyMonospaceClasses(input: Partial<MonospaceSettings> | null | undefined): MonospaceSettings {
  const safe: MonospaceSettings = {
    monospaceFont:
      input && input.monospaceFont === 'fira-code' ? 'fira-code' : DEFAULTS.monospaceFont,
    monospaceLigatures: !!(input && input.monospaceLigatures === true),
  };
  stripMonospaceClasses();
  document.body.classList.add(`mono-${safe.monospaceFont}`);
  document.body.classList.add(`mono-ligatures-${safe.monospaceLigatures ? 'on' : 'off'}`);
  return safe;
}

export function useMonospaceClasses(): void {
  if (typeof window === 'undefined') return;
  const api = (window as unknown as { electronAPI?: { monospace?: { getSettings?: () => Promise<MonospaceSettings> } } })
    .electronAPI;
  if (!api || !api.monospace || typeof api.monospace.getSettings !== 'function') return;
  api.monospace
    .getSettings()
    .then(applyMonospaceClasses)
    .catch(() => applyMonospaceClasses(null));
}
