import React from 'react';
import { AppHeader } from './components/layout/AppHeader';
import { TabBar } from './components/layout/TabBar';
import { Toolbar } from './components/layout/Toolbar';
import { Breadcrumb } from './components/layout/Breadcrumb';
import { Sidebar } from './components/sidebar/Sidebar';
import { EditorPane } from './components/editor/EditorPane';
import { PreviewPane } from './components/preview/PreviewPane';
import { StatusBar } from './components/layout/StatusBar';
import { CommandPalette } from './components/modals/CommandPalette';
import { ExportDialog } from './components/modals/ExportDialog';
import { SettingsDialog } from './components/modals/SettingsDialog';
import { useAppStore } from './stores/appStore';

function App() {
  const { sidebarVisible, previewVisible, activeTabId } = useAppStore();

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <AppHeader />
      <TabBar />
      <Toolbar />
      <Breadcrumb />

      <main className="flex flex-1 overflow-hidden">
        {sidebarVisible && <Sidebar />}

        <div className="flex flex-1 overflow-hidden">
          <EditorPane className={previewVisible ? 'flex-1' : 'flex-1'} />
          {previewVisible && (
            <>
              <div className="w-px bg-border cursor-col-resize hover:bg-brand transition-colors" />
              <PreviewPane className="flex-1" />
            </>
          )}
        </div>
      </main>

      <StatusBar />
      <CommandPalette />
      <ExportDialog />
      <SettingsDialog />
    </div>
  );
}

export default App;
