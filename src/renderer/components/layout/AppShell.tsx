import { AppHeader } from './AppHeader';
import { TabBar } from './TabBar';
import { Toolbar } from './Toolbar';
import { Breadcrumb } from './Breadcrumb';
import { StatusBar } from './StatusBar';
import { useAppStore } from '@/stores/app-store';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';

export function AppShell() {
  const { sidebarVisible, previewVisible, paneSizes, setPaneSizes } = useAppStore();

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
                  File tree placeholder
                </aside>
              </ResizablePanel>
              <ResizableHandle />
            </>
          )}
          <ResizablePanel defaultSize={previewVisible ? paneSizes.editor : 100} minSize={20}>
            <section className="h-full bg-background p-4 text-sm text-muted-foreground">
              Editor placeholder
            </section>
          </ResizablePanel>
          {previewVisible && (
            <>
              <ResizableHandle />
              <ResizablePanel defaultSize={paneSizes.preview} minSize={20}>
                <section className="h-full border-l border-border bg-card/10 p-4 text-sm text-muted-foreground">
                  Preview placeholder
                </section>
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </main>
      <StatusBar />
    </div>
  );
}