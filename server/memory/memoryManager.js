/**
 * MediAI Memory Manager
 * Core module for all long-term memory operations.
 * Handles saving, retrieving, searching, and updating user health memory.
 */

const ConversationMemory = require('../models/ConversationMemory');
const UserMemoryProfile = require('../models/UserMemoryProfile');
const { generateEmbedding, ENABLE_EMBEDDINGS } = require('./embeddingService');
const { extractTags, computeImportanceScore } = require('../personalization/symptomTracker');

// ─── Health Condition Keywords ────────────────────────────────────────────────

const HEALTH_CONDITION_KEYWORDS = {
  asthma: ['asthma', 'breathing issue', 'breathing problem', 'shortness of breath', 'inhaler'],
  diabetes: ['diabetes', 'diabetic', 'blood sugar', 'insulin', 'glucose'],
  hypertension: ['hypertension', 'high blood pressure', 'bp high', 'blood pressure'],
  migraine: ['migraine', 'severe headache', 'headache attack'],
  arthritis: ['arthritis', 'joint pain', 'joint inflammation'],
  anxiety: ['anxiety', 'panic attack', 'anxious'],
  depression: ['depression', 'depressed', 'mental health'],
  allergy: ['allergy', 'allergic', 'allergies'],
  heart_disease: ['heart disease', 'cardiac', 'coronary', 'chest pain'],
  kidney_disease: ['kidney', 'renal', 'ckd'],
};

// ─── Save Conversation Memory ─────────────────────────────────────────────────

/**
 * Save a conversation message with embedding and tags to MongoDB.
 * Also updates health profile if health-related content detected.
 *
 * @param {string} userId
 * @param {string} sessionId
 * @param {'user'|'assistant'} role
 * @param {string} content
 * @returns {Promise<void>}
 */
async function saveConversationMemory(userId, sessionId, role, content) {
  try {
    if (!content || !content.trim()) return;

    // Only embed user messages (assistant messages are less semantically useful)
    const shouldEmbed = role === 'user' && ENABLE_EMBEDDINGS;
    const embedding = shouldEmbed ? await generateEmbedding(content) : null;

    const tags = extractTags(content);
    const importanceScore = computeImportanceScore(content, tags);

    await ConversationMemory.saveMessage({
      userId,
      sessionId,
      role,
      content,
      embedding,
      tags,
      importanceScore,
    });

    // Update health profile from user messages
    if (role === 'user') {
      await detectAndUpdateHealthConditions(userId, content);
    }
  } catch (error) {
    // Memory saving is non-critical — log but don't throw
    console.error('[MemoryManager] saveConversationMemory error:', error?.message);
  }
}

// ─── Semantic Memory Search ───────────────────────────────────────────────────

/**
 * Search user's conversation history using vector similarity (Atlas $vectorSearch).
 * Falls back to keyword/tag search when embeddings are unavailable.
 *
 * @param {string} userId
 * @param {string} queryText - The current user message to search against
 * @param {number} topK - Number of results to return
 * @returns {Promise<Array>} - Array of relevant memory documents
 */
async function searchSimilarMemories(userId, queryText, topK = 5) {
  try {
    const queryEmbedding = ENABLE_EMBEDDINGS ? await generateEmbedding(queryText) : null;

    if (queryEmbedding) {
      // ── Atlas Vector Search ──
      const results = await ConversationMemory.aggregate([
        {
          $vectorSearch: {
            index: process.env.VECTOR_SEARCH_INDEX_NAME || 'memory_vector_index',
            path: 'embedding',
            queryVector: queryEmbedding,
            numCandidates: Math.min(topK * 10, 100),
            limit: topK,
            filter: { userId: { $eq: require('mongoose').Types.ObjectId.createFromHexString(userId.toString()) } },
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
      ]);

      return results;
    }

    // ── Fallback: Keyword/Tag Search ──
    const tags = extractTags(queryText);
    const query = { userId };
    if (tags.length > 0) {
      query.tags = { $in: tags };
    }

    return await ConversationMemory.find(query)
      .sort({ importanceScore: -1, timestamp: -1 })
      .limit(topK)
      .select('-embedding')
      .lean();

  } catch (error) {
    console.error('[MemoryManager] searchSimilarMemories error:', error?.message);
    return [];
  }
}

// ─── User Memory Profile ──────────────────────────────────────────────────────

/**
 * Get or create the user's long-term memory profile.
 *
 * @param {string} userId
 * @returns {Promise<Object>}
 */
async function getUserMemoryProfile(userId) {
  try {
    return await UserMemoryProfile.getOrCreate(userId);
  } catch (error) {
    console.error('[MemoryManager] getUserMemoryProfile error:', error?.message);
    return null;
  }
}

/**
 * Update specific fields on the user's memory profile.
 *
 * @param {string} userId
 * @param {Object} updates - Partial update object
 * @returns {Promise<Object>}
 */
async function updateUserMemoryProfile(userId, updates) {
  try {
    return await UserMemoryProfile.findOneAndUpdate(
      { userId },
      { $set: { ...updates, lastInteraction: new Date() } },
      { upsert: true, new: true }
    );
  } catch (error) {
    console.error('[MemoryManager] updateUserMemoryProfile error:', error?.message);
    return null;
  }
}

// ─── Health Condition Detection ───────────────────────────────────────────────

/**
 * Detect health conditions from user message text and update profile.
 * Uses keyword matching against known condition patterns.
 *
 * @param {string} userId
 * @param {string} text
 */
async function detectAndUpdateHealthConditions(userId, text) {
  try {
    const lower = text.toLowerCase();
    const detected = [];

    for (const [condition, keywords] of Object.entries(HEALTH_CONDITION_KEYWORDS)) {
      if (keywords.some(kw => lower.includes(kw))) {
        detected.push(condition);
      }
    }

    if (detected.length === 0) return;

    const profile = await UserMemoryProfile.findOne({ userId });
    if (!profile) return;

    let changed = false;
    for (const condition of detected) {
      const existing = profile.healthConditions.find(c => c.name === condition);
      if (existing) {
        existing.mentionCount += 1;
        existing.lastMentioned = new Date();
      } else {
        profile.healthConditions.push({
          name: condition,
          firstMentioned: new Date(),
          lastMentioned: new Date(),
          mentionCount: 1,
          confirmed: false,
        });
      }
      changed = true;
    }

    if (changed) {
      profile.lastInteraction = new Date();
      await profile.save();
    }
  } catch (error) {
    console.error('[MemoryManager] detectAndUpdateHealthConditions error:', error?.message);
  }
}

// ─── Recurring Symptom Tracking ───────────────────────────────────────────────

/**
 * Track a symptom mention. If mentioned 2+ times, marks it as recurring.
 *
 * @param {string} userId
 * @param {string} symptom - Normalized symptom string
 * @param {string} [relatedSpecialist] - Suggested specialist
 */
async function trackSymptom(userId, symptom, relatedSpecialist = null) {
  try {
    const profile = await UserMemoryProfile.findOne({ userId });
    if (!profile) return;

    const existing = profile.recurringSymptoms.find(
      s => s.symptom.toLowerCase() === symptom.toLowerCase()
    );

    if (existing) {
      existing.count += 1;
      existing.lastSeen = new Date();
      if (relatedSpecialist) existing.relatedSpecialist = relatedSpecialist;
    } else {
      profile.recurringSymptoms.push({
        symptom,
        count: 1,
        firstSeen: new Date(),
        lastSeen: new Date(),
        relatedSpecialist,
      });
    }

    await profile.save();
  } catch (error) {
    console.error('[MemoryManager] trackSymptom error:', error?.message);
  }
}

// ─── Preferred Doctor Tracking ────────────────────────────────────────────────

/**
 * Record a doctor interaction (booked, searched, or visited).
 *
 * @param {string} userId
 * @param {Object} doctor - { doctorId, doctorName, specialization }
 */
async function trackDoctorInteraction(userId, doctor) {
  try {
    const { doctorId, doctorName, specialization } = doctor;
    const profile = await UserMemoryProfile.findOne({ userId });
    if (!profile) return;

    const existing = profile.preferredDoctors.find(
      d => d.doctorId?.toString() === doctorId?.toString()
    );

    if (existing) {
      existing.visitCount += 1;
      existing.lastVisit = new Date();
    } else {
      profile.preferredDoctors.push({
        doctorId,
        doctorName,
        specialization,
        visitCount: 1,
        lastVisit: new Date(),
      });
    }

    await profile.save();
  } catch (error) {
    console.error('[MemoryManager] trackDoctorInteraction error:', error?.message);
  }
}

// ─── Workflow Persistence ─────────────────────────────────────────────────────

/**
 * Save an unfinished workflow state so user can resume it later.
 *
 * @param {string} userId
 * @param {Object} workflowState - { type, step, data }
 */
async function saveUnfinishedWorkflow(userId, workflowState) {
  try {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h expiry
    await updateUserMemoryProfile(userId, {
      lastActiveWorkflow: { ...workflowState, savedAt: new Date(), expiresAt },
    });
  } catch (error) {
    console.error('[MemoryManager] saveUnfinishedWorkflow error:', error?.message);
  }
}

/**
 * Get the user's saved unfinished workflow (if not expired).
 *
 * @param {string} userId
 * @returns {Promise<Object|null>}
 */
async function getUnfinishedWorkflow(userId) {
  try {
    const profile = await UserMemoryProfile.findOne({ userId }).select('lastActiveWorkflow');
    if (!profile?.lastActiveWorkflow) return null;

    const { expiresAt } = profile.lastActiveWorkflow;
    if (expiresAt && new Date(expiresAt) < new Date()) {
      // Expired — clear it
      await updateUserMemoryProfile(userId, { lastActiveWorkflow: null });
      return null;
    }

    return profile.lastActiveWorkflow;
  } catch (error) {
    console.error('[MemoryManager] getUnfinishedWorkflow error:', error?.message);
    return null;
  }
}

/**
 * Clear the unfinished workflow (after completion or cancellation).
 */
async function clearUnfinishedWorkflow(userId) {
  try {
    await updateUserMemoryProfile(userId, { lastActiveWorkflow: null });
  } catch (error) {
    console.error('[MemoryManager] clearUnfinishedWorkflow error:', error?.message);
  }
}

// ─── Conversation Summary ─────────────────────────────────────────────────────

/**
 * Add a GPT-generated session summary to the user's profile.
 * Called at end of session to compress long conversations.
 *
 * @param {string} userId
 * @param {string} sessionId
 * @param {string} summary
 * @param {string[]} keyTopics
 */
async function addConversationSummary(userId, sessionId, summary, keyTopics = []) {
  try {
    await UserMemoryProfile.findOneAndUpdate(
      { userId },
      {
        $push: {
          conversationSummaries: {
            $each: [{ sessionId, summary, keyTopics, createdAt: new Date() }],
            $slice: -20, // Keep last 20 summaries
          },
        },
        $inc: { totalConversations: 1 },
        $set: { lastInteraction: new Date() },
      },
      { upsert: true }
    );
  } catch (error) {
    console.error('[MemoryManager] addConversationSummary error:', error?.message);
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  saveConversationMemory,
  searchSimilarMemories,
  getUserMemoryProfile,
  updateUserMemoryProfile,
  detectAndUpdateHealthConditions,
  trackSymptom,
  trackDoctorInteraction,
  saveUnfinishedWorkflow,
  getUnfinishedWorkflow,
  clearUnfinishedWorkflow,
  addConversationSummary,
};
