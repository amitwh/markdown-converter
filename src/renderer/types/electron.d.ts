export interface ElectronAPI {
  // App info
  getAppVersion: () => Promise<string>;

  // File operations
  openFile: () => Promise<{ canceled: boolean; filePaths: string[] }>;
  saveFile: (data: { path: string; content: string }) => Promise<void>;
  readFile: (path: string) => Promise<string>;
  setCurrentFile: (path: string | null) => void;

  // Export
  exportDocument: (format: string, options?: Record<string, any>) => Promise<void>;

  // Theme
  getTheme: () => void;
  onThemeChanged: (callback: (theme: string) => void) => () => void;

  // File events
  onFileOpened: (callback: (data: { path: string; content: string }) => void) => () => void;
  onFileNew: (callback: () => void) => () => void;
  onFileSave: (callback: () => void) => () => void;

  // Conversion status
  onConversionStatus: (callback: (message: string) => void) => () => void;
  onConversionComplete: (callback: (data: { format: string; outputPath: string }) => void) => () => void;

  // Dialogs
  showExportDialog: (format: string) => void;
  showBatchDialog: () => void;
  showUniversalConverterDialog: () => void;
  showTableGenerator: () => void;
  showPdfEditorDialog: () => void;
  showHeaderFooterDialog: () => void;
  showFieldPickerDialog: () => void;

  // Settings
  getSettings: (key: string) => Promise<any>;
  setSettings: (key: string, value: any) => Promise<void>;

  // Plugin settings
  getPluginSetting: (key: string) => Promise<any>;
  setPluginSetting: (key: string, value: any) => Promise<void>;

  // Sidebar
  toggleSidebar: () => void;
  toggleBottomPanel: () => void;

  // Print
  doPrint: (options?: any) => void;

  // PDF
  openPdfViewer: (filePath: string) => void;
  processPdfOperation: (data: any) => void;

  // Images
  selectFolder: () => Promise<string | null>;
  savePastedImage: (data: { base64: string; ext: string }) => Promise<{ relativePath: string } | null>;

  // Templates
  loadTemplate: (file: string) => Promise<string>;
  getSnippets: () => Promise<any[]>;
  saveSnippet: (snippet: any) => Promise<void>;
  deleteSnippet: (id: string) => Promise<void>;

  // Git
  gitStatus: () => Promise<any>;
  gitDiff: (file: string) => Promise<any>;
  gitStage: (files: string[]) => Promise<void>;
  gitCommit: (message: string) => Promise<void>;
  gitLog: () => Promise<any[]>;

  // Directory
  listDirectory: (dir: string) => Promise<any[] | null>;
  openFilePath: (path: string) => void;

  // Custom CSS
  selectCustomCSS: () => Promise<string | null>;
  loadCustomCSS: () => void;
  clearCustomCSS: () => void;

  // Generic invoke/on
  invoke: (channel: string, data?: any) => Promise<any>;
  on: (channel: string, callback: (...args: any[]) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
