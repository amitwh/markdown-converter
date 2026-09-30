/**
 * Inline AI assist popover.
 *
 * Floating UI anchored to the current text selection. Three action buttons
 * (Rewrite / Shorten / Expand) + loading + error states + cancel/dismiss.
 *
 * The popover owns DOM only; the network call lives in the renderer's
 * `aiAssist` preload bridge and the IPC layer in main.js. The popover
 * dispatches actions via callbacks so the renderer can wire them to its
 * own selection / CodeMirror state.
 *
 * @module inline-ai-popover
 */

/**
 * @typedef {'idle' | 'loading' | 'error'} State
 */

/**
 * @param {HTMLElement} container Mount point (typically document.body)
 * @param {object} deps
 * @param {(action:string, selection:string) => void} [deps.onAction]
 * @param {() => void} [deps.onCancel]
 * @param {() => void} [deps.onRetry]
 * @param {(message:string) => void} [deps.onErrorShown]
 * @returns {{
 *   show(selection:{text:string, rect:DOMRect}): void,
 *   hide(): void,
 *   setState(state:State, opts?:{message?:string}): void,
 *   isVisible(): boolean,
 *   destroy(): void,
 * }}
 */
function createInlineAiPopover(container, deps = {}) {
  const { onAction = () => {}, onCancel = () => {}, onRetry = () => {} } = deps;

  let popoverEl = null;
  let actionsEl = null;
  let loadingEl = null;
  let errorEl = null;
  let errorMessageEl = null;
  let visible = false;
  let state = 'idle';

  function buildDom() {
    const wrap = document.createElement('div');
    wrap.className = 'inline-ai-popover';
    wrap.setAttribute('role', 'toolbar');
    wrap.setAttribute('aria-label', 'AI assist');
    wrap.innerHTML = `
      <div class="inline-ai-state inline-ai-actions">
        <button type="button" data-action="rewrite">Rewrite</button>
        <button type="button" data-action="shorten">Shorten</button>
        <button type="button" data-action="expand">Expand</button>
      </div>
      <div class="inline-ai-state inline-ai-loading" hidden>
        <span class="inline-ai-spinner" aria-hidden="true"></span>
        <span class="inline-ai-loading-label">Thinking…</span>
        <button type="button" data-action="cancel">Cancel</button>
      </div>
      <div class="inline-ai-state inline-ai-error" hidden>
        <span class="inline-ai-error-message"></span>
        <button type="button" data-action="retry">Retry</button>
        <button type="button" data-action="dismiss">Dismiss</button>
      </div>
    `;
    return wrap;
  }

  function attachListeners() {
    popoverEl.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'cancel' || action === 'dismiss') {
        onCancel();
        return;
      }
      if (action === 'retry') {
        onRetry();
        return;
      }
      if (state === 'idle') {
        // Stash the selection text on the popover at show() time so the
        // action handler doesn't need to query the DOM itself.
        const sel = popoverEl._inlineAiSelection || '';
        onAction(action, sel);
      }
    });
  }

  function position(rect) {
    if (!popoverEl || !rect) return;
    const margin = 8;
    const popWidth = popoverEl.offsetWidth || 240;
    const popHeight = popoverEl.offsetHeight || 36;

    let top = rect.top - popHeight - margin;
    let left = rect.left + rect.width / 2 - popWidth / 2;

    // Flip below the line if there's no room above
    if (top < margin) {
      top = rect.bottom + margin;
    }
    // Clamp horizontally to the container's bounds
    const containerRect = container.getBoundingClientRect
      ? container.getBoundingClientRect()
      : { left: 0, width: window.innerWidth };
    const minLeft = containerRect.left + margin;
    const maxLeft = containerRect.left + containerRect.width - popWidth - margin;
    if (left < minLeft) left = minLeft;
    if (left > maxLeft) left = maxLeft;

    popoverEl.style.top = `${top + window.scrollY}px`;
    popoverEl.style.left = `${left + window.scrollX}px`;
  }

  function setStateEl(newState, opts = {}) {
    if (!popoverEl) return;
    state = newState;
    actionsEl.hidden = newState !== 'idle';
    loadingEl.hidden = newState !== 'loading';
    errorEl.hidden = newState !== 'error';
    popoverEl.dataset.state = newState;
    if (newState === 'error' && errorMessageEl) {
      errorMessageEl.textContent = opts.message || 'AI request failed.';
    }
  }

  function show(selection) {
    if (!popoverEl) {
      popoverEl = buildDom();
      container.appendChild(popoverEl);
      actionsEl = popoverEl.querySelector('.inline-ai-actions');
      loadingEl = popoverEl.querySelector('.inline-ai-loading');
      errorEl = popoverEl.querySelector('.inline-ai-error');
      errorMessageEl = popoverEl.querySelector('.inline-ai-error-message');
      attachListeners();
    }
    popoverEl._inlineAiSelection = selection?.text || '';
    setStateEl('idle');
    popoverEl.classList.add('open');
    visible = true;
    // Position needs to happen after the DOM is in the document and laid out
    if (selection?.rect) position(selection.rect);
  }

  function hide() {
    visible = false;
    if (popoverEl) popoverEl.classList.remove('open');
  }

  function destroy() {
    if (popoverEl && popoverEl.parentNode) popoverEl.parentNode.removeChild(popoverEl);
    popoverEl = null;
    actionsEl = null;
    loadingEl = null;
    errorEl = null;
    errorMessageEl = null;
  }

  function isVisibleFn() {
    return visible;
  }

  function getRoot() {
    return popoverEl;
  }

  return {
    show,
    hide,
    setState: setStateEl,
    isVisible: isVisibleFn,
    destroy,
    getRoot,
  };
}

module.exports = { createInlineAiPopover };
