/**
 * AI provider adapters for the AI Assistant plugin (main process side).
 *
 * All network calls happen here in the main process, never in the renderer:
 *   - the renderer's CSP does not need to whitelist AI endpoints
 *   - API keys never cross the IPC boundary into the renderer
 *   - every provider gets the same timeout/size/error sanitization rules
 *
 * Supported providers:
 *   - `openai`           → https://api.openai.com/v1 (chat completions)
 *   - `anthropic`        → https://api.anthropic.com (messages API)
 *   - `ollama`           → http://localhost:11434/v1 (OpenAI-compatible)
 *   - `lmstudio`         → http://localhost:1234/v1 (OpenAI-compatible)
 *   - `openai-compatible`→ any baseUrl speaking the OpenAI chat schema
 *   - `anthropic-compatible` → any baseUrl speaking the Anthropic messages
 *     schema (LiteLLM proxies, Bedrock gateways, local Claude-compatible
 *     servers); baseUrl is required, the API key is optional because many
 *     proxies are keyless or front their own auth
 *
 * The module takes an injectable `fetchImpl` (defaulting to global fetch) so
 * tests can stub the network without monkey-patching.
 *
 * @module AiProviders
 */

/* global AbortController */

// Hard caps shared by every provider: a runaway selection (or a hostile
// plugin caller) must not be able to push a 50MB "prompt" at an API.
const MAX_PROMPT_CHARS = 200 * 1024;
const DEFAULT_TIMEOUT_MS = 120000;

// Sensible defaults per provider; every field is overridable via settings.
const PROVIDER_DEFAULTS = {
  openai: { baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini' },
  anthropic: { baseUrl: 'https://api.anthropic.com', defaultModel: 'claude-3-5-sonnet-latest' },
  ollama: { baseUrl: 'http://localhost:11434/v1', defaultModel: 'llama3.1' },
  lmstudio: { baseUrl: 'http://localhost:1234/v1', defaultModel: 'local-model' },
  'openai-compatible': { baseUrl: '', defaultModel: '' },
  'anthropic-compatible': { baseUrl: '', defaultModel: 'claude-3-5-sonnet-latest' },
};

/** Provider ids that speak the OpenAI chat-completions schema. */
const OPENAI_STYLE = new Set(['openai', 'ollama', 'lmstudio', 'openai-compatible']);

class AiProviderError extends Error {
  /**
   * @param {string} message User-safe message (never include keys or raw HTML)
   * @param {string} code Machine-readable code for the renderer
   */
  constructor(message, code) {
    super(message);
    this.name = 'AiProviderError';
    this.code = code;
  }
}

/**
 * Validate and normalize a completion request shared by all providers.
 * @returns {{provider:string, baseUrl:string, apiKey:string, model:string,
 *            temperature:number}} resolved settings
 * @throws {AiProviderError} on unknown provider / missing key / bad URL
 */
function resolveSettings({
  provider,
  baseUrl,
  apiKey,
  model,
  temperature,
  requireKey = true,
} = {}) {
  const defaults = PROVIDER_DEFAULTS[provider];
  if (!defaults) {
    throw new AiProviderError(
      `Unknown AI provider "${provider}". Configure the AI Assistant plugin first.`,
      'not_configured'
    );
  }

  // Local providers (ollama/lmstudio) and self-hosted *-compatible proxies
  // don't need a key; branded cloud endpoints do.
  const needsKey =
    requireKey &&
    provider !== 'ollama' &&
    provider !== 'lmstudio' &&
    provider !== 'anthropic-compatible';
  if (needsKey && !apiKey) {
    throw new AiProviderError(
      `The "${provider}" provider needs an API key. Add one in AI Assistant settings.`,
      'missing_key'
    );
  }

  // Only allow http(s) base URLs to avoid file:// and other exotic schemes
  const resolvedBase = (baseUrl || defaults.baseUrl || '').replace(/\/+$/, '');
  if (!/^https?:\/\//.test(resolvedBase)) {
    throw new AiProviderError(`Invalid API base URL for provider "${provider}".`, 'bad_base_url');
  }

  return {
    provider,
    baseUrl: resolvedBase,
    apiKey: apiKey || '',
    model: model || defaults.defaultModel,
    temperature: typeof temperature === 'number' ? Math.max(0, Math.min(2, temperature)) : 0.7,
  };
}

/**
 * Call a chat-completion style provider (OpenAI schema).
 * @returns {Promise<string>} assistant message text
 */
async function callOpenAiStyle(settings, { system, messages }, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body = {
      model: settings.model,
      temperature: settings.temperature,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    };
    const headers = { 'Content-Type': 'application/json' };
    // Local servers accept (and ignore) bearer keys; harmless to send always
    if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;

    const response = await fetchImpl(`${settings.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new AiProviderError(
        `AI request failed (HTTP ${response.status}). Check the model name, API key, and base URL.`,
        `http_${response.status}`
      );
    }
    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string') {
      throw new AiProviderError(
        'AI provider returned an unexpected response shape.',
        'bad_response'
      );
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Call Anthropic's messages API.
 * @returns {Promise<string>} first text block of the reply
 */
async function callAnthropic(settings, { system, messages }, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Anthropic splits system prompts out of the message list
    const body = {
      model: settings.model,
      max_tokens: 4096,
      temperature: settings.temperature,
      system: system || undefined,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    };
    const headers = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    };
    if (settings.apiKey) {
      // Official API keys travel via x-api-key; many compatible gateways
      // (LiteLLM proxies, Bedrock fronts) expect a Bearer token instead.
      // Sending both is harmless for the official endpoint and maximizes
      // proxy compatibility.
      headers['x-api-key'] = settings.apiKey;
      headers.Authorization = `Bearer ${settings.apiKey}`;
    }
    // Bases may or may not already carry the /v1 prefix — handle both so a
    // "http://host:4000" proxy base and an "http://host:4000/v1" style base
    // both land on a single /v1/messages path.
    const messagesUrl = settings.baseUrl.endsWith('/v1')
      ? `${settings.baseUrl}/messages`
      : `${settings.baseUrl}/v1/messages`;
    const response = await fetchImpl(messagesUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new AiProviderError(
        `AI request failed (HTTP ${response.status}). Check the model name, API key, and base URL.`,
        `http_${response.status}`
      );
    }
    const data = await response.json();
    const text = Array.isArray(data?.content)
      ? data.content
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join('')
      : '';
    if (!text) {
      throw new AiProviderError(
        'AI provider returned an unexpected response shape.',
        'bad_response'
      );
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run a chat completion against the configured provider.
 *
 * @param {object} request - { provider, baseUrl, apiKey, model, temperature,
 *                            system, messages: [{role, content}] }
 * @param {object} [options] - { fetchImpl, timeoutMs }
 * @returns {Promise<{content: string}>}
 * @throws {AiProviderError} with user-safe messages (code field for UI logic)
 */
async function complete(request, options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new AiProviderError('No fetch implementation available.', 'no_fetch');
  }
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;

  if (!Array.isArray(request?.messages) || request.messages.length === 0) {
    throw new AiProviderError('No messages provided.', 'no_messages');
  }
  const totalChars =
    (request.system?.length || 0) +
    request.messages.reduce((n, m) => n + (m?.content?.length || 0), 0);
  if (totalChars > MAX_PROMPT_CHARS) {
    throw new AiProviderError(
      'Prompt is too large (over 200KB). Try a smaller selection.',
      'prompt_too_large'
    );
  }

  const settings = resolveSettings(request);
  if (OPENAI_STYLE.has(settings.provider)) {
    const content = await callOpenAiStyle(settings, request, fetchImpl, timeoutMs);
    return { content };
  }
  const content = await callAnthropic(settings, request, fetchImpl, timeoutMs);
  return { content };
}

/**
 * Stream a chat completion as an async iterable of text chunks.
 *
 * Supports the same providers as complete(). For SSE-supporting endpoints
 * (openai, anthropic, and their compatible variants; ollama and lmstudio
 * transparently support the openai schema), parses the chunked response
 * and yields each delta. For endpoints without working streaming, falls
 * back to a single chunk containing the full response.
 *
 * @param {object} request - same shape as complete()
 * @param {object} [options] - { fetchImpl, timeoutMs, signal }
 * @returns {AsyncIterable<string>}
 * @throws {AiProviderError} only on synchronous setup failures (auth,
 *   bad URL, oversized prompt). Network/HTTP errors during streaming are
 *   thrown when the consumer awaits a yield that follows the failure.
 */
async function* completeStream(request, options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new AiProviderError('No fetch implementation available.', 'no_fetch');
  }
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;

  if (!Array.isArray(request?.messages) || request.messages.length === 0) {
    throw new AiProviderError('No messages provided.', 'no_messages');
  }
  const totalChars =
    (request.system?.length || 0) +
    request.messages.reduce((n, m) => n + (m?.content?.length || 0), 0);
  if (totalChars > MAX_PROMPT_CHARS) {
    throw new AiProviderError(
      'Prompt is too large (over 200KB). Try a smaller selection.',
      'prompt_too_large'
    );
  }

  const settings = resolveSettings(request);
  if (OPENAI_STYLE.has(settings.provider)) {
    yield* streamOpenAiStyle(settings, request, fetchImpl, timeoutMs, options.signal);
    return;
  }
  yield* streamAnthropic(settings, request, fetchImpl, timeoutMs, options.signal);
}

async function* streamOpenAiStyle(settings, request, fetchImpl, timeoutMs, callerSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onCallerAbort = () => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener('abort', onCallerAbort, { once: true });
  }
  try {
    const body = {
      model: settings.model,
      temperature: settings.temperature,
      stream: true,
      messages: [
        ...(settings ? [{ role: 'system', content: settings.system || request.system }] : []),
        ...request.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    };
    const headers = { 'Content-Type': 'application/json' };
    if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;

    const response = await fetchImpl(`${settings.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...body,
        messages: [
          ...(request.system ? [{ role: 'system', content: request.system }] : []),
          ...request.messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new AiProviderError(
        `AI request failed (HTTP ${response.status}). Check the model name, API key, and base URL.`,
        `http_${response.status}`
      );
    }
    yield* parseSseStream(response, (data) => {
      try {
        const parsed = JSON.parse(data);
        return parsed?.choices?.[0]?.delta?.content || '';
      } catch {
        return '';
      }
    });
  } finally {
    clearTimeout(timer);
    if (callerSignal) callerSignal.removeEventListener('abort', onCallerAbort);
  }
}

async function* streamAnthropic(settings, request, fetchImpl, timeoutMs, callerSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onCallerAbort = () => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener('abort', onCallerAbort, { once: true });
  }
  try {
    const body = {
      model: settings.model,
      max_tokens: 4096,
      temperature: settings.temperature,
      stream: true,
      system: request.system || undefined,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
    };
    const headers = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    };
    if (settings.apiKey) {
      headers['x-api-key'] = settings.apiKey;
      headers.Authorization = `Bearer ${settings.apiKey}`;
    }
    const messagesUrl = settings.baseUrl.endsWith('/v1')
      ? `${settings.baseUrl}/messages`
      : `${settings.baseUrl}/v1/messages`;

    const response = await fetchImpl(messagesUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new AiProviderError(
        `AI request failed (HTTP ${response.status}). Check the model name, API key, and base URL.`,
        `http_${response.status}`
      );
    }
    // Anthropic SSE uses event: content_block_delta + data: {delta:{text}}
    yield* parseSseStream(response, (data) => {
      try {
        const parsed = JSON.parse(data);
        if (parsed?.type === 'content_block_delta') {
          return parsed?.delta?.text || '';
        }
        return '';
      } catch {
        return '';
      }
    });
  } finally {
    clearTimeout(timer);
    if (callerSignal) callerSignal.removeEventListener('abort', onCallerAbort);
  }
}

/**
 * Parse an SSE stream from a Response. Yields parsed chunks per `data:` line.
 * Handles the [DONE] sentinel used by OpenAI.
 */
async function* parseSseStream(response, parseData) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        if (line.startsWith('data:')) {
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') return;
          const chunk = parseData(payload);
          if (chunk) yield chunk;
        } else if (line.startsWith('event:')) {
          // Anthropic event type is captured via parseData on the following
          // data: line. Nothing to do at event: prefix.
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // already released
    }
  }
}

module.exports = {
  complete,
  completeStream,
  resolveSettings,
  AiProviderError,
  PROVIDER_DEFAULTS,
  MAX_PROMPT_CHARS,
};
