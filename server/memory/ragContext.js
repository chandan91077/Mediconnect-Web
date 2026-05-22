/**
 * MediAI RAG Context Builder
 * Retrieval-Augmented Generation pipeline.
 * Builds a rich memory context from vector search + health profile to inject into GPT prompts.
 */

const { searchSimilarMemories, getUserMemoryProfile, getUnfinishedWorkflow } = require('./memoryManager');

// ─── RAG Pipeline ─────────────────────────────────────────────────────────────

/**
 * Build full RAG context for a user before calling GPT.
 * Combines:
 *   1. Semantically similar past memories (vector search)
 *   2. Permanent health profile (conditions, symptoms, preferences)
 *   3. Active unfinished workflow state
 *
 * @param {string} userId
 * @param {string} userMessage - Current user message
 * @param {string} sessionId
 * @returns {Promise<Object>} ragContext
 */
async function buildRAGContext(userId, userMessage, sessionId) {
  const [similarMemories, memoryProfile, activeWorkflow] = await Promise.all([
    searchSimilarMemories(userId, userMessage, parseInt(process.env.VECTOR_SEARCH_TOP_K) || 5),
    getUserMemoryProfile(userId),
    getUnfinishedWorkflow(userId),
  ]);

  return {
    similarMemories: similarMemories || [],
    memoryProfile: memoryProfile || null,
    activeWorkflow: activeWorkflow || null,
    userId,
    sessionId,
  };
}

// ─── Context Formatter ────────────────────────────────────────────────────────

/**
 * Format the RAG context into a readable text block for GPT injection.
 * This is prepended to the system prompt so the AI knows the user's history.
 *
 * @param {Object} ragContext - From buildRAGContext()
 * @returns {string} Formatted memory context string
 */
function formatMemoryForPrompt(ragContext) {
  const { similarMemories, memoryProfile, activeWorkflow } = ragContext;
  const sections = [];

  // ── Health Profile ──
  if (memoryProfile) {
    const profileLines = [];

    // Health conditions
    if (memoryProfile.healthConditions?.length > 0) {
      const conditions = memoryProfile.healthConditions
        .sort((a, b) => b.mentionCount - a.mentionCount)
        .slice(0, 5)
        .map(c => `${c.name} (mentioned ${c.mentionCount}x)`)
        .join(', ');
      profileLines.push(`Known health conditions: ${conditions}`);
    }

    // Recurring symptoms
    if (memoryProfile.recurringSymptoms?.length > 0) {
      const symptoms = memoryProfile.recurringSymptoms
        .filter(s => s.count >= 2)
        .sort((a, b) => b.count - a.count)
        .slice(0, 4)
        .map(s => `"${s.symptom}" (${s.count}x, last: ${formatDate(s.lastSeen)})`)
        .join(', ');
      if (symptoms) profileLines.push(`Recurring symptoms: ${symptoms}`);
    }

    // Preferred doctors
    if (memoryProfile.preferredDoctors?.length > 0) {
      const docs = memoryProfile.preferredDoctors
        .sort((a, b) => b.visitCount - a.visitCount)
        .slice(0, 3)
        .map(d => `Dr. ${d.doctorName} (${d.specialization})`)
        .join(', ');
      profileLines.push(`Preferred doctors: ${docs}`);
    }

    // AI preferences
    if (memoryProfile.aiPreferences) {
      const { language, tone } = memoryProfile.aiPreferences;
      if (language && language !== 'en') profileLines.push(`User language preference: ${language}`);
      if (tone) profileLines.push(`Preferred tone: ${tone}`);
    }

    if (profileLines.length > 0) {
      sections.push(`[USER HEALTH PROFILE]\n${profileLines.join('\n')}`);
    }

    // Recent conversation summaries
    if (memoryProfile.conversationSummaries?.length > 0) {
      const recent = memoryProfile.conversationSummaries
        .slice(-3)
        .map(s => `• ${s.summary}`)
        .join('\n');
      sections.push(`[RECENT CONVERSATION SUMMARIES]\n${recent}`);
    }
  }

  // ── Similar Past Memories (Vector Search Results) ──
  if (similarMemories?.length > 0) {
    const memLines = similarMemories
      .filter(m => m.role === 'user' && m.content) // Only show user's words back
      .slice(0, 4)
      .map(m => `• [${formatDate(m.timestamp)}] User said: "${m.content.slice(0, 150)}"`)
      .join('\n');

    if (memLines) {
      sections.push(`[RELEVANT PAST CONVERSATIONS]\n${memLines}`);
    }
  }

  // ── Active Workflow ──
  if (activeWorkflow) {
    const wf = activeWorkflow;
    const wfLines = [
      `Type: ${wf.type}`,
      `Step: ${wf.step}`,
      wf.data?.doctorName ? `Doctor: ${wf.data.doctorName}` : null,
      wf.data?.specialization ? `Specialization: ${wf.data.specialization}` : null,
      wf.data?.selectedSlot ? `Selected slot: ${wf.data.selectedSlot}` : null,
    ].filter(Boolean).join(', ');

    sections.push(`[UNFINISHED WORKFLOW]\nUser has an unfinished ${wf.type}. ${wfLines}`);
  }

  if (sections.length === 0) return '';

  return [
    '--- PERSONALIZED MEMORY CONTEXT ---',
    sections.join('\n\n'),
    '--- END MEMORY CONTEXT ---',
  ].join('\n');
}

// ─── Context Summary for Responses ───────────────────────────────────────────

/**
 * Extract a quick summary of what the assistant knows about the user.
 * Used for generating personalized greetings and acknowledgments.
 *
 * @param {Object} ragContext
 * @returns {Object} summary
 */
function getContextSummary(ragContext) {
  const { memoryProfile, activeWorkflow, similarMemories } = ragContext;

  return {
    hasHealthHistory: (memoryProfile?.healthConditions?.length > 0),
    hasRecurringSymptoms: (memoryProfile?.recurringSymptoms?.filter(s => s.count >= 2).length > 0),
    hasPreferredDoctors: (memoryProfile?.preferredDoctors?.length > 0),
    hasActiveWorkflow: !!activeWorkflow,
    hasPastConversations: (similarMemories?.length > 0),
    topConditions: memoryProfile?.healthConditions?.slice(0, 3).map(c => c.name) || [],
    recurringSymptoms: memoryProfile?.recurringSymptoms?.filter(s => s.count >= 2).map(s => s.symptom) || [],
    preferredDoctors: memoryProfile?.preferredDoctors?.slice(0, 2) || [],
    activeWorkflowType: activeWorkflow?.type || null,
    totalInteractions: memoryProfile?.totalConversations || 0,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(date) {
  if (!date) return 'unknown';
  try {
    return new Date(date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  } catch {
    return 'recently';
  }
}

module.exports = {
  buildRAGContext,
  formatMemoryForPrompt,
  getContextSummary,
};
