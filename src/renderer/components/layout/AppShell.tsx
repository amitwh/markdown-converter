import { AppHeader } from './AppHeader';
import { TabBar } from './TabBar';
import { Toolbar } from './Toolbar';
import { Breadcrumb } from './Breadcrumb';
import { StatusBar } from './StatusBar';
import { EditorPane } from '@/components/editor/EditorPane';
import { PreviewPane } from '@/components/preview/PreviewPane';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { useAppStore } from '@/stores/app-store';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { useFileShortcuts } from '@/hooks/use-file-shortcuts';
import { useRestoreLastFolder } from '@/hooks/use-restore-last-folder';
import { useRegisterMenuCommands, useBridgeNativeMenu } from '@/lib/commands/register-menu-commands';
import { useZenMode } from '@/hooks/use-zen-mode';

export function AppShell() {
  useFileShortcuts();
  useRestoreLastFolder();
  useRegisterMenuCommands();
  useBridgeNativeMenu();
  useZenMode();
  const { sidebarVisible, previewVisible, paneSizes, setPaneSizes } = useAppStore();
  const zenMode = useAppStore((s) => s.zenMode);

  if (zenMode) {
    return (
      <main className="h-screen w-screen overflow-hidden bg-background">
        <ResizablePanelGroup
          direction="horizontal"
          onLayout={(sizes) => setPaneSizes({ sidebar: 0, editor: sizes[0], preview: sizes[1] })}
        >
          <ResizablePanel defaultSize={previewVisible ? 50 : 100} minSize={20}>
            <section className="h-full bg-background">
              <EditorPane />
            </section>
          </ResizablePanel>
          {previewVisible && (
            <>
              <ResizableHandle />
              <ResizablePanel defaultSize={50} minSize={20}>
                <section className="h-full border-l border-border bg-card/10">
                  <PreviewPane />
                </section>
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </main>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <AppHeader />
      <TabBar />
      <Toolbar />
      <Breadcrumb />
      <main className="flex-1 overflow-hidden">
        <ResizablePanelGroup
          direction="horizontal"
          onLayout={(sizes) => setPaneSizes({ sidebar: sizes[0], editor: sizes[1], preview: sizes[2] })}
        >
          {sidebarVisible && (
            <>
              <ResizablePanel defaultSize={paneSizes.sidebar} minSize={15} maxSize={40}>
                <aside className="h-full border-r border-border bg-card/10 p-3 text-sm text-muted-foreground">
                  <Sidebar />
                </aside>
              </ResizablePanel>
              <ResizableHandle />
            </>
          )}
          <ResizablePanel defaultSize={previewVisible ? paneSizes.editor : 100} minSize={20}>
            <EditorPane />
          </ResizablePanel>
          {previewVisible && (
            <>
              <ResizableHandle />
              <ResizablePanel defaultSize={paneSizes.preview} minSize={20}>
                <PreviewPane />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </main>
      <StatusBar />
    </div>
  );
}