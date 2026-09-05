/**
 * AI Assistant prompt builder + proofread parser tests (pure module, jsdom
 * not required but harmless under the default environment).
 */
const {
  buildTaskPrompt,
  buildProofreadPrompt,
  parseProofreadIssues,
} = require('../src/plugins/built-in/ai-assistant/prompts');

describe('AI Assistant prompts', () => {
  describe('buildTaskPrompt', () => {
    it('builds a summarize prompt embedding the text', () => {
      const { system, user } = buildTaskPrompt('summarize', 'the text here');
      expect(system).toMatch(/summar/i);
      expect(user).toContain('the text here');
    });

    it('passes the target language through for translate', () => {
      const { user } = buildTaskPrompt('translate', 'bonjour', 'English');
      expect(user).toContain('English');
      expect(user).toContain('bonjour');
    });

    it('throws on unknown actions', () => {
      expect(() => buildTaskPrompt('nope', 'x')).toThrow(/Unknown AI task/);
    });

    it('tolerates missing text', () => {
      expect(buildTaskPrompt('explain', undefined).user).toBe('Explain the following:\n\n');
    });
  });

  describe('buildProofreadPrompt', () => {
    it('asks for a strict JSON array', () => {
      const { system, user } = buildProofreadPrompt('Some text.');
      expect(system).toMatch(/JSON array/);
      expect(user).toContain('Some text.');
    });
  });

  describe('parseProofreadIssues', () => {
    it('parses a clean JSON array', () => {
      const issues = parseProofreadIssues(
        '[{"type":"Spelling","message":"teh","suggestion":"the"}]'
      );
      expect(issues).toEqual([{ type: 'spelling', message: 'teh', suggestion: 'the' }]);
    });

    it('strips code fences and surrounding prose', () => {
      const issues = parseProofreadIssues(
        'Here you go:\n```json\n[{"type":"grammar","message":"run on","suggestion":"split"}]\n```\nDone!'
      );
      expect(issues).toHaveLength(1);
      expect(issues[0].suggestion).toBe('split');
    });

    it('tolerates trailing commas', () => {
      const issues = parseProofreadIssues(
        '[{"type":"style","message":"wordy","suggestion":"cut",},]'
      );
      expect(issues).toHaveLength(1);
    });

    it('returns [] for empty/garbage input instead of throwing', () => {
      expect(parseProofreadIssues('')).toEqual([]);
      expect(parseProofreadIssues('no json at all')).toEqual([]);
      expect(parseProofreadIssues('{"not":"an array"}')).toEqual([]);
      expect(parseProofreadIssues(null)).toEqual([]);
    });

    it('drops malformed entries and caps the list length', () => {
      const many = Array.from({ length: 300 }, (_, i) => ({
        type: 'grammar',
        message: `m${i}`,
        suggestion: 's',
      }));
      expect(parseProofreadIssues(JSON.stringify(many))).toHaveLength(100);
      const mixed = parseProofreadIssues('[{"message":"ok","suggestion":"x"},null,42,{"foo":1}]');
      // null/number entries dropped; {foo:1} dropped for lacking message+ suggestion
      expect(mixed).toHaveLength(1);
    });
  });
});
