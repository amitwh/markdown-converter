import { useEffect } from 'react';
import { ipc } from '@/lib/ipc';
import { useCommandStore } from '@/stores/command-store';
import type { CommandId } from '@/stores/command-store';

type Transform<Args = unknown> = (...payload: unknown[]) => Args;

/**
 * Bridge a native-menu IPC channel to a command-store dispatch.
 *
 * When the main process sends `channel` (e.g. `'file-save'`), the optional
 * `transform` converts the payload to the command's args, then the command
 * `commandId` is dispatched through the command store.
 *
 * The hook cleans up its IPC subscription on unmount.
 */
export function useMenuAction<Args = unknown>(
  channel: string,
  commandId: CommandId,
  transform?: Transform<Args>
): void {
  useEffect(() => {
    const unsubscribe = ipc.menu.on(channel, (...payload: unknown[]) => {
      const args = transform ? transform(...payload) : (payload[0] as Args);
      useCommandStore.getState().dispatch(commandId, args);
    });
    return unsubscribe;
  }, [channel, commandId, transform]);
}
