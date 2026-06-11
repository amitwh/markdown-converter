import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type CommandId = string;

export type CommandHandler = (args?: unknown) => void | Promise<void>;

/**
 * User-customizable key binding for a command.
 * Format: same as useShortcut combo ('mod+s', 'mod+shift+s', etc.)
 * Undefined means "use the default binding" (if any).
 */
export type UserBindings = Record<string, string>;

interface CommandState {
  handlers: Record<string, CommandHandler>;
  userBindings: UserBindings;
  register: (id: CommandId, handler: CommandHandler) => void;
  registerMany: (handlers: Record<string, CommandHandler>) => void;
  unregister: (id: CommandId) => void;
  dispatch: (id: CommandId, args?: unknown) => void;
  get: (id: CommandId) => CommandHandler | undefined;
  setUserBinding: (id: CommandId, combo: string) => void;
  clearUserBinding: (id: CommandId) => void;
  getUserBinding: (id: CommandId) => string | undefined;
}

export const useCommandStore = create<CommandState>()(
  persist(
    (set, get) => ({
      handlers: {},
      userBindings: {},
      register: (id, handler) => set((s) => ({ handlers: { ...s.handlers, [id]: handler } })),
      registerMany: (handlers) => set((s) => ({ handlers: { ...s.handlers, ...handlers } })),
      unregister: (id) =>
        set((s) => {
          const next = { ...s.handlers };
          delete next[id];
          return { handlers: next };
        }),
      dispatch: (id, args) => {
        const handler = get().handlers[id];
        if (handler) {
          void handler(args);
        }
      },
      get: (id) => get().handlers[id],
      setUserBinding: (id, combo) =>
        set((s) => ({ userBindings: { ...s.userBindings, [id]: combo } })),
      clearUserBinding: (id) =>
        set((s) => {
          const next = { ...s.userBindings };
          delete next[id];
          return { userBindings: next };
        }),
      getUserBinding: (id) => get().userBindings[id],
    }),
    {
      name: 'mc-command-store',
      // Only persist user-customizable bindings; handlers are runtime-only.
      partialize: (state) => ({ userBindings: state.userBindings }),
    }
  )
);
