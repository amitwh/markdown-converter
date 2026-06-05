import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/stores/app-store';
import { useSettingsStore } from '@/stores/settings-store';
import { EditorSettings } from './EditorSettings';
import { ThemeSettings } from './ThemeSettings';
import { ExportSettings } from './ExportSettings';
import { PluginsSettings } from './PluginsSettings';
import { AboutSettings } from './AboutSettings';

export function SettingsSheet() {
  const closeModal = useAppStore((s) => s.closeModal);
  const resetToDefaults = useSettingsStore((s) => s.resetToDefaults);

  return (
    <Sheet open onOpenChange={(o) => !o && closeModal()}>
      <SheetContent aria-describedby="settings-desc" side="right" className="w-full sm:max-w-[480px]">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription id="settings-desc">Editor, theme, and export preferences</SheetDescription>
        </SheetHeader>
        <Tabs defaultValue="editor" className="mt-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="editor">Editor</TabsTrigger>
            <TabsTrigger value="theme">Theme</TabsTrigger>
            <TabsTrigger value="export">Export</TabsTrigger>
            <TabsTrigger value="plugins">Plugins</TabsTrigger>
            <TabsTrigger value="about">About</TabsTrigger>
          </TabsList>
          <div className="mt-4 max-h-[70vh] overflow-y-auto pr-2">
            <TabsContent value="editor"><EditorSettings /></TabsContent>
            <TabsContent value="theme"><ThemeSettings /></TabsContent>
            <TabsContent value="export"><ExportSettings /></TabsContent>
            <TabsContent value="plugins"><PluginsSettings /></TabsContent>
            <TabsContent value="about"><AboutSettings /></TabsContent>
          </div>
        </Tabs>
        <div className="mt-4 flex justify-end border-t border-border pt-4">
          <Button variant="ghost" onClick={resetToDefaults}>Reset to defaults</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}