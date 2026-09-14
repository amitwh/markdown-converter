/**
 * Footnote hover preview.
 *
 * marked-footnote renders references as <a data-footnote-ref href="#footnote-N">
 * and bodies as <li id="footnote-N"> inside <section class="footnotes">.
 * When the user hovers a reference, this module shows a small popover with
 * the corresponding body text; on mouseleave it disappears.
 *
 * Pure DOM — no IPC, no markdown parsing. Mount once per preview pane and
 * forget about it. Re-mounting on preview re-render is safe: the old
 * listeners are replaced cleanly.
 *
 * @param {HTMLElement} previewRoot The preview pane container.
 * @param {object} [opts]
 * @param {number} [opts.delayMs=180] Show delay so the popover doesn't flicker
 *   during quick mouse passes.
 */
function mountFootnotePreview(previewRoot, opts = {}) {
  if (!previewRoot) return () => {};
  const delayMs = typeof opts.delayMs === 'number' ? opts.delayMs : 180;
  let pendingTimer = null;
  let activeRef = null;

  // Create the popover once at mount time so the first hover is instant and
  // tests can assert presence without racing the timer.
  const popover = document.createElement('div');
  popover.className = 'footnote-preview';
  popover.setAttribute('role', 'tooltip');
  popover.style.cssText =
    'position:fixed;z-index:100000;max-width:min(420px, 80vw);background:#1f1f23;color:#eee;' +
    'padding:8px 12px;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,0.25);font-size:12px;' +
    'line-height:1.4;pointer-events:none;display:none;white-space:pre-wrap;word-wrap:break-word;';
  document.body.appendChild(popover);

  function ensurePopover() {
    return popover;
  }

  function lookupFootnoteBody(href) {
    // href looks like "#footnote-1" — extract the id and find the matching <li>
    if (!href || !href.startsWith('#footnote-')) return null;
    const id = href.slice(1); // "#footnote-1" → "footnote-1"
    // CSS.escape() is in modern browsers but not in every test env; fallback
    // strips characters that would break the selector without escaping the
    // whole id (footnote ids are integers, so this is safe).
    const safeId =
      typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/[^a-zA-Z0-9_-]/g, '');
    const target = previewRoot.querySelector(`#${safeId}`);
    return target || null;
  }

  function extractBodyText(footnoteEl) {
    // Drop the backref link — the user already knows how to navigate back
    const clone = footnoteEl.cloneNode(true);
    clone.querySelectorAll('[data-footnote-backref]').forEach((el) => el.remove());
    // Take only the first paragraph's text so we don't show the whole section
    const p = clone.querySelector('p') || clone;
    return (p.textContent || '').trim();
  }

  function show(refEl) {
    const href = refEl.getAttribute('href');
    const li = lookupFootnoteBody(href);
    if (!li) return;
    const text = extractBodyText(li);
    if (!text) return;
    const el = ensurePopover();
    el.textContent = text;
    el.style.display = 'block';
    // Position the popover above the reference, falling back to below if there's no room
    const rect = refEl.getBoundingClientRect();
    const popRect = el.getBoundingClientRect();
    let top = rect.top - popRect.height - 8;
    if (top < 4) top = rect.bottom + 8;
    let left = rect.left;
    if (left + popRect.width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - popRect.width - 8);
    }
    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
    activeRef = refEl;
  }

  function hide() {
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    if (popover) popover.style.display = 'none';
    activeRef = null;
  }

  function onMouseOver(ev) {
    const t = ev.target;
    if (!(t instanceof Element)) return;
    const ref = t.closest('a[data-footnote-ref]');
    if (!ref) return;
    if (activeRef === ref) return;
    activeRef = ref;
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => show(ref), delayMs);
  }

  function onMouseOut(ev) {
    const t = ev.target;
    if (!(t instanceof Element)) return;
    if (!t.closest('a[data-footnote-ref]')) return;
    // If the mouse moved into the popover itself, keep it visible; otherwise hide.
    const related = ev.relatedTarget;
    if (related && popover && popover.contains(related)) return;
    hide();
  }

  previewRoot.addEventListener('mouseover', onMouseOver);
  previewRoot.addEventListener('mouseout', onMouseOut);

  return function unmount() {
    previewRoot.removeEventListener('mouseover', onMouseOver);
    previewRoot.removeEventListener('mouseout', onMouseOut);
    hide();
    if (popover && popover.parentNode) popover.parentNode.removeChild(popover);
  };
}

module.exports = { mountFootnotePreview };
