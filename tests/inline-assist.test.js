/**
 * @jest-environment node
 *
 * Inline AI assist pure module.
 */

const {
  buildAssistPrompt,
  applyAssistResult,
  ACTIONS,
  ACTIONS_LIST,
  MAX_SELECTION_CHARS,
} = require('../src/ai-assist/inline-assist');

describe('ACTIONS', () => {
  test('the three actions are exposed', () => {
    expect(ACTIONS_LIST).toEqual(['rewrite', 'shorten', 'expand']);
    expect(ACTIONS.rewrite.label).toBe('Rewrite');
    expect(ACTIONS.shorten.label).toBe('Shorten');
    expect(ACTIONS.expand.label).toBe('Expand');
  });

  test('every action has a non-empty system prompt', () => {
    for (const a of ACTIONS_LIST) {
      expect(typeof ACTIONS[a].systemPrompt).toBe('string');
      expect(ACTIONS[a].systemPrompt.length).toBeGreaterThan(20);
    }
  });
});

describe('buildAssistPrompt', () => {
  test('returns {system, messages} for each action', () => {
    for (const action of ACTIONS_LIST) {
      const out = buildAssistPrompt(action, 'hello world');
      expect(out.system).toBe(ACTIONS[action].systemPrompt);
      expect(out.messages).toHaveLength(1);
      expect(out.messages[0].role).toBe('user');
      expect(out.messages[0].content).toBe('hello world');
    }
  });

  test('preserves the exact selection content', () => {
    const selection = 'A\nmultiline\nselection with unicode éàü ✓ and trailing spaces   ';
    const out = buildAssistPrompt('rewrite', selection);
    expect(out.messages[0].content).toBe(selection);
  });

  test('throws on unknown action with unknown_action code', () => {
    try {
      buildAssistPrompt('polish', 'hi');
      throw new Error('expected to throw');
    } catch (err) {
      expect(err.code).toBe('unknown_action');
    }
  });

  test('throws on non-string selection with bad_selection code', () => {
    try {
      buildAssistPrompt('rewrite', null);
      throw new Error('expected to throw');
    } catch (err) {
      expect(err.code).toBe('bad_selection');
    }
    try {
      buildAssistPrompt('rewrite', 42);
      throw new Error('expected to throw');
    } catch (err) {
      expect(err.code).toBe('bad_selection');
    }
  });

  test('throws on empty selection with empty_selection code', () => {
    try {
      buildAssistPrompt('rewrite', '');
      throw new Error('expected to throw');
    } catch (err) {
      expect(err.code).toBe('empty_selection');
    }
  });

  test('throws on oversized selection with selection_too_large code', () => {
    const huge = 'a'.repeat(MAX_SELECTION_CHARS + 1);
    try {
      buildAssistPrompt('rewrite', huge);
      throw new Error('expected to throw');
    } catch (err) {
      expect(err.code).toBe('selection_too_large');
    }
  });

  test('accepts a selection at exactly the cap', () => {
    const exact = 'a'.repeat(MAX_SELECTION_CHARS);
    expect(() => buildAssistPrompt('rewrite', exact)).not.toThrow();
  });

  test('MAX_SELECTION_CHARS is 8KB', () => {
    expect(MAX_SELECTION_CHARS).toBe(8 * 1024);
  });
});

describe('applyAssistResult', () => {
  test('returns the trimmed new text when different', () => {
    expect(applyAssistResult('hello', 'HELLO')).toBe('HELLO');
    expect(applyAssistResult('hello', '  goodbye  ')).toBe('goodbye');
  });

  test('returns null when newText is unchanged from original (after trim)', () => {
    expect(applyAssistResult('hello', 'hello')).toBeNull();
    expect(applyAssistResult('hello', '  hello  ')).toBeNull();
  });

  test('returns null when newText is empty or whitespace-only', () => {
    expect(applyAssistResult('hello', '')).toBeNull();
    expect(applyAssistResult('hello', '   ')).toBeNull();
    expect(applyAssistResult('hello', '\n\t  ')).toBeNull();
  });

  test('returns null when newText is not a string', () => {
    expect(applyAssistResult('hello', null)).toBeNull();
    expect(applyAssistResult('hello', undefined)).toBeNull();
    expect(applyAssistResult('hello', 42)).toBeNull();
  });

  test('trims surrounding whitespace before comparing/applying', () => {
    // Even if the LLM adds stray newlines, we strip them before writing
    expect(applyAssistResult('x', '\n\nresult\n\n')).toBe('result');
  });
});
