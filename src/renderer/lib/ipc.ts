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
    })
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
    // NOTE: file.open was previously miswired to pickFile — removed.
    // Callers needing a file picker should use ipc.file.pickFile() directly.
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
      if (typeof window === 'undefined' || !window.electronAPI?.on) {
        return () => {};
      }
      return window.electronAPI.on('list-directory', cb as (...a: unknown[]) => void);
    },
    search: (args: {
      rootPath: string;
      query: string;
      isRegex: boolean;
      caseSensitive: boolean;
    }): Promise<
      IpcResult<Array<{ filePath: string; line: number; content: string }> | ChannelMissing>
    > => safeCall('file', 'search', args),
    gitStatus: (args: {
      rootPath: string;
    }): Promise<
      IpcResult<
        | Array<{ filePath: string; status: 'modified' | 'added' | 'deleted' | 'untracked' }>
        | ChannelMissing
      >
    > => safeCall('git', 'status', args.rootPath),
    writeBuffer: (args: {
      path: string;
      buffer: Uint8Array;
    }): Promise<IpcResult<void | ChannelMissing>> => safeCall('file', 'writeBuffer', args.path, args.buffer),
    readBuffer: (
      path: string
    ): Promise<IpcResult<{ ok: boolean; data: Uint8Array } | ChannelMissing>> =>
      safeCall('file', 'readBuffer', path),
    gitStage: (args: {
      rootPath: string;
      files: string[];
    }): Promise<IpcResult<void | ChannelMissing>> => safeCall('git', 'stage', args),
    gitCommit: (args: {
      rootPath: string;
      message: string;
    }): Promise<IpcResult<void | ChannelMissing>> => safeCall('git', 'commit', args),
    setCurrent: (path: string | null): void => {
      if (typeof window !== 'undefined' && window.electronAPI?.file?.setCurrent) {
        window.electronAPI.file.setCurrent(path);
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
      wrap(() =>
        window.electronAPI!.invoke('export-with-options', { format: 'pdf', options: opts })
      ),
    docx: (opts: DocxOptions): Promise<IpcResult<ExportResult | ChannelMissing>> =>
      wrap(() =>
        window.electronAPI!.invoke('export-with-options', { format: 'docx', options: opts })
      ),
    html: (opts: HtmlOptions): Promise<IpcResult<ExportResult | ChannelMissing>> =>
      wrap(() =>
        window.electronAPI!.invoke('export-with-options', { format: 'html', options: opts })
      ),
    batch: (
      items: BatchItem[],
      opts: BatchOptions
    ): Promise<IpcResult<BatchResult | ChannelMissing>> =>
      wrap(() => window.electronAPI!.invoke('batch-convert', { items, options: opts })),
  },
  app: {
    getVersion: (): Promise<IpcResult<string | ChannelMissing>> =>
      wrap(() => window.electronAPI!.getAppVersion()),
    openExternal: (url: string): Promise<IpcResult<void | ChannelMissing>> =>
      wrap(() => window.electronAPI!.send('app:open-external', url)),
    showItemInFolder: (path: string): Promise<IpcResult<void | ChannelMissing>> =>
      wrap(() => window.electronAPI!.invoke('app:show-item-in-folder', { path })),
    showSaveDialog: (args?: {
      title?: string;
      defaultPath?: string;
    }): Promise<IpcResult<string | null | ChannelMissing>> =>
      safeCall('app', 'showSaveDialog', args),
  },
  menu: {
    on: (channel: string, callback: (...args: unknown[]) => void): (() => void) => {
      if (typeof window === 'undefined' || !window.electronAPI?.on) {
        return () => {};
      }
      return window.electronAPI.on(channel, callback as (...a: unknown[]) => void);
    },
  },
  updater: {
    check: (): Promise<IpcResult<void | ChannelMissing>> => safeCall('updater', 'check'),
    install: (): Promise<IpcResult<void | ChannelMissing>> => safeCall('updater', 'install'),
    getState: (): Promise<IpcResult<unknown | ChannelMissing>> => safeCall('updater', 'getState'),
    onStatus: (cb: (payload: unknown) => void): (() => void) => {
      if (typeof window === 'undefined' || !window.electronAPI?.updater?.onStatus) {
        return () => {};
      }
      return window.electronAPI.updater.onStatus(cb);
    },
  },
  crash: {
    read: (): Promise<IpcResult<unknown | ChannelMissing>> => safeCall('crash', 'read'),
    openDir: (): Promise<IpcResult<void | ChannelMissing>> => safeCall('crash', 'openDir'),
    delete: (filename: string): Promise<IpcResult<void | ChannelMissing>> =>
      safeCall('crash', 'delete', filename),
  },
};
