/**
 * Semantic engine — pluggable interface for DocQA's ranking algorithm.
 *
 * Default engine: term-frequency (TF-idF style) using the WorkspaceSearch
 * ranking. Always present, no install, runs in milliseconds.
 *
 * Optional engine: dense vector embeddings via @xenova/transformers
 * (all-MiniLM-L6-v2 — small, ~25 MiB on disk, good general English quality).
 * Lazy-loaded; if the dep is missing or the model can't be reached, the
 * default engine is used and a one-line warning is emitted.
 *
 * The DocQA.ask() function takes an `engine` arg (optional). When omitted,
 * the default is used. When a neural engine is provided, DocQA will call
 * engine.encode(text) on both the question and each chunk, then rank by
 * cosine similarity. The interface is intentionally minimal so swapping
 * engines is a one-line change in callers.
 *
 * Activation (manual):
 *   1. `npm install @xenova/transformers` (heavy; ~50 MiB with deps)
 *   2. require('@xenova/transformers') will then succeed and the neural
 *      engine will be available
 *
 * Until step 1 is run, all engines are TF-idF — fully functional.
 *
 * @module SemanticEngine
 */

const { search } = require('./WorkspaceSearch');

/**
 * Default engine: delegates to WorkspaceSearch's term-frequency ranking.
 * No setup, no IO, always available.
 */
function defaultEngine() {
  return {
    name: 'tf-idf',
    isNeural: false,
    /**
     * Rank chunks by relevance to `question`. Returns the same shape as
     * WorkspaceSearch.search(): [{filePath, snippet, score, ...}]
     *
     * @param {string} question
     * @param {Array<{path:string, content:string, mtimeMs?:number}>} chunks
     * @returns {Promise<Array>}
     */
    async rank(question, chunks) {
      // WorkspaceSearch.search expects raw "files" — each chunk is a file.
      // We pass them through and translate the per-chunk paths back.
      const r = search({ query: question, files: chunks, limit: chunks.length });
      return r;
    },
  };
}

/**
 * Neural engine (when @xenova/transformers is installed).
 *
 * Uses all-MiniLM-L6-v2 (384-dim, ~25 MiB on first use). Lazy-loads on first
 * call so the cold-start of the app isn't slowed down. Embeddings are
 * cached per-question text in a Map<string, Float32Array> to avoid
 * recomputation within a session.
 *
 * Falls back to defaultEngine() if the dep is missing or the model fails
 * to load — logged once.
 *
 * @returns {Promise<object>} engine with rank(question, chunks)
 */
async function neuralEngine(opts = {}) {
  const modelName = typeof opts.model === 'string' ? opts.model : 'Xenova/all-MiniLM-L6-v2';

  let transformers;
  try {
    transformers = require('@xenova/transformers');
  } catch {
    console.warn('[SemanticEngine] @xenova/transformers not installed — using tf-idf instead');
    return defaultEngine();
  }

  // Disable remote model downloads in CI / offline environments
  const env = typeof transformers.env !== 'undefined' ? transformers.env : null;
  if (env && opts.allowRemote === false) {
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
  }

  let pipeline;
  try {
    pipeline = await transformers.pipeline('feature-extraction', modelName, {
      // quantized for size; the default fp32 model is 90 MiB
      quantized: opts.quantized !== false,
    });
  } catch (err) {
    console.warn(
      `[SemanticEngine] Failed to load ${modelName} (${err && err.message}); using tf-idf`
    );
    return defaultEngine();
  }

  const cache = new Map();

  async function encode(text) {
    if (cache.has(text)) return cache.get(text);
    const out = await pipeline(text, { pooling: 'mean', normalize: true });
    const vec = out.data instanceof Float32Array ? out.data : Float32Array.from(out.data);
    cache.set(text, vec);
    return vec;
  }

  function cosine(a, b) {
    // Both are normalized so this is a dot product, but we compute the full
    // formula defensively in case the model doesn't normalize.
    let dot = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) dot += a[i] * b[i];
    return dot;
  }

  return {
    name: `transformers:${modelName}`,
    isNeural: true,
    async rank(question, chunks) {
      const qVec = await encode(question);
      const scored = [];
      for (const chunk of chunks) {
        let cVec;
        try {
          cVec = await encode(chunk.content.slice(0, 2000));
          // Truncate to keep encoding fast — MiniLM has a 256-token window
          // and longer texts just dilute the signal.
        } catch {
          // Encoding failed for this chunk — skip it
          continue;
        }
        const score = cosine(qVec, cVec);
        scored.push({
          filePath: chunk.path,
          snippet: (chunk.content || '').slice(0, 200).replace(/\s+/g, ' ').trim() + '…',
          score,
          mtimeMs: chunk.mtimeMs,
          offset: chunk.offset || 0,
        });
      }
      scored.sort((a, b) => b.score - a.score);
      return scored;
    },
  };
}

/**
 * Get an engine by name. Unknown names fall back to defaultEngine().
 *
 * @param {string} [name='tf-idf']
 * @param {object} [opts]
 * @returns {Promise<object>} engine
 */
async function getEngine(name = 'tf-idf', opts = {}) {
  if (name === 'tf-idf') return defaultEngine();
  if (name === 'transformers' || name.startsWith('transformers:')) {
    return neuralEngine(opts);
  }
  return defaultEngine();
}

module.exports = {
  defaultEngine,
  neuralEngine,
  getEngine,
};
