import { useEffect } from 'react';

/**
 * Bind a keyboard shortcut to a callback.
 *
 * Combos use `+` separators. Tokens:
 *   - `mod`         → meta (Mac) or ctrl (others)
 *   - `ctrl`        → ctrl only
 *   - `meta`        → meta only
 *   - `alt`         → alt / option
 *   - `shift`       → shift
 *   - any single char (case-insensitive), e.g. `s`, `S`
 *   - special names: `Tab`, `Enter`, `Escape`, `Space`, `ArrowUp/Down/Left/Right`
 *
 * The hook is suppressed when the keydown target is an `<input>`, `<textarea>`,
 * or contentEditable element, mirroring the standard browser shortcut pattern.
 *
 * On match, `event.preventDefault()` is called.
 */
export function useShortcut(combo: string, callback: (e: KeyboardEvent) => void): void {
  useEffect(() => {
    const tokens = parseCombo(combo);

    function isTypingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
      if (target.isContentEditable) return true;
      return false;
    }

    function handle(e: KeyboardEvent): void {
      if (isTypingTarget(e.target)) return;
      if (!matchCombo(tokens, e)) return;
      e.preventDefault();
      callback(e);
    }

    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [combo, callback]);
}

interface ComboSpec {
  mod?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  alt?: boolean;
  shift?: boolean;
  key: string; // lowercased
}

function parseCombo(combo: string): ComboSpec {
  const parts = combo
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);
  const spec: ComboSpec = { key: '' };
  for (const p of parts) {
    const lower = p.toLowerCase();
    if (lower === 'mod') spec.mod = true;
    else if (lower === 'ctrl' || lower === 'control') spec.ctrl = true;
    else if (lower === 'meta' || lower === 'cmd' || lower === 'command') spec.meta = true;
    else if (lower === 'alt' || lower === 'option') spec.alt = true;
    else if (lower === 'shift') spec.shift = true;
    else spec.key = lower;
  }
  return spec;
}

function matchCombo(spec: ComboSpec, e: KeyboardEvent): boolean {
  const key = e.key.toLowerCase();
  if (key !== spec.key) return false;

  if (spec.mod) {
    if (!(e.metaKey || e.ctrlKey)) return false;
  }
  if (spec.ctrl && !e.ctrlKey) return false;
  if (spec.meta && !e.metaKey) return false;
  if (spec.alt && !e.altKey) return false;
  if (spec.shift && !e.shiftKey) return false;

  // Reject extra modifiers that the spec did not ask for.
  // (e.g. spec says "mod+s" but user pressed "mod+shift+s" → no match.)
  if (!spec.shift && e.shiftKey) return false;
  if (!spec.alt && e.altKey) return false;
  // ctrl/meta: if spec did not require mod, ctrl or meta must be absent.
  if (!spec.mod && !spec.ctrl && e.ctrlKey) return false;
  if (!spec.mod && !spec.meta && e.metaKey) return false;
  // If spec said "mod" only, ctrl+meta is allowed (mod is either-or).
  if (spec.mod && !spec.ctrl && !spec.meta) {
    // ok
  }

  return true;
}
