import { useSettingsStore } from '@/stores/settings-store';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

export function EditorSettings() {
  const { fontSize, tabSize, lineNumbers, wordWrap, minimap, setSetting } = useSettingsStore();

  return (
    <div className="space-y-5 text-sm">
      <div>
        <Label htmlFor="editor-font-size">Font size: {fontSize}px</Label>
        <Slider
          id="editor-font-size"
          min={10}
          max={24}
          step={1}
          value={[fontSize]}
          onValueChange={([v]) => setSetting('fontSize', v)}
        />
      </div>
      <div>
        <Label htmlFor="editor-tab-size">Tab size</Label>
        <Select
          value={String(tabSize)}
          onValueChange={(v) => setSetting('tabSize', Number(v) as 2 | 4 | 8)}
        >
          <SelectTrigger id="editor-tab-size" aria-label="Tab size">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="2">2 spaces</SelectItem>
            <SelectItem value="4">4 spaces</SelectItem>
            <SelectItem value="8">8 spaces</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <label className="flex items-center justify-between">
        <span>Line numbers</span>
        <Switch
          checked={lineNumbers}
          onCheckedChange={(c) => setSetting('lineNumbers', c)}
          aria-label="Line numbers"
        />
      </label>
      <label className="flex items-center justify-between">
        <span>Word wrap</span>
        <Switch
          checked={wordWrap}
          onCheckedChange={(c) => setSetting('wordWrap', c)}
          aria-label="Word wrap"
        />
      </label>
      <label className="flex items-center justify-between">
        <span>Minimap</span>
        <Switch
          checked={minimap}
          onCheckedChange={(c) => setSetting('minimap', c)}
          aria-label="Minimap"
        />
      </label>
    </div>
  );
}
