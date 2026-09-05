/**
 * Prompt builders and output parsers for the AI Assistant plugin.
 *
 * Kept as a pure module (no DOM, no IPC) so prompt construction and the
 * proofread-issue parser can be unit-tested directly.
 *
 * @module AiPrompts
 */

/**
 * Task prompt templates. Each entry maps an assistant action to a system
 * prompt (behavior contract) and a user-prompt builder over the document
 * text. Markdown output is requested for editor-facing actions so results
 * can be inserted straight into the document.
 */
const TASKS = {
  summarize: {
    system:
      'You are a concise writing assistant. Summarize the user text in clear markdown. ' +
      'Use a short paragraph followed by 3-5 bullet points with the key ideas.',
    user: (text, extra) => `Summarize the following${extra ? ` (${extra})` : ''}:\n\n${text}`,
  },
  improve: {
    system:
      'You are a professional editor. Improve the user text for clarity, flow, and correctness. ' +
      'Return ONLY the rewritten markdown — no preamble, no explanations, no code fences ' +
      'around the whole answer.',
    user: (text) => `Rewrite and improve this text:\n\n${text}`,
  },
  explain: {
    system:
      'You are a patient technical explainer. Explain the user text in plain language, ' +
      'using short markdown sections and examples where helpful.',
    user: (text) => `Explain the following:\n\n${text}`,
  },
  translate: {
    system:
      'You are a careful translator. Translate the user text, preserving markdown formatting, ' +
      'tone, and technical terminology. Return ONLY the translation.',
    user: (text, targetLanguage) =>
      `Translate the following to ${targetLanguage || 'English'}:\n\n${text}`,
  },
  chat: {
    // Free-form conversation; the panel supplies its own message history
    system:
      'You are a helpful writing and markdown assistant inside a desktop editor. ' +
      'Answer in markdown. Be concise unless asked for detail.',
    user: (text) => text,
  },
};

/**
 * Build a {system, user} prompt pair for a known task action.
 *
 * @param {string} action Task id (summarize|improve|explain|translate|chat)
 * @param {string} text Document text or selection
 * @param {string} [extra] e.g. target language for translate
 * @returns {{system: string, user: string}}
 * @throws {Error} on unknown action
 */
function buildTaskPrompt(action, text, extra) {
  const task = TASKS[action];
  if (!task) throw new Error(`Unknown AI task "${action}"`);
  return { system: task.system, user: task.user(String(text || ''), extra) };
}

/**
 * System+user prompts for grammar proofreading. The writing-studio proofread
 * panel expects a callback with `{issues: [{type, message, suggestion}]}`,
 * so the model is asked for strict JSON.
 */
const PROOFREAD_SYSTEM =
  'You are a strict proofreader. Find grammar, spelling, and punctuation issues in the text. ' +
  'Respond with ONLY a JSON array — no prose, no code fences. Each element must be an object: ' +
  '{"type": "grammar"|"spelling"|"punctuation"|"style", "message": string, "suggestion": string}. ' +
  'The message should quote or describe the problematic fragment; the suggestion is the fix. ' +
  'If there are no issues, respond with [].';

/** @returns {{system: string, user: string}} */
function buildProofreadPrompt(text) {
  return {
    system: PROOFREAD_SYSTEM,
    user: `Proofread the following text and list its issues as the JSON array described:\n\n${text}`,
  };
}

/**
 * Parse a model's proofread answer into an issues array. Tolerates the usual
 * LLM quirks: code fences around the JSON, leading prose, trailing commas,
 * and single-quoted keys. Returns [] when nothing parseable is found rather
 * than throwing — a chatty model must not break the panel.
 *
 * @param {string} modelOutput Raw assistant text
 * @returns {Array<{type: string, message: string, suggestion: string}>}
 */
function parseProofreadIssues(modelOutput) {
  const raw = String(modelOutput || '').trim();
  if (!raw) return [];

  // Strip markdown code fences the model may have added despite instructions
  const unfenced = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  // Grab the outermost [...] block; ignores any leading/trailing prose
  const start = unfenced.indexOf('[');
  const end = unfenced.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return [];
  let jsonSlice = unfenced.slice(start, end + 1);

  let parsed;
  try {
    parsed = JSON.parse(jsonSlice);
  } catch {
    try {
      // Retry after trimming trailing commas (a common LLM artifact)
      jsonSlice = jsonSlice.replace(/,\s*([\]}])/g, '$1');
      parsed = JSON.parse(jsonSlice);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];
  // Normalize/whitelist fields so the panel always gets a stable shape
  return parsed
    .filter((item) => item && typeof item === 'object' && (item.message || item.suggestion))
    .slice(0, 100)
    .map((item) => ({
      type: typeof item.type === 'string' ? item.type.toLowerCase() : 'grammar',
      message: String(item.message || item.suggestion || ''),
      suggestion: item.suggestion === undefined ? '' : String(item.suggestion),
    }));
}

module.exports = {
  buildTaskPrompt,
  buildProofreadPrompt,
  parseProofreadIssues,
  TASKS,
};
