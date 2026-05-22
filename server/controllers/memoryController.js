/**
 * MediAI Memory Controller
 * REST API handlers for long-term memory management.
 * All routes are JWT-protected and scoped to the authenticated user.
 */

const UserMemoryProfile = require('../models/UserMemoryProfile');
const ConversationMemory = require('../models/ConversationMemory');
const {
  getUserMemoryProfile,
  updateUserMemoryProfile,
  searchSimilarMemories,
  saveConversationMemory,
  getUnfinishedWorkflow,
  clearUnfinishedWorkflow,
  saveUnfinishedWorkflow,
} = require('../memory/memoryManager');

// ─── Get User Memory Profile ──────────────────────────────────────────────────

/**
 * GET /api/assistant/memory/profile
 * Returns the user's full personalized memory profile.
 * Used by frontend to pre-load assistant context after login.
 */
async function getMemoryProfile(req, res) {
  try {
    const userId = req.user._id;
    const profile = await getUserMemoryProfile(userId);

    if (!profile) {
      return res.json({
        success: true,
        profile: null,
        message: 'No memory profile found — will be created on first conversation.',
      });
    }

    // Return a sanitized profile (no internal MongoDB fields)
    return res.json({
      success: true,
      profile: {
        healthConditions: profile.healthConditions,
        recurringSymptoms: profile.recurringSymptoms.filter(s => s.count >= 2), // Only recurring ones
        preferredDoctors: profile.preferredDoctors,
        appointmentHistory: profile.appointmentHistory.slice(-10), // Last 10
        conversationSummaries: profile.conversationSummaries.slice(-5), // Last 5
        aiPreferences: profile.aiPreferences,
        lastActiveWorkflow: profile.lastActiveWorkflow,
        totalConversations: profile.totalConversations,
        lastInteraction: profile.lastInteraction,
      },
    });
  } catch (error) {
    console.error('[MemoryController] getMemoryProfile error:', error);
    return res.status(500).json({ error: 'Failed to retrieve memory profile' });
  }
}

// ─── Update Memory Profile ────────────────────────────────────────────────────

/**
 * PUT /api/assistant/memory/profile
 * Update user's AI preferences and memory settings.
 */
async function updateMemoryProfile(req, res) {
  try {
    const userId = req.user._id;
    const { aiPreferences, healthConditions } = req.body;

    const updates = {};
    if (aiPreferences) updates.aiPreferences = aiPreferences;
    if (healthConditions) {
      // Only allow adding/updating confirmed conditions (user explicitly stating them)
      updates.healthConditions = healthConditions;
    }

    const profile = await updateUserMemoryProfile(userId, updates);

    return res.json({ success: true, profile });
  } catch (error) {
    console.error('[MemoryController] updateMemoryProfile error:', error);
    return res.status(500).json({ error: 'Failed to update memory profile' });
  }
}

// ─── Search Memory ────────────────────────────────────────────────────────────

/**
 * GET /api/assistant/memory/search?q=<query>
 * Semantic search over user's conversation history.
 * Returns top matches with similarity scores.
 */
async function searchMemory(req, res) {
  try {
    const userId = req.user._id;
    const { q, limit = 5 } = req.query;

    if (!q || !q.trim()) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const results = await searchSimilarMemories(userId.toString(), q, Math.min(parseInt(limit), 20));

    return res.json({
      success: true,
      query: q,
      results,
      count: results.length,
    });
  } catch (error) {
    console.error('[MemoryController] searchMemory error:', error);
    return res.status(500).json({ error: 'Failed to search memory' });
  }
}

// ─── Save Memory ──────────────────────────────────────────────────────────────

/**
 * POST /api/assistant/memory/save
 * Manually save a memory entry (e.g., user health note).
 */
async function saveMemory(req, res) {
  try {
    const userId = req.user._id;
    const { content, role = 'user', sessionId = 'manual', tags = [] } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'content is required' });
    }

    await saveConversationMemory(userId.toString(), sessionId, role, content);

    return res.json({ success: true, message: 'Memory saved successfully' });
  } catch (error) {
    console.error('[MemoryController] saveMemory error:', error);
    return res.status(500).json({ error: 'Failed to save memory' });
  }
}

// ─── Delete Memory Entry ──────────────────────────────────────────────────────

/**
 * DELETE /api/assistant/memory/:memoryId
 * Delete a specific memory entry. User can only delete their own memories.
 */
async function deleteMemory(req, res) {
  try {
    const userId = req.user._id;
    const { memoryId } = req.params;

    // Ensure the memory belongs to this user (security check)
    const memory = await ConversationMemory.findOne({ _id: memoryId, userId });
    if (!memory) {
      return res.status(404).json({ error: 'Memory not found or access denied' });
    }

    await ConversationMemory.deleteOne({ _id: memoryId, userId });

    return res.json({ success: true, message: 'Memory deleted' });
  } catch (error) {
    console.error('[MemoryController] deleteMemory error:', error);
    return res.status(500).json({ error: 'Failed to delete memory' });
  }
}

// ─── Get Recent Memories ──────────────────────────────────────────────────────

/**
 * GET /api/assistant/memory/recent?limit=20
 * Get recent conversation memories for the user.
 */
async function getRecentMemories(req, res) {
  try {
    const userId = req.user._id;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);

    const memories = await ConversationMemory.getRecentMessages(userId, limit);

    return res.json({ success: true, memories, count: memories.length });
  } catch (error) {
    console.error('[MemoryController] getRecentMemories error:', error);
    return res.status(500).json({ error: 'Failed to retrieve memories' });
  }
}

// ─── Unfinished Workflow ──────────────────────────────────────────────────────

/**
 * GET /api/assistant/memory/workflow
 * Get the user's saved unfinished workflow.
 */
async function getWorkflow(req, res) {
  try {
    const userId = req.user._id;
    const workflow = await getUnfinishedWorkflow(userId.toString());

    return res.json({
      success: true,
      workflow,
      hasWorkflow: !!workflow,
    });
  } catch (error) {
    console.error('[MemoryController] getWorkflow error:', error);
    return res.status(500).json({ error: 'Failed to retrieve workflow' });
  }
}

/**
 * DELETE /api/assistant/memory/workflow
 * Clear the user's saved unfinished workflow.
 */
async function clearWorkflow(req, res) {
  try {
    const userId = req.user._id;
    await clearUnfinishedWorkflow(userId.toString());

    return res.json({ success: true, message: 'Workflow cleared' });
  } catch (error) {
    console.error('[MemoryController] clearWorkflow error:', error);
    return res.status(500).json({ error: 'Failed to clear workflow' });
  }
}

// ─── Clear All Memory ─────────────────────────────────────────────────────────

/**
 * DELETE /api/assistant/memory/all
 * Delete ALL conversation memories for the user (GDPR-style data erasure).
 * Does NOT delete health profile (requires separate request).
 */
async function clearAllMemory(req, res) {
  try {
    const userId = req.user._id;

    const result = await ConversationMemory.deleteMany({ userId });

    return res.json({
      success: true,
      message: `Deleted ${result.deletedCount} memory entries`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error('[MemoryController] clearAllMemory error:', error);
    return res.status(500).json({ error: 'Failed to clear memory' });
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  getMemoryProfile,
  updateMemoryProfile,
  searchMemory,
  saveMemory,
  deleteMemory,
  getRecentMemories,
  getWorkflow,
  clearWorkflow,
  clearAllMemory,
};
