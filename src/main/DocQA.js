/**
 * Doc-aware Q&A — thin wrapper over WorkspaceSearch tuned for questions.
 *
 * User asks "what did I write about rust async last week?" and gets back the
 * top-K chunks from their workspace ranked by relevance. No neural model, no
 * API key — the same TF-idf-style ranking WorkspaceSearch uses, with a few
 * QA-specific tweaks:
 *
 *   - Question words (what/how/why/when/where/who/which/does/is/are/...) are
 *     stripped before ranking — they don't carry meaning, just grammar
 *   - The top chunks are split out as independent results so the renderer
 *     can show "3 passages from 2 files" instead of one giant result
 *   - Recency weight is doubled: "last week" implies the user wants fresh
 *     content, not old material
 *
 * Future upgrade path: swap `WorkspaceSearch.search` for a vector-similarity
 * call (transformers.js in the renderer, or a sidecar process). The public
 * shape — {question, chunks:[{filePath, snippet, score}]} — stays the same.
 *
 * @module DocQA
 */

const WorkspaceSearch = require('./WorkspaceSearch');
const SemanticEngine = require('./SemanticEngine');

const QUESTION_WORDS = new Set([
  'what',
  'when',
  'where',
  'who',
  'whom',
  'whose',
  'why',
  'how',
  'which',
  'whether',
  'does',
  'do',
  'did',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'can',
  'could',
  'would',
  'should',
  'will',
  'shall',
  'may',
  'might',
  'i',
  'me',
  'my',
  'we',
  'our',
  'you',
  'your',
  'they',
  'them',
  'their',
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'so',
  'of',
  'to',
  'in',
  'on',
  'at',
  'for',
  'with',
  'about',
  'into',
  'from',
  'by',
  'as',
  'this',
  'that',
  'these',
  'those',
  'it',
  'its',
  'write',
  'wrote',
  'written',
  'read',
  'think',
  'know',
  'find',
  'show',
  'tell',
  'say',
  'see',
  'use',
  'used',
]);

/**
 * Strip question words from a raw question so WorkspaceSearch's bare-term
 * matching isn't drowned in grammar noise. Quoted phrases, #tags, and
 * @wikilinks pass through unchanged.
 */
function cleanQuestion(raw) {
  if (typeof raw !== 'string') return '';
  // First pull out facets and phrases so we don't strip them
  const facets = [];
  const working = raw.replace(/[#@][A-Za-z0-9_-]+|"[^"]+"/g, (m) => {
    facets.push(m);
    return ' ';
  });
  const words = working.split(/\s+/).filter((w) => {
    const lower = w.toLowerCase().replace(/[^a-z0-9-]/g, '');
    return lower.length >= 2 && !QUESTION_WORDS.has(lower);
  });
  return [...words, ...facets].join(' ').trim();
}

/**
 * Split a document into rough passages (~800 chars or paragraph break,
 * whichever comes first). Returns an array of {start, end, text} so the
 * caller can build snippets. Pure.
 */
function chunkDocument(content, maxChunkChars = 800) {
  if (typeof content !== 'string' || content.length === 0) return [];
  const chunks = [];
  const paragraphs = content.split(/\n\s*\n/);
  let buffer = '';
  let startOffset = 0;
  for (const para of paragraphs) {
    // If a single paragraph exceeds the cap, hard-split it by character.
    if (para.length > maxChunkChars) {
      // Flush whatever was buffered first.
      if (buffer) {
        chunks.push({ start: startOffset, end: startOffset + buffer.length, text: buffer });
        startOffset += buffer.length + 2;
        buffer = '';
      }
      for (let i = 0; i < para.length; i += maxChunkChars) {
        const slice = para.slice(i, i + maxChunkChars);
        chunks.push({ start: startOffset, end: startOffset + slice.length, text: slice });
        startOffset += slice.length;
      }
      continue;
    }
    const tentative = buffer ? `${buffer}\n\n${para}` : para;
    if (tentative.length > maxChunkChars && buffer) {
      chunks.push({ start: startOffset, end: startOffset + buffer.length, text: buffer });
      startOffset += buffer.length + 2; // account for the "\n\n" we split on
      buffer = para;
    } else {
      buffer = tentative;
    }
  }
  if (buffer) chunks.push({ start: startOffset, end: startOffset + buffer.length, text: buffer });
  return chunks;
}

/**
 * Answer a natural-language question by ranking the workspace's chunks.
 *
 * @param {object} args
 * @param {string} args.question
 * @param {Array<{path:string, content:string, mtimeMs?:number}>} args.files
 * @param {number} [args.topK=5] number of chunks to return
 * @param {number} [args.nowMs=Date.now()]
 * @param {object} [args.engine] Optional SemanticEngine instance. When
 *   omitted, the default TF-idF engine is used. Pass a neural engine to
 *   swap in semantic embeddings.
 * @returns {{question:string, chunks:Array<{filePath:string, snippet:string, score:number, mtimeMs:number}>}}
 */
async function ask({
  question,
  files,
  topK = 5,
  nowMs = Date.now(),
  engine = null,
}) {
  const cleaned = cleanQuestion(question);
  if (!cleaned || !Array.isArray(files) || files.length === 0) {
    return { question: String(question || ''), chunks: [] };
  }

  // Chunk the corpus up front — both default and neural engines rank at
  // chunk granularity.
  const chunkCorpus = [];
  for (const file of files) {
    if (!file || typeof file.content !== 'string') continue;
    const chunks = chunkDocument(file.content);
    for (const chunk of chunks) {
      chunkCorpus.push({
        path: `${file.path}#${chunk.start}`,
        content: chunk.text,
        offset: chunk.start,
        mtimeMs: file.mtimeMs,
      });
    }
  }
  if (chunkCorpus.length === 0) {
    return { question: String(question), chunks: [] };
  }

  // Resolve engine (default = tf-idf)
  const eng = engine || SemanticEngine.defaultEngine();

  let chunkHits;
  if (eng.isNeural) {
    // Neural: rank directly on the question against the chunk corpus.
    chunkHits = await eng.rank(cleaned, chunkCorpus);
  } else {
    // TF-idF: broad doc pass first (caps the chunk corpus), then chunk rank.
    const docHits = WorkspaceSearch.search({ query: cleaned, files, limit: 20, nowMs });
    const docPaths = new Set(docHits.map((h) => h.filePath));
    const filtered = chunkCorpus.filter((c) => {
      const filePath = c.path.replace(/#\d+$/, '');
      return docPaths.has(filePath);
    });
    chunkHits = WorkspaceSearch.search({
      query: cleaned,
      files: filtered.length > 0 ? filtered : chunkCorpus,
      limit: topK,
      nowMs,
    });
  }

  // Translate the per-chunk hits back into the public shape.
  const chunks = chunkHits.slice(0, topK).map((h) => {
    const offsetMatch = /#(\d+)$/.exec(h.filePath);
    const offset = offsetMatch ? Number(offsetMatch[1]) : h.offset || 0;
    return {
      filePath: h.filePath.replace(/#\d+$/, ''),
      offset,
      snippet: h.snippet,
      score: h.score,
      mtimeMs:
        chunkCorpus.find((c) => c.path === h.filePath)?.mtimeMs || h.mtimeMs || 0,
    };
  });

  return { question: String(question), chunks };
}

module.exports = {
  cleanQuestion,
  chunkDocument,
  ask,
  QUESTION_WORDS,
};
