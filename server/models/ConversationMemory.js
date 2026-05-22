/**
 * ConversationMemory Model
 * Per-message storage with vector embeddings for semantic search (RAG).
 * Enables "You mentioned breathing issues last week" type of memory.
 */

const mongoose = require('mongoose');

const conversationMemorySchema = new mongoose.Schema({
  // User reference — all queries MUST filter by this
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  // Session reference (for grouping by conversation)
  sessionId: {
    type: String,
    required: true,
    index: true,
  },

  // Message content
  role: {
    type: String,
    enum: ['user', 'assistant'],
    required: true,
  },

  content: {
    type: String,
    required: true,
    maxlength: 4000,
  },

  // Vector embedding for semantic search
  // 1536 dimensions for text-embedding-3-small
  // Set to null when ENABLE_EMBEDDINGS=false
  embedding: {
    type: [Number],
    default: null,
    select: false,  // Don't fetch by default (saves bandwidth)
  },

  // Auto-extracted semantic tags
  tags: {
    type: [String],
    default: [],
    index: true,
  },

  // Importance scoring (0–1)
  // High: health-related, appointments, symptoms
  // Low: navigation commands, greetings
  importanceScore: {
    type: Number,
    default: 0.5,
    min: 0,
    max: 1,
  },

  // Whether this memory has been included in a session summary
  summarized: {
    type: Boolean,
    default: false,
  },

  timestamp: {
    type: Date,
    default: Date.now,
  },

}, { timestamps: false });

// ─── Indexes ─────────────────────────────────────────────────────────────────
conversationMemorySchema.index({ userId: 1, timestamp: -1 });
conversationMemorySchema.index({ userId: 1, sessionId: 1 });
conversationMemorySchema.index({ userId: 1, tags: 1 });
conversationMemorySchema.index({ userId: 1, importanceScore: -1 });

// TTL index: auto-delete low-importance memories after 90 days
// High importance memories (score > 0.7) should be moved to UserMemoryProfile before expiry
conversationMemorySchema.index(
  { timestamp: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 } // 90 days
);

// ─── Static Helper ────────────────────────────────────────────────────────────

/**
 * Save a conversation message with optional embedding
 */
conversationMemorySchema.statics.saveMessage = async function ({
  userId,
  sessionId,
  role,
  content,
  embedding = null,
  tags = [],
  importanceScore = 0.5,
}) {
  return this.create({
    userId,
    sessionId,
    role,
    content,
    embedding,
    tags,
    importanceScore,
    timestamp: new Date(),
  });
};

/**
 * Get recent messages for a user (without embeddings — for display)
 */
conversationMemorySchema.statics.getRecentMessages = async function (userId, limit = 20) {
  return this.find({ userId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .select('-embedding')
    .lean();
};

module.exports = mongoose.model('ConversationMemory', conversationMemorySchema);
