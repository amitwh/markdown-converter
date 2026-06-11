import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '@/stores/editor-store';

describe('useEditorStore', () => {
  beforeEach(() => {
    useEditorStore.setState({ buffers: new Map(), activeId: null });
  });

  it('creates a new buffer with the given content', () => {
    useEditorStore.getState().openBuffer('file-1', '/foo.md', '# hello');
    const buf = useEditorStore.getState().buffers.get('file-1');
    expect(buf?.content).toBe('# hello');
    expect(buf?.path).toBe('/foo.md');
  });

  it('updates content and marks dirty', () => {
    useEditorStore.getState().openBuffer('file-1', '/foo.md', '');
    useEditorStore.getState().updateContent('file-1', 'new content');
    const buf = useEditorStore.getState().buffers.get('file-1');
    expect(buf?.content).toBe('new content');
    expect(buf?.dirty).toBe(true);
  });

  it('marks a buffer clean after save', () => {
    useEditorStore.getState().openBuffer('file-1', '/foo.md', '');
    useEditorStore.getState().updateContent('file-1', 'x');
    useEditorStore.getState().markSaved('file-1');
    expect(useEditorStore.getState().buffers.get('file-1')?.dirty).toBe(false);
  });

  it('closes a buffer and removes it', () => {
    useEditorStore.getState().openBuffer('file-1', '/foo.md', '');
    useEditorStore.getState().closeBuffer('file-1');
    expect(useEditorStore.getState().buffers.has('file-1')).toBe(false);
  });

  it('renames a buffer', () => {
    useEditorStore.getState().openBuffer('file-1', '/foo.md', 'some content');
    useEditorStore.getState().renameBuffer('file-1', 'file-2', '/bar.md');
    const oldBuf = useEditorStore.getState().buffers.get('file-1');
    const newBuf = useEditorStore.getState().buffers.get('file-2');
    expect(oldBuf).toBeUndefined();
    expect(newBuf?.content).toBe('some content');
    expect(newBuf?.path).toBe('/bar.md');
    expect(useEditorStore.getState().activeId).toBe('file-2');
  });
});
