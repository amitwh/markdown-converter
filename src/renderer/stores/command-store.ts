import { create } from 'zustand';

export type CommandId = string;

export type CommandHandler = (args?: unknown) => void | Promise<void>;

interface CommandState {
  handlers: Record<string, CommandHandler>;
  register: (id: CommandId, handler: CommandHandler) => void;
  registerMany: (handlers: Record<string, CommandHandler>) => void;
  unregister: (id: CommandId) => void;
  dispatch: (id: CommandId, args?: unknown) => void;
  get: (id: CommandId) => CommandHandler | undefined;
}

export const useCommandStore = create<CommandState>((set, get) => ({
  handlers: {},
  register: (id, handler) =>
    set((s) => ({ handlers: { ...s.handlers, [id]: handler } })),
  registerMany: (handlers) =>
    set((s) => ({ handlers: { ...s.handlers, ...handlers } })),
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
}));
