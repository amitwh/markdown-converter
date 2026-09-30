/**
 * @jest-environment jsdom
 *
 * Inline AI assist controller — DOM + IPC + editor integration.
 *
 * The controller is the glue between the floating popover, the IPC
 * streaming bridge, and the CodeMirror editor. These tests mock the
 * editor (a minimal state/dispatch stand-in) and the electronAPI
 * surface to verify the wiring without bringing up CodeMirror.
 */

const { createInlineAiController } = require('../src/renderer/inline-ai-controller');

// --- Minimal CodeMirror stand-in ---------------------------------------

function makeEditor(initialContent = '') {
  const doc = { text: initialContent, length: initialContent.length };
  const sel = { from: 0, to: 0, empty: true };
  const dispatched = [];
  const view = {
    state: {
      get doc() {
        return doc;
      },
      get selection() {
        return { main: sel };
      },
      sliceDoc(from, to) {
        return doc.text.slice(from, to);
      },
    },
    dispatch(tr) {
      dispatched.push(tr);
      if (tr.changes) {
        const { from, to, insert } = tr.changes;
        doc.text = doc.text.slice(0, from) + insert + doc.text.slice(to);
        doc.length = doc.text.length;
        const anchor = tr.selection ? tr.selection.anchor : from + insert.length;
        sel.from = anchor;
        sel.to = anchor;
        sel.anchor = anchor;
        sel.head = anchor;
        sel.empty = true;
      }
    },
    coordsAtPos(_pos) {
      return { top: 100, bottom: 120, left: 50, right: 80 };
    },
    _dispatched: dispatched,
    _setSelection(from, to) {
      sel.from = from;
      sel.to = to;
      sel.empty = from === to;
    },
  };
  return view;
}

// --- Minimal electronAPI stand-in ---------------------------------------

function makeApi() {
  const listeners = { chunk: [], done: [], error: [] };
  const started = [];
  const cancelled = [];
  return {
    api: {
      aiAssist: {
        start: (requestId, request) => started.push({ requestId, request }),
        cancel: (requestId) => cancelled.push(requestId),
        onChunk: (cb) => listeners.chunk.push(cb),
        onDone: (cb) => listeners.done.push(cb),
        onError: (cb) => listeners.error.push(cb),
      },
      on: (channel, cb) => {
        if (channel === 'ai-assist-stream:chunk') listeners.chunk.push(cb);
        else if (channel === 'ai-assist-stream:done') listeners.done.push(cb);
        else if (channel === 'ai-assist-stream:error') listeners.error.push(cb);
        return () => {};
      },
    },
    _state: { listeners, started, cancelled },
  };
}

function fakeKeyEvent(init) {
  return Object.assign({ preventDefault: () => {}, stopPropagation: () => {} }, init);
}

function mount(opts = {}) {
  const editor = opts.editor || makeEditor(opts.content || '');
  const { api, _state } = makeApi();
  const electronAPI = Object.assign(opts.electronAPI || {}, api);
  const controller = createInlineAiController({
    getEditorView: () => editor,
    electronAPI,
  });
  return { controller, editor, electronAPI, _state };
}

afterEach(() => {
  document.querySelectorAll('.inline-ai-popover').forEach((el) => el.remove());
});

function getPopoverButton(action) {
  const popovers = document.querySelectorAll('.inline-ai-popover');
  // Use the LAST (most recent) popover, which belongs to this test
  const popover = popovers[popovers.length - 1];
  if (!popover) throw new Error('No popover mounted');
  return popover.querySelector(`button[data-action="${action}"]`);
}

function emit(state, type, payload) {
  for (const cb of state.listeners[type]) cb({}, payload);
}

describe('createInlineAiController — showForSelection', () => {
  test('returns false when no selection', () => {
    const { controller } = mount({ content: 'hello world' });
    expect(controller.showForSelection()).toBe(false);
  });

  test('returns false when selection is too large', () => {
    const editor = makeEditor('a'.repeat(9000));
    editor.state.selection.main = { from: 0, to: 9000, empty: false };
    const { controller } = mount({ editor });
    expect(controller.showForSelection()).toBe(false);
  });

  test('opens the popover when a valid selection exists', () => {
    const editor = makeEditor('hello world');
    editor._setSelection(0, 5);
    const { controller } = mount({ editor });
    expect(controller.showForSelection()).toBe(true);
    expect(document.querySelector('.inline-ai-popover')).not.toBeNull();
  });
});

describe('createInlineAiController — handleKey', () => {
  test('Cmd+K opens the popover for the current selection', () => {
    const editor = makeEditor('hello world');
    editor._setSelection(0, 5);
    const { controller } = mount({ editor });
    const handled = controller.handleKey(fakeKeyEvent({ key: 'k', metaKey: true }));
    expect(handled).toBe(true);
    expect(document.querySelector('.inline-ai-popover')).not.toBeNull();
  });

  test('Cmd+K with no selection is a no-op (returns false)', () => {
    const { controller } = mount({ content: '' });
    const handled = controller.handleKey(fakeKeyEvent({ key: 'k', metaKey: true }));
    expect(handled).toBe(false);
  });

  test('Esc while popover is open cancels and hides', () => {
    const editor = makeEditor('hello world');
    editor._setSelection(0, 5);
    const { controller } = mount({ editor });
    controller.showForSelection();
    const handled = controller.handleKey(fakeKeyEvent({ key: 'Escape' }));
    expect(handled).toBe(true);
    expect(document.querySelector('.inline-ai-popover.open')).toBeNull();
  });

  test('Esc when popover is closed does nothing', () => {
    const { controller } = mount();
    const handled = controller.handleKey(fakeKeyEvent({ key: 'Escape' }));
    expect(handled).toBe(false);
  });

  test('non-shortcut keys return false', () => {
    const { controller } = mount();
    expect(controller.handleKey(fakeKeyEvent({ key: 'a' }))).toBe(false);
  });
});

describe('createInlineAiController — streaming', () => {
  function setupWithSelection(content = 'the quick brown fox', from = 0, to = 19) {
    const editor = makeEditor(content);
    editor._setSelection(from, to);
    const m = mount({ editor });
    m.controller.showForSelection();
    return m;
  }

  test('clicking an action starts a stream and clears the selection', () => {
    const m = setupWithSelection();
    const rewriteBtn = getPopoverButton('rewrite');
    rewriteBtn.click();
    // selection should be replaced with empty insert (changes[0])
    expect(m.editor._dispatched[0].changes).toEqual({ from: 0, to: 19, insert: '' });
    // aiAssist.start should have been called
    expect(m._state.started).toHaveLength(1);
    expect(m._state.started[0].request.system).toMatch(/Rewrite/i);
    expect(m._state.started[0].request.messages[0].content).toBe('the quick brown fox');
  });

  test('chunks progressively replace the selection', () => {
    const m = setupWithSelection();
    getPopoverButton('rewrite').click();
    const requestId = m._state.started[0].requestId;

    emit(m._state, 'chunk', { requestId, chunk: 'A ' });
    emit(m._state, 'chunk', { requestId, chunk: 'faster ' });
    emit(m._state, 'chunk', { requestId, chunk: 'fox' });

    // The most recent dispatch should contain the accumulated text
    const last = m.editor._dispatched[m.editor._dispatched.length - 1];
    expect(last.changes.insert).toBe('A faster fox');
  });

  test('done event finalizes and hides the popover', () => {
    const m = setupWithSelection();
    getPopoverButton('rewrite').click();
    const requestId = m._state.started[0].requestId;

    emit(m._state, 'chunk', { requestId, chunk: 'final text' });
    emit(m._state, 'done', { requestId });

    expect(document.querySelector('.inline-ai-popover.open')).toBeNull();
    // editor text should now contain 'final text'
    expect(m.editor.state.doc.text).toContain('final text');
  });

  test('error event restores the original selection', () => {
    const m = setupWithSelection('original text');
    getPopoverButton('rewrite').click();
    const requestId = m._state.started[0].requestId;

    emit(m._state, 'chunk', { requestId, chunk: 'partial' });
    emit(m._state, 'error', { requestId, message: 'boom' });

    // popover should show error state
    const popover = document.querySelector('.inline-ai-popover');
    expect(popover.dataset.state).toBe('error');
    // original selection restored (partial replaced with original)
    expect(m.editor.state.doc.text).toContain('original text');
    expect(m.editor.state.doc.text).not.toContain('partial');
  });

  test('stale events for an old requestId are ignored', () => {
    const m = setupWithSelection();
    getPopoverButton('rewrite').click();
    const requestId = m._state.started[0].requestId;

    // Emit a chunk for a different requestId
    emit(m._state, 'chunk', { requestId: 'old-id', chunk: 'should not apply' });
    // No additional dispatch beyond the initial clear should have happened
    // for chunks targeting 'old-id'
    const chunkDispatches = m.editor._dispatched.filter(
      (d) => d.changes && d.changes.insert === 'should not apply'
    );
    expect(chunkDispatches).toHaveLength(0);

    // Real chunk should still work
    emit(m._state, 'chunk', { requestId, chunk: 'real' });
    const last = m.editor._dispatched[m.editor._dispatched.length - 1];
    expect(last.changes.insert).toBe('real');
  });
});

describe('createInlineAiController — detach', () => {
  test('detach removes DOM and clears state', () => {
    const editor = makeEditor('hello world');
    editor._setSelection(0, 5);
    const { controller } = mount({ editor });
    controller.showForSelection();
    controller.detach();
    expect(document.querySelector('.inline-ai-popover')).toBeNull();
  });
});

describe('createInlineAiController — validation', () => {
  test('throws when getEditorView is missing', () => {
    expect(() =>
      createInlineAiController({
        electronAPI: { aiAssist: {} },
        getEditorView: undefined,
      })
    ).toThrow(/getEditorView/);
  });

  test('throws when electronAPI.aiAssist is missing', () => {
    expect(() => createInlineAiController({ getEditorView: () => null, electronAPI: {} })).toThrow(
      /aiAssist/
    );
  });
});
