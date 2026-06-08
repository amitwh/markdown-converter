import { useSettingsStore } from '@/stores/settings-store';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function ThemeSettings() {
  const { theme, accentColor, fontFamily, setSetting } = useSettingsStore();

  return (
    <div className="space-y-5 text-sm">
      <div>
        <Label>Mode</Label>
        <RadioGroup value={theme} onValueChange={(v) => setSetting('theme', v as 'light' | 'dark' | 'system')}>
          <div className="flex items-center gap-2"><RadioGroupItem value="light" id="theme-light" /><Label htmlFor="theme-light">Light</Label></div>
          <div className="flex items-center gap-2"><RadioGroupItem value="dark" id="theme-dark" /><Label htmlFor="theme-dark">Dark</Label></div>
          <div className="flex items-center gap-2"><RadioGroupItem value="system" id="theme-system" /><Label htmlFor="theme-system">System</Label></div>
        </RadioGroup>
      </div>
      <div>
        <Label htmlFor="theme-accent">Accent color</Label>
        <Select value={accentColor} onValueChange={(v) => setSetting('accentColor', v as any)}>
          <SelectTrigger id="theme-accent" aria-label="Accent color"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="brand">Brand (orange)</SelectItem>
            <SelectItem value="blue">Blue</SelectItem>
            <SelectItem value="green">Green</SelectItem>
            <SelectItem value="purple">Purple</SelectItem>
            <SelectItem value="orange">Orange</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="theme-font-family">Editor font</Label>
        <Select value={fontFamily} onValueChange={(v) => setSetting('fontFamily', v as any)}>
          <SelectTrigger id="theme-font-family" aria-label="Editor font"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="system">System (Plus Jakarta Sans)</SelectItem>
            <SelectItem value="jetbrains">JetBrains Mono</SelectItem>
            <SelectItem value="fira">Fira Code</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}