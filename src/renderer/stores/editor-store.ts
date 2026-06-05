import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { enableMapSet } from 'immer';

enableMapSet();

export interface Buffer {
  id: string;
  path: string;
  content: string;
  dirty: boolean;
  cursor?: { line: number; column: number };
}

interface EditorState {
  buffers: Map<string, Buffer>;
  activeId: string | null;
  openBuffer: (id: string, path: string, content: string) => void;
  updateContent: (id: string, content: string) => void;
  markSaved: (id: string) => void;
  setCursor: (id: string, line: number, column: number) => void;
  closeBuffer: (id: string) => void;
  setActive: (id: string) => void;
}

export const useEditorStore = create<EditorState>()(
  immer((set) => ({
    buffers: new Map(),
    activeId: null,
    openBuffer: (id, path, content) =>
      set((s) => {
        s.buffers.set(id, { id, path, content, dirty: false });
        s.activeId = id;
      }),
    updateContent: (id, content) =>
      set((s) => {
        const buf = s.buffers.get(id);
        if (buf) {
          buf.content = content;
          buf.dirty = true;
        }
      }),
    markSaved: (id) =>
      set((s) => {
        const buf = s.buffers.get(id);
        if (buf) buf.dirty = false;
      }),
    setCursor: (id, line, column) =>
      set((s) => {
        const buf = s.buffers.get(id);
        if (buf) buf.cursor = { line, column };
      }),
    closeBuffer: (id) =>
      set((s) => {
        s.buffers.delete(id);
        if (s.activeId === id) s.activeId = null;
      }),
    setActive: (id) =>
      set((s) => {
        s.activeId = id;
      }),
  }))
);