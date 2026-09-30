/**
 * @jest-environment node
 *
 * AiProviders.completeStream — minimal coverage of the SSE parser.
 * Provider-specific shapes (OpenAI delta.content, Anthropic content_block_delta)
 * are exercised via the parseData callback the helpers accept.
 */

/* global ReadableStream, Response */

const { completeStream, AiProviderError } = require('../src/main/AiProviders');

function makeSseResponse(lines) {
  const body = lines.join('\n') + '\n';
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

async function collect(iterable) {
  const out = [];
  for await (const chunk of iterable) out.push(chunk);
  return out;
}

describe('AiProviders.completeStream', () => {
  test('openai-style: yields delta.content per chunk, stops at [DONE]', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(
        makeSseResponse([
          'data: {"choices":[{"delta":{"content":"Hello"}}]}',
          'data: {"choices":[{"delta":{"content":", world"}}]}',
          'data: {"choices":[{"delta":{"content":"!"}}]}',
          'data: [DONE]',
        ])
      );

    const chunks = await collect(
      completeStream(
        {
          provider: 'openai',
          apiKey: 'sk-test',
          messages: [{ role: 'user', content: 'hi' }],
        },
        { fetchImpl }
      )
    );

    expect(chunks.join('')).toBe('Hello, world!');
  });

  test('anthropic-style: yields delta.text only from content_block_delta events', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(
        makeSseResponse([
          'event: message_start',
          'data: {"type":"message_start","message":{}}',
          '',
          'event: content_block_start',
          'data: {"type":"content_block_start"}',
          '',
          'event: content_block_delta',
          'data: {"type":"content_block_delta","delta":{"text":"Hi"}}',
          '',
          'event: content_block_delta',
          'data: {"type":"content_block_delta","delta":{"text":" there"}}',
          '',
          'data: [DONE]',
        ])
      );

    const chunks = await collect(
      completeStream(
        {
          provider: 'anthropic',
          apiKey: 'sk-test',
          messages: [{ role: 'user', content: 'hi' }],
        },
        { fetchImpl }
      )
    );

    expect(chunks.join('')).toBe('Hi there');
  });

  test('throws AiProviderError when no fetch implementation is available', async () => {
    const drain = async () => {
      // eslint-disable-next-line no-unused-vars
      for await (const _chunk of completeStream(
        { provider: 'openai', apiKey: 'x', messages: [{ role: 'user', content: 'h' }] },
        { fetchImpl: null }
      )) {
        // drain
      }
    };
    await expect(drain()).rejects.toBeInstanceOf(AiProviderError);
  });

  test('throws on empty messages', async () => {
    const drain = async () => {
      // eslint-disable-next-line no-unused-vars
      for await (const _chunk of completeStream(
        { provider: 'openai', apiKey: 'x', messages: [] },
        { fetchImpl: jest.fn() }
      )) {
        // drain
      }
    };
    await expect(drain()).rejects.toThrow(/No messages/);
  });

  test('throws on missing API key for branded providers', async () => {
    const drain = async () => {
      // eslint-disable-next-line no-unused-vars
      for await (const _chunk of completeStream(
        { provider: 'openai', apiKey: '', messages: [{ role: 'user', content: 'h' }] },
        { fetchImpl: jest.fn() }
      )) {
        // drain
      }
    };
    await expect(drain()).rejects.toThrow(/API key/);
  });
});
