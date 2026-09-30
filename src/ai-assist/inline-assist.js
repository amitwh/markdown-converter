/**
 * Inline AI assist — prompt builder + result applier.
 *
 * Pure module. The actual network call goes through AiProviders.js; this
 * module shapes the request (system + user messages) and validates the
 * response before it reaches the editor.
 *
 * Actions (v4.13.0): rewrite / shorten / expand.
 *
 * Safety: MAX_SELECTION_CHARS caps the selection so a runaway or hostile
 * caller can't push an 8KB+ blob at an API. The cap is enforced BEFORE
 * the IPC hop so the main process sees only safe payloads.
 *
 * @module inline-assist
 */

const MAX_SELECTION_CHARS = 8 * 1024;

const ACTIONS = {
  rewrite: {
    label: 'Rewrite',
    systemPrompt:
      'You are a precise writing assistant. Rewrite the selected text to improve clarity, ' +
      'flow, and word choice while preserving the original meaning, tone, and length. ' +
      'Return ONLY the rewritten text — no preamble, no explanation, no surrounding quotes.',
  },
  shorten: {
    label: 'Shorten',
    systemPrompt:
      'You are a precise writing assistant. Shorten the selected text while preserving all ' +
      'key information. Aim for 30–50% reduction in length. Drop filler, redundancy, and ' +
      'verbose phrasing. Return ONLY the shortened text — no preamble, no explanation.',
  },
  expand: {
    label: 'Expand',
    systemPrompt:
      'You are a precise writing assistant. Expand the selected text by adding relevant ' +
      'detail, examples, or explanation. Aim for 50–100% expansion. Stay on-topic. ' +
      'Return ONLY the expanded text — no preamble, no explanation.',
  },
};

const ACTIONS_LIST = Object.keys(ACTIONS);

/**
 * Build the {system, messages} payload for `action`.
 *
 * @param {'rewrite'|'shorten'|'expand'} action
 * @param {string} selection
 * @returns {{system:string, messages:Array<{role:'user', content:string}>}}
 * @throws when action is unknown or selection is empty / too large
 */
function buildAssistPrompt(action, selection) {
  const def = ACTIONS[action];
  if (!def) {
    const err = new Error(`Unknown AI assist action: ${action}`);
    err.code = 'unknown_action';
    throw err;
  }
  if (typeof selection !== 'string') {
    const err = new Error('Selection must be a string');
    err.code = 'bad_selection';
    throw err;
  }
  if (selection.length === 0) {
    const err = new Error('Selection is empty');
    err.code = 'empty_selection';
    throw err;
  }
  if (selection.length > MAX_SELECTION_CHARS) {
    const err = new Error(
      `Selection is too large (${selection.length} chars; max ${MAX_SELECTION_CHARS})`
    );
    err.code = 'selection_too_large';
    throw err;
  }
  return {
    system: def.systemPrompt,
    messages: [{ role: 'user', content: selection }],
  };
}

/**
 * Validate the provider's response before applying it to the editor.
 *
 * - Empty / whitespace-only → return null (don't replace selection with nothing)
 * - Unchanged → return null (no-op, don't churn the editor)
 *
 * @param {string} originalText - The original selection
 * @param {string} newText - The provider's response
 * @returns {string|null} text to apply, or null to skip
 */
function applyAssistResult(originalText, newText) {
  if (typeof newText !== 'string') return null;
  const trimmed = newText.trim();
  if (trimmed.length === 0) return null;
  if (trimmed === String(originalText || '').trim()) return null;
  return trimmed;
}

module.exports = {
  buildAssistPrompt,
  applyAssistResult,
  ACTIONS,
  ACTIONS_LIST,
  MAX_SELECTION_CHARS,
};
