/**
 * MediAI Embedding Service
 * Generates vector embeddings using OpenAI text-embedding-3-small.
 * Falls back gracefully when ENABLE_EMBEDDINGS=false or quota exceeded.
 */

const OpenAI = require('openai');

let _openai = null;

function getOpenAIClient() {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
const EMBEDDING_DIMS = 1536; // text-embedding-3-small dimensions
const ENABLE_EMBEDDINGS = process.env.ENABLE_EMBEDDINGS !== 'false';

/**
 * Generate a single embedding vector for a text string.
 * Returns null if embeddings are disabled or on error.
 *
 * @param {string} text - Input text to embed
 * @returns {number[]|null} - 1536-dim float array, or null
 */
async function generateEmbedding(text) {
  if (!ENABLE_EMBEDDINGS) return null;
  if (!text || typeof text !== 'string') return null;

  // Truncate to safe token limit (~8000 chars ≈ 2000 tokens)
  const truncated = text.slice(0, 8000).trim();
  if (!truncated) return null;

  try {
    const response = await getOpenAIClient().embeddings.create({
      model: EMBEDDING_MODEL,
      input: truncated,
      dimensions: EMBEDDING_DIMS,
    });

    return response.data[0]?.embedding || null;
  } catch (error) {
    // Log but don't throw — embedding failure shouldn't break the assistant
    const code = error?.status || error?.code || 'unknown';
    console.warn(`[EmbeddingService] Failed to generate embedding (${code}):`, error?.message);
    return null;
  }
}

/**
 * Generate embeddings for multiple texts in a single API call (more efficient).
 * Returns array of embeddings (some may be null on failure).
 *
 * @param {string[]} texts - Array of texts to embed
 * @returns {(number[]|null)[]} - Array of embeddings
 */
async function batchGenerateEmbeddings(texts) {
  if (!ENABLE_EMBEDDINGS) return texts.map(() => null);
  if (!Array.isArray(texts) || texts.length === 0) return [];

  const truncated = texts.map(t => (t || '').slice(0, 8000).trim()).filter(Boolean);

  try {
    const response = await getOpenAIClient().embeddings.create({
      model: EMBEDDING_MODEL,
      input: truncated,
      dimensions: EMBEDDING_DIMS,
    });

    // Re-align results to original input indices
    return texts.map((_, i) => response.data[i]?.embedding || null);
  } catch (error) {
    console.warn('[EmbeddingService] Batch embedding failed:', error?.message);
    return texts.map(() => null);
  }
}

/**
 * Compute cosine similarity between two embedding vectors.
 * Used for local similarity checks without vector DB.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number} similarity score 0–1
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

module.exports = {
  generateEmbedding,
  batchGenerateEmbeddings,
  cosineSimilarity,
  EMBEDDING_DIMS,
  ENABLE_EMBEDDINGS,
};
