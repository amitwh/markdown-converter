import { useUpdaterStore } from '@/lib/updater-store';
import { useSettingsStore } from '@/stores/settings-store';
import { Button } from '@/components/ui/button';

export function UpdatesSettings() {
  const updateChannel = useSettingsStore((s) => s.updateChannel);
  const setSetting = useSettingsStore((s) => s.setSetting);
  const autoCheck = useSettingsStore((s) => s.autoCheckUpdates);
  const { check, state } = useUpdaterStore();

  return (
    <div className="space-y-4" data-testid="updates-settings">
      <div>
        <h3 className="font-medium mb-2">Update channel</h3>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="update-channel"
              checked={updateChannel === 'github'}
              onChange={() => setSetting('updateChannel', 'github')}
            />
            <span>GitHub Releases (public)</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="update-channel"
              checked={updateChannel === 'concreteinfo'}
              onChange={() => setSetting('updateChannel', 'concreteinfo')}
            />
            <span>ConcreteInfo self-hosted</span>
          </label>
        </div>
      </div>

      <div>
        <h3 className="font-medium mb-2">Auto-check on launch</h3>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={autoCheck}
            onChange={(e) => setSetting('autoCheckUpdates', e.target.checked)}
          />
          <span>Check for updates 5s after launch</span>
        </label>
      </div>

      <div>
        <h3 className="font-medium mb-2">Manual check</h3>
        <Button
          onClick={() => check()}
          disabled={state === 'checking' || state === 'downloading'}
          data-testid="check-now"
        >
          {state === 'checking' ? 'Checking…' : 'Check now'}
        </Button>
      </div>
    </div>
  );
}