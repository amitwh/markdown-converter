/**
 * @jest-environment jsdom
 *
 * Inline AI assist popover — DOM + interaction tests.
 *
 * Pure controller. Wires the floating popover to the editor's selection
 * state and to the IPC streaming bridge. Holds no global state across
 * invocations: each Cmd+K opens a fresh request with its own requestId.
 *
 * Public API:
 *   const ctl = createInlineAiController({ ... });
 *   ctl.attach()                            // registers Cmd+K keymap
 *   ctl.detach()                            // tears down
 *
 * Or call ctl.showForSelection() directly from a custom shortcut.
 *
 * @module inline-ai-controller
 */

const { createInlineAiPopover } = require('../ai-assist/inline-ai-popover');
const {
  buildAssistPrompt,
  applyAssistResult,
  MAX_SELECTION_CHARS,
} = require('../ai-assist/inline-assist');

/**
 * @param {object} deps
 * @param {() => any} deps.getEditorView - returns CodeMirror EditorView
 * @param {object} deps.electronAPI - window.electronAPI shape
 * @param {(key:string, e:Event) => boolean} [deps.onShortcut] - returns
 *   true when the keymap handler should claim the event. Used to keep
 *   Esc-cancel from firing when the popover isn't open.
 */
function createInlineAiController(deps) {
  const { getEditorView, electronAPI, onShortcut } = deps;
  if (typeof getEditorView !== 'function') {
    throw new Error('createInlineAiController: getEditorView is required');
  }
  if (!electronAPI || !electronAPI.aiAssist) {
    throw new Error('createInlineAiController: electronAPI.aiAssist is required');
  }

  let popover = null;
  let activeRequestId = null;
  let activeSelection = null; // { from, to, original }
  let activeAction = null; // 'rewrite' | 'shorten' | 'expand'
  let unsubscribers = []; // [{ off }]

  function ensurePopover() {
    if (popover) return popover;
    popover = createInlineAiPopover(document.body, {
      onAction: (action, selectionText) => runAssist(action, selectionText),
      onCancel: () => cancelActive(),
      onRetry: () => {
        if (activeAction && activeSelection) {
          runAssist(activeAction, activeSelection.original);
        }
      },
    });
    return popover;
  }

  function getSelectionFromView() {
    const view = getEditorView();
    if (!view) return null;
    const sel = view.state.selection.main;
    if (sel.empty) return null;
    const text = view.state.sliceDoc(sel.from, sel.to);
    return { from: sel.from, to: sel.to, original: text };
  }

  function rectForSelection(view, from, to) {
    const start = view.coordsAtPos(from);
    const end = view.coordsAtPos(to);
    if (!start || !end) return null;
    return {
      top: Math.min(start.top, end.top),
      bottom: Math.max(start.bottom, end.bottom),
      left: Math.min(start.left, end.left),
      width: Math.max(80, Math.abs(end.left - start.left)),
      right: Math.max(start.right, end.right),
    };
  }

  function showForSelection() {
    const view = getEditorView();
    if (!view) return false;
    const sel = getSelectionFromView();
    if (!sel) return false;
    if (sel.original.length === 0 || sel.original.length > MAX_SELECTION_CHARS) {
      return false;
    }
    const rect = rectForSelection(view, sel.from, sel.to);
    if (!rect) return false;

    cancelActive({ silent: true });
    activeSelection = sel;
    activeAction = null;
    ensurePopover().show({ text: sel.original, rect });
    return true;
  }

  async function runAssist(action, selectionText) {
    const view = getEditorView();
    if (!view) return;

    let prompt;
    try {
      prompt = buildAssistPrompt(action, selectionText);
    } catch (err) {
      ensurePopover().setState('error', { message: err.message || 'Invalid selection.' });
      return;
    }

    activeAction = action;
    ensurePopover().setState('loading');

    // Empty out the selection; the stream will fill it back in.
    const insertAt = activeSelection ? activeSelection.from : view.state.selection.main.from;
    view.dispatch({
      changes: { from: insertAt, to: activeSelection?.to ?? insertAt, insert: '' },
      selection: { anchor: insertAt },
    });

    const requestId = `assist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    activeRequestId = requestId;
    let accumulated = '';

    const offChunk = electronAPI.on('ai-assist-stream:chunk', (_e, payload) => {
      if (!payload || payload.requestId !== activeRequestId) return;
      accumulated += payload.chunk || '';
      view.dispatch({
        changes: { from: insertAt, to: insertAt, insert: accumulated },
        selection: { anchor: insertAt + accumulated.length },
      });
    });
    const offDone = electronAPI.on('ai-assist-stream:done', (_e, payload) => {
      if (!payload || payload.requestId !== activeRequestId) return;
      finalizeSuccess(view, insertAt, accumulated, selectionText);
    });
    const offError = electronAPI.on('ai-assist-stream:error', (_e, payload) => {
      if (!payload || payload.requestId !== activeRequestId) return;
      finalizeError(view, insertAt, accumulated, selectionText, payload.message);
    });
    unsubscribers.push(offChunk, offDone, offError);

    electronAPI.aiAssist.start(requestId, {
      system: prompt.system,
      messages: prompt.messages,
    });
  }

  function finalizeSuccess(view, insertAt, accumulated, selectionText) {
    const finalText = applyAssistResult(selectionText, accumulated);
    cleanupListeners();
    if (finalText === null) {
      // No-op (empty / unchanged) — restore the original selection
      view.dispatch({
        changes: { from: insertAt, to: insertAt + accumulated.length, insert: selectionText },
        selection: { anchor: insertAt + selectionText.length },
      });
    } else {
      view.dispatch({
        changes: { from: insertAt, to: insertAt + accumulated.length, insert: finalText },
        selection: { anchor: insertAt + finalText.length },
      });
    }
    ensurePopover().hide();
    activeRequestId = null;
    activeSelection = null;
    activeAction = null;
  }

  function finalizeError(view, insertAt, accumulated, selectionText, message) {
    cleanupListeners();
    // Restore the original selection on error
    if (accumulated.length > 0) {
      view.dispatch({
        changes: { from: insertAt, to: insertAt + accumulated.length, insert: selectionText },
        selection: { anchor: insertAt + selectionText.length },
      });
    }
    ensurePopover().setState('error', { message: message || 'AI request failed.' });
    activeRequestId = null;
  }

  function cancelActive({ silent = false } = {}) {
    if (activeRequestId) {
      electronAPI.aiAssist.cancel(activeRequestId);
    }
    cleanupListeners();
    const view = getEditorView();
    if (view && activeSelection) {
      // Restore the original if we cleared the selection
      const sel = view.state.selection.main;
      if (sel.empty) {
        view.dispatch({
          changes: { from: activeSelection.from, to: sel.anchor, insert: activeSelection.original },
          selection: { anchor: activeSelection.from + activeSelection.original.length },
        });
      }
    }
    if (popover && !silent) popover.hide();
    activeRequestId = null;
    activeSelection = null;
    activeAction = null;
  }

  function cleanupListeners() {
    for (const off of unsubscribers) {
      try {
        off();
      } catch {
        // ignore
      }
    }
    unsubscribers = [];
  }

  function detach() {
    cancelActive({ silent: true });
    if (popover) {
      popover.destroy();
      popover = null;
    }
  }

  // Lightweight keymap helper. Returns true if the event was handled.
  function handleKey(e) {
    // Esc while popover is open → cancel
    if (e.key === 'Escape' && popover && popover.isVisible()) {
      e.preventDefault();
      cancelActive();
      return true;
    }
    // Cmd+K / Ctrl+K → open popover for current selection
    const meta = e.metaKey || e.ctrlKey;
    if (meta && (e.key === 'k' || e.key === 'K')) {
      if (typeof onShortcut === 'function' && !onShortcut('cmd-k', e)) return false;
      e.preventDefault();
      return showForSelection();
    }
    return false;
  }

  return {
    showForSelection,
    cancelActive,
    handleKey,
    detach,
  };
}

module.exports = { createInlineAiController };
