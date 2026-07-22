export interface ElectronAPI {
  getAppVersion: () => Promise<string>;

  send: (channel: string, data?: unknown) => void;
  invoke: (channel: string, data?: unknown) => Promise<unknown>;
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
  once: (channel: string, callback: (...args: unknown[]) => void) => void;
  removeAllListeners: (channel: string) => void;

  file: {
    save: (filePath: string, content: string) => void;
    saveCurrent: (content: string) => void;
    setCurrent: (filePath: string) => void;
    saveRecent: (recentFiles: string[]) => void;
    clearRecent: () => void;
    rendererReady: () => void;
    read: (filePath: string) => Promise<string>;
    write: (filePath: string, content: string) => Promise<{ path: string }>;
    delete: (filePath: string) => Promise<boolean>;
    ensureDir: (dirPath: string) => Promise<string>;
    exists: (filePath: string) => Promise<boolean>;
    isDirectory: (filePath: string) => Promise<boolean>;
    copy: (source: string, destination: string) => Promise<{ source: string; destination: string }>;
    move: (source: string, destination: string) => Promise<{ source: string; destination: string }>;
    list: (dirPath: string) => Promise<unknown>;
    pickFolder: () => Promise<string | null>;
    pickFile: () => Promise<string | null>;
    search: (args: {
      rootPath: string;
      query: string;
      isRegex: boolean;
      caseSensitive: boolean;
    }) => Promise<Array<{ filePath: string; line: number; content: string }>>;
  };

  theme: {
    get: () => void;
  };

  print: {
    doPrint: (options?: unknown) => void;
    show: (payload?: unknown) => void;
  };

  export: {
    withOptions: (format: string, options?: unknown) => void;
    spreadsheet: (content: string, format: string) => void;
  };

  batch: {
    convert: (inputFolder: string, outputFolder: string, format: string, options?: unknown) => void;
    selectFolder: (type?: string) => void;
  };

  converter: {
    convert: (tool: string, fromFormat: string, toFormat: string, filePath: string) => void;
    convertBatch: (
      tool: string,
      fromFormat: string,
      toFormat: string,
      inputFolder: string,
      outputFolder: string
    ) => void;
  };

  headerFooter: {
    getSettings: () => void;
    saveSettings: (settings: unknown) => void;
    browseLogo: (position?: string) => void;
    saveLogo: (position: string, filePath: string) => void;
    clearLogo: (position?: string) => void;
  };

  page: {
    getSettings: () => void;
    updateSettings: (settings: unknown) => void;
    setCustomStartPage: (pageNumber: number) => void;
  };

  pdf: {
    processOperation: (data: unknown) => void;
    getPageCount: (filePath: string) => void;
    selectFolder: (inputId?: string) => void;
  };

  image: {
    convert: (data: unknown) => void;
    batchConvert: (data: unknown) => void;
    resize: (data: unknown) => void;
    compress: (data: unknown) => void;
    rotate: (data: unknown) => void;
  };

  audio: {
    convert: (data: unknown) => void;
    batchConvert: (data: unknown) => void;
    extract: (data: unknown) => void;
    trim: (data: unknown) => void;
    merge: (data: unknown) => void;
  };

  video: {
    convert: (data: unknown) => void;
    batchConvert: (data: unknown) => void;
    compress: (data: unknown) => void;
    trim: (data: unknown) => void;
    extractFrames: (data: unknown) => void;
    toGif: (data: unknown) => void;
  };

  git: {
    status: (rootPath?: string) => Promise<unknown>;
    stage: (args: { rootPath?: string; files: string[] }) => Promise<unknown>;
    commit: (args: { rootPath?: string; message: string }) => Promise<unknown>;
    log: (rootPath?: string) => Promise<unknown>;
    diff: (filePath: string) => Promise<unknown>;
  };

  app: {
    quit: () => void;
    openExternal: (url: string) => void;
    showSaveDialog: (args?: { title?: string; defaultPath?: string }) => Promise<unknown>;
  };

  updater: {
    check: () => Promise<unknown>;
    install: () => Promise<unknown>;
    getState: () => Promise<unknown>;
    onStatus: (cb: (payload: unknown) => void) => () => void;
  };

  crash: {
    read: () => Promise<unknown>;
    openDir: () => void;
    delete: (filename: string) => Promise<unknown>;
  };

  monospace: {
    getSettings: () => Promise<{
      monospaceFont: 'jetbrains-mono' | 'fira-code';
      monospaceLigatures: boolean;
    }>;
    saveSettings: (partial: {
      monospaceFont?: 'jetbrains-mono' | 'fira-code';
      monospaceLigatures?: boolean;
    }) => Promise<{
      monospaceFont: 'jetbrains-mono' | 'fira-code';
      monospaceLigatures: boolean;
    }>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
