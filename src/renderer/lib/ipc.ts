import type {
  IpcResult,
  FileResult,
  FileEntry,
  PdfOptions,
  DocxOptions,
  HtmlOptions,
  ExportResult,
  BatchItem,
  BatchOptions,
  BatchResult,
} from '@/types/ipc';

type ChannelMissing = { code: 'CHANNEL_MISSING'; message: string };

function wrap<T>(fn: () => Promise<T>): Promise<IpcResult<T | ChannelMissing>> {
  if (typeof window === 'undefined' || !window.electronAPI) {
    return Promise.resolve({
      ok: false,
      error: { code: 'NO_BRIDGE', message: 'window.electronAPI is unavailable' },
    });
  }
  return fn().then(
    (data) => ({ ok: true as const, data }),
    (err: Error) => ({
      ok: false as const,
      error: { code: err.name || 'IPC_ERROR', message: err.message || String(err) },
    }),
  );
}

function safeCall<T extends (...args: any[]) => Promise<any>>(
  channel: string,
  method: string,
  ...args: Parameters<T>
): Promise<IpcResult<Awaited<ReturnType<T>> | ChannelMissing>> {
  if (typeof window === 'undefined' || !window.electronAPI) {
    return Promise.resolve({
      ok: false,
      error: { code: 'NO_BRIDGE', message: 'window.electronAPI is unavailable' },
    });
  }
  const target = (window.electronAPI as any)[channel]?.[method];
  if (!target) {
    return Promise.resolve({
      ok: false,
      error: { code: 'CHANNEL_MISSING', message: `Missing channel: ${channel}.${method}` },
    });
  }
  if (typeof target !== 'function') {
    return Promise.resolve({
      ok: false,
      error: { code: 'CHANNEL_MISSING', message: `Not a function: ${channel}.${method}` },
    });
  }
  return wrap(() => target(...args));
}

export const ipc = {
  file: {
    open: (): Promise<IpcResult<FileResult | ChannelMissing>> =>
      safeCall('file', 'open'),
    read: (path: string): Promise<IpcResult<string | ChannelMissing>> =>
      safeCall('file', 'read', path),
    write: (path: string, content: string): Promise<IpcResult<void | ChannelMissing>> =>
      safeCall('file', 'write', path, content),
    list: (dir: string): Promise<IpcResult<FileEntry[] | ChannelMissing>> =>
      safeCall('file', 'list', dir),
    pickFolder: (): Promise<IpcResult<string | null | ChannelMissing>> =>
      safeCall('file', 'pickFolder'),
    pickFile: (): Promise<IpcResult<string | null | ChannelMissing>> =>
      safeCall('file', 'pickFile'),
    onChange: (cb: (path: string) => void): (() => void) => {
      if (typeof window === 'undefined' || !window.electronAPI?.file?.onChange) {
        return () => {};
      }
      return window.electronAPI.file.onChange(cb);
    },
    search: (args: { rootPath: string; query: string; isRegex: boolean; caseSensitive: boolean }): Promise<IpcResult<Array<{ filePath: string; line: number; content: string }> | ChannelMissing>> =>
      safeCall('file', 'search', args),
    gitStatus: (args: { rootPath: string }): Promise<IpcResult<Array<{ filePath: string; status: 'modified' | 'added' | 'deleted' | 'untracked' }> | ChannelMissing>> =>
      safeCall('file', 'gitStatus', args),
    writeBuffer: (args: { path: string; buffer: Uint8Array }): Promise<IpcResult<void | ChannelMissing>> =>
      safeCall('file', 'writeBuffer', args),
    setCurrent: (path: string | null): void => {
      if (typeof window !== 'undefined' && (window.electronAPI as any)?.file?.setCurrent) {
        (window.electronAPI as any).file.setCurrent(path);
      }
    },
  },
  print: {
    show: (args: { html: string }): Promise<IpcResult<void | ChannelMissing>> =>
      safeCall('print', 'show', args),
    doPrint: (args: { withStyles?: boolean }): Promise<IpcResult<void | ChannelMissing>> =>
      safeCall('print', 'doPrint', args),
  },
  export: {
    pdf: (opts: PdfOptions): Promise<IpcResult<ExportResult | ChannelMissing>> =>
      safeCall('export', 'pdf', opts),
    docx: (opts: DocxOptions): Promise<IpcResult<ExportResult | ChannelMissing>> =>
      safeCall('export', 'docx', opts),
    html: (opts: HtmlOptions): Promise<IpcResult<ExportResult | ChannelMissing>> =>
      safeCall('export', 'html', opts),
    batch: (items: BatchItem[], opts: BatchOptions): Promise<IpcResult<BatchResult | ChannelMissing>> =>
      safeCall('export', 'batch', items, opts),
  },
  app: {
    getVersion: (): Promise<IpcResult<string | ChannelMissing>> =>
      safeCall('app', 'getVersion'),
    openExternal: (url: string): Promise<IpcResult<void | ChannelMissing>> =>
      safeCall('app', 'openExternal', url),
    showItemInFolder: (path: string): Promise<IpcResult<void | ChannelMissing>> =>
      safeCall('app', 'showItemInFolder', path),
    showSaveDialog: (args?: { title?: string; defaultPath?: string }): Promise<IpcResult<string | null | ChannelMissing>> =>
      safeCall('app', 'showSaveDialog', args),
  },
  menu: {
    /**
     * Subscribe to a native-menu IPC channel. The callback receives the
     * raw payload(s) from the main process. Returns an unsubscribe fn.
     */
    on: (channel: string, callback: (...args: unknown[]) => void): (() => void) => {
      if (typeof window === 'undefined' || !window.electronAPI?.on) {
        return () => {};
      }
      return window.electronAPI.on(channel, callback as (...a: any[]) => void);
    },
  },
  updater: {
    check: (): Promise<IpcResult<void | ChannelMissing>> =>
      safeCall('updater', 'check'),
    install: (): Promise<IpcResult<void | ChannelMissing>> =>
      safeCall('updater', 'install'),
    getState: (): Promise<IpcResult<unknown | ChannelMissing>> =>
      safeCall('updater', 'getState'),
    onStatus: (cb: (payload: unknown) => void): (() => void) => {
      if (typeof window === 'undefined' || !window.electronAPI?.updater?.onStatus) {
        return () => {};
      }
      return window.electronAPI.updater.onStatus(cb);
    },
  },
  crash: {
    read: (): Promise<IpcResult<unknown | ChannelMissing>> =>
      safeCall('crash', 'read'),
    openDir: (): Promise<IpcResult<void | ChannelMissing>> =>
      safeCall('crash', 'openDir'),
    delete: (filename: string): Promise<IpcResult<void | ChannelMissing>> =>
      safeCall('crash', 'delete', filename),
  },
};