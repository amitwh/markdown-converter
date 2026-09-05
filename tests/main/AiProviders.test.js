/**
 * @jest-environment node
 *
 * AiProviders tests with a stubbed fetch — no network access. Verifies the
 * provider dispatch, auth handling, timeouts, and the user-safe error paths.
 */
const {
  complete,
  resolveSettings,
  AiProviderError,
  PROVIDER_DEFAULTS,
  MAX_PROMPT_CHARS,
} = require('../../src/main/AiProviders');

/** Build a fetch stub returning the given JSON with status 200. */
function okFetch(body) {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  });
}

describe('AiProviders', () => {
  describe('resolveSettings', () => {
    it('applies provider defaults for base URL and model', () => {
      const s = resolveSettings({ provider: 'ollama' });
      expect(s.baseUrl).toBe(PROVIDER_DEFAULTS.ollama.baseUrl);
      expect(s.model).toBe(PROVIDER_DEFAULTS.ollama.defaultModel);
      expect(s.apiKey).toBe('');
    });

    it('does not require an API key for local providers', () => {
      expect(() => resolveSettings({ provider: 'lmstudio' })).not.toThrow();
      expect(() => resolveSettings({ provider: 'ollama' })).not.toThrow();
    });

    it('requires an API key for remote providers', () => {
      expect(() => resolveSettings({ provider: 'openai' })).toThrow(AiProviderError);
      expect(() => resolveSettings({ provider: 'anthropic' })).toThrow(/API key/);
    });

    it('rejects unknown providers and non-http(s) base URLs', () => {
      expect(() => resolveSettings({ provider: 'nope' })).toThrow(/Unknown AI provider/);
      expect(() =>
        resolveSettings({ provider: 'openai-compatible', apiKey: 'k', baseUrl: 'file:///etc' })
      ).toThrow(/Invalid API base URL/);
    });

    it('clamps temperature into [0, 2]', () => {
      expect(resolveSettings({ provider: 'ollama', temperature: 99 }).temperature).toBe(2);
      expect(resolveSettings({ provider: 'ollama', temperature: -5 }).temperature).toBe(0);
    });
  });

  describe('complete', () => {
    const messages = [{ role: 'user', content: 'hello' }];

    it('rejects requests with no messages', async () => {
      await expect(complete({ provider: 'ollama', messages: [] })).rejects.toThrow(/No messages/);
    });

    it('rejects prompts over the size cap', async () => {
      await expect(
        complete({
          provider: 'ollama',
          messages: [{ role: 'user', content: 'x'.repeat(MAX_PROMPT_CHARS + 1) }],
        })
      ).rejects.toThrow(/too large/i);
    });

    it('sends the OpenAI chat-completions shape with a bearer key', async () => {
      const fetchImpl = okFetch({ choices: [{ message: { content: 'hi there' } }] });
      const result = await complete(
        { provider: 'openai', apiKey: 'sk-test', messages },
        { fetchImpl }
      );

      expect(result.content).toBe('hi there');
      const [url, init] = fetchImpl.mock.calls[0];
      expect(url).toBe('https://api.openai.com/v1/chat/completions');
      expect(init.headers.Authorization).toBe('Bearer sk-test');
      const body = JSON.parse(init.body);
      expect(body.messages[0].role).toBe('user');
    });

    it('prepends the system prompt as a system message for OpenAI-style providers', async () => {
      const fetchImpl = okFetch({ choices: [{ message: { content: 'ok' } }] });
      await complete({ provider: 'ollama', system: 'be brief', messages }, { fetchImpl });
      const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
      expect(body.messages[0]).toEqual({ role: 'system', content: 'be brief' });
    });

    it('sends the Anthropic messages shape with x-api-key header', async () => {
      const fetchImpl = okFetch({
        content: [{ type: 'text', text: 'claude says hi' }],
      });
      const result = await complete(
        { provider: 'anthropic', apiKey: 'ak-test', system: 'be nice', messages },
        { fetchImpl }
      );

      expect(result.content).toBe('claude says hi');
      const [url, init] = fetchImpl.mock.calls[0];
      expect(url).toBe('https://api.anthropic.com/v1/messages');
      expect(init.headers['x-api-key']).toBe('ak-test');
      expect(init.headers['anthropic-version']).toBe('2023-06-01');
      const body = JSON.parse(init.body);
      expect(body.system).toBe('be nice');
    });

    it('surfaces HTTP failures as user-safe errors without the body', async () => {
      const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 401 });
      await expect(
        complete({ provider: 'openai', apiKey: 'bad', messages }, { fetchImpl })
      ).rejects.toThrow(/HTTP 401/);
    });

    it('rejects unexpected response shapes', async () => {
      const fetchImpl = okFetch({ unexpected: true });
      await expect(
        complete({ provider: 'openai', apiKey: 'k', messages }, { fetchImpl })
      ).rejects.toThrow(/unexpected response/i);
    });

    it('surfaces aborts as timeouts', async () => {
      const fetchImpl = jest.fn(
        (_url, init) =>
          new Promise((_res, rej) => {
            init.signal.addEventListener('abort', () =>
              rej(new Error('The operation was aborted'))
            );
          })
      );
      await expect(
        complete({ provider: 'ollama', messages }, { fetchImpl, timeoutMs: 30 })
      ).rejects.toThrow();
    });
  });
});
