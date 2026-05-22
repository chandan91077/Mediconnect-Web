/**
 * MongoDB Atlas Vector Search Index Configuration
 * Sets up the vector search index required for semantic memory retrieval.
 *
 * IMPORTANT: Atlas Vector Search requires M10+ cluster tier OR Atlas Search.
 * For free M0 tier: the system falls back to keyword search automatically.
 *
 * To manually create the index in Atlas UI:
 * 1. Go to your Atlas cluster → Search → Create Search Index
 * 2. Choose "Atlas Vector Search"
 * 3. Database: your DB name, Collection: conversationmemories
 * 4. Paste the index definition below
 */

const mongoose = require('mongoose');

const VECTOR_INDEX_NAME = process.env.VECTOR_SEARCH_INDEX_NAME || 'memory_vector_index';
const EMBEDDING_DIMS = 1536; // text-embedding-3-small

/**
 * Atlas Vector Search index definition.
 * Used for $vectorSearch aggregation pipeline.
 */
const VECTOR_INDEX_DEFINITION = {
  name: VECTOR_INDEX_NAME,
  type: 'vectorSearch',
  definition: {
    fields: [
      {
        type: 'vector',
        path: 'embedding',
        numDimensions: EMBEDDING_DIMS,
        similarity: 'cosine',
      },
      {
        type: 'filter',
        path: 'userId',
      },
      {
        type: 'filter',
        path: 'tags',
      },
    ],
  },
};

/**
 * Attempt to create the Atlas vector search index via the MongoDB Driver.
 * This works on Atlas M10+ clusters. For free tier, it will be skipped gracefully.
 *
 * @returns {Promise<void>}
 */
async function ensureVectorIndex() {
  try {
    const db = mongoose.connection.db;
    if (!db) {
      console.warn('[VectorSearch] Database not connected yet, skipping index creation.');
      return;
    }

    const collection = db.collection('conversationmemories');

    // Check if index already exists
    const existingIndexes = await collection.listSearchIndexes().toArray().catch(() => []);
    const alreadyExists = existingIndexes.some(idx => idx.name === VECTOR_INDEX_NAME);

    if (alreadyExists) {
      console.log(`[VectorSearch] Index "${VECTOR_INDEX_NAME}" already exists ✓`);
      return;
    }

    // Attempt to create the index (requires Atlas M10+)
    await collection.createSearchIndex(VECTOR_INDEX_DEFINITION);
    console.log(`[VectorSearch] ✅ Created vector search index: "${VECTOR_INDEX_NAME}"`);
    console.log(`[VectorSearch] Note: Index may take 1–2 minutes to become active.`);

  } catch (error) {
    // Common errors:
    // - Free tier: "Atlas Search is not available on shared clusters"
    // - Already exists: handled above
    const msg = error?.message || '';

    if (msg.includes('shared') || msg.includes('free') || msg.includes('M0')) {
      console.warn('[VectorSearch] ⚠️  Atlas Vector Search requires M10+ cluster.');
      console.warn('[VectorSearch] 📋 Falling back to keyword-based memory search (no semantic search).');
      console.warn('[VectorSearch] 📋 To enable semantic search, upgrade your Atlas cluster to M10+.');
      console.warn('[VectorSearch] 📋 Or create the index manually in Atlas UI using:');
      console.warn(JSON.stringify(VECTOR_INDEX_DEFINITION, null, 2));
    } else if (msg.includes('already exists') || msg.includes('duplicate')) {
      console.log(`[VectorSearch] Index "${VECTOR_INDEX_NAME}" already exists ✓`);
    } else {
      console.warn('[VectorSearch] ⚠️  Could not create vector search index:', msg);
      console.warn('[VectorSearch] Memory search will use keyword fallback.');
    }
  }
}

/**
 * Get the Atlas Vector Search aggregation pipeline stage.
 * Used by memoryManager.js for semantic search.
 *
 * @param {number[]} queryVector - The query embedding
 * @param {string} userId - Filter by user
 * @param {number} topK - Number of results
 * @returns {Object[]} Aggregation pipeline stages
 */
function getVectorSearchPipeline(queryVector, userId, topK = 5) {
  return [
    {
      $vectorSearch: {
        index: VECTOR_INDEX_NAME,
        path: 'embedding',
        queryVector,
        numCandidates: Math.min(topK * 10, 100),
        limit: topK,
        filter: {
          userId: { $eq: new mongoose.Types.ObjectId(userId) },
        },
      },
    },
    {
      $project: {
        content: 1,
        role: 1,
        tags: 1,
        timestamp: 1,
        importanceScore: 1,
        score: { $meta: 'vectorSearchScore' },
      },
    },
  ];
}

module.exports = {
  ensureVectorIndex,
  getVectorSearchPipeline,
  VECTOR_INDEX_NAME,
  VECTOR_INDEX_DEFINITION,
};
