/**
 * MediAI Assistant Controller
 * Handles intent processing, session memory, and AI responses.
 * Now enhanced with RAG (Retrieval-Augmented Generation) and long-term memory.
 *
 * Pipeline:
 *   User Input → Local Rule Parser → Embedding → Vector Search → RAG Context → GPT → Save Memory
 */

const { callGPT, localFallbackParse } = require('../ai/gptClient');
const { buildSystemPrompt, buildPersonalizedSystemPrompt } = require('../ai/systemPrompt');
const {
  getHistory,
  addMessage,
  getContext,
  updateContext,
  clearSession,
} = require('../ai/sessionMemory');
const { emitToUser } = require('../socket/assistantSocket');
const { buildRAGContext, formatMemoryForPrompt, getContextSummary } = require('../memory/ragContext');
const { saveConversationMemory, trackSymptom, trackDoctorInteraction, saveUnfinishedWorkflow, clearUnfinishedWorkflow } = require('../memory/memoryManager');
const { detectSymptoms, isRecurringSymptom } = require('../personalization/symptomTracker');
const { isResumeIntent, resumeWorkflow, buildWorkflowState } = require('../personalization/workflowContinuation');

// ─── Process Intent ───────────────────────────────────────────────────────────

/**
 * POST /api/assistant/intent
 * Process a user's voice/text command and return an action response.
 */
async function processIntent(req, res) {
  try {
    const { text, sessionId, pageContext } = req.body;
    const user = req.user; // Injected by auth middleware

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'No input text provided' });
    }

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const role = user?.role || 'patient';
    const userName = user?.full_name || user?.name || 'User';
    const userId = user?._id?.toString();

    // ── Step 1: Check for resume workflow intent (highest priority) ──
    if (isResumeIntent(text)) {
      const resumeResponse = await resumeWorkflow(userId);
      if (resumeResponse) {
        // Save this exchange to memory
        await Promise.all([
          saveConversationMemory(userId, sessionId, 'user', text),
          saveConversationMemory(userId, sessionId, 'assistant', resumeResponse.reply || ''),
        ]);

        addMessage(sessionId, 'user', text);
        addMessage(sessionId, 'assistant', resumeResponse.reply || '');

        if (userId) {
          emitToUser(userId, { type: 'action', ...resumeResponse, timestamp: new Date().toISOString() });
        }

        return res.json({
          success: true,
          sessionId,
          ...resumeResponse,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // ── Step 2: Try local rule-based parser first (faster, no API cost) ──
    const localResult = localFallbackParse(text, pageContext);

    let actionResponse;

    // ── Step 3: Build RAG Context (parallel: vector search + health profile + workflow) ──
    // Declared here so it's accessible in Step 7 post-processing
    let ragContext = null;
    let memoryContextStr = '';
    let ctxSummary = {};

    if (localResult) {
      // Local parse succeeded — use it directly (no GPT call needed)
      actionResponse = localResult;
    } else {
      if (userId) {
        try {
          ragContext = await buildRAGContext(userId, text, sessionId);
          memoryContextStr = formatMemoryForPrompt(ragContext);
          ctxSummary = getContextSummary(ragContext);
        } catch (ragError) {
          console.warn('[AssistantController] RAG context build failed (non-critical):', ragError?.message);
        }
      }

      // ── Step 4: Build personalized system prompt with memory injection ──
      const systemPrompt = memoryContextStr
        ? buildPersonalizedSystemPrompt(role, userName, memoryContextStr, ctxSummary)
        : buildSystemPrompt(role, userName);

      // ── Step 5: Get session history + enrich user message ──
      const history = getHistory(sessionId, 8);
      const context = getContext(sessionId);

      let enrichedText = text;
      if (context.lastSpecialization) {
        enrichedText = `[Context: User was looking for ${context.lastSpecialization}]\n${enrichedText}`;
      }
      if (pageContext) {
        enrichedText = `[Screen Content: ${pageContext}]\n${enrichedText}`;
      }

      // ── Step 6: Call GPT with enriched prompt ──
      actionResponse = await callGPT(systemPrompt, history, enrichedText);
    }

    // ── Step 7: Personalization post-processing ──
    if (userId) {
      // Detect symptoms and check for recurring patterns
      const detectedSymptoms = detectSymptoms(text);

      if (detectedSymptoms.length > 0 && ragContext) {
        const profile = ragContext?.memoryProfile;
        for (const { symptom, specialist } of detectedSymptoms) {
          // Track symptom frequency
          await trackSymptom(userId, symptom, specialist);

          // If recurring symptom — enhance the response with acknowledgment
          const recurring = isRecurringSymptom(profile, symptom);
          if (recurring && recurring.count >= 2 && actionResponse.action === 'reply') {
            // Only enhance plain replies, not navigation commands
            const prefix = `I notice you've mentioned **${symptom}** before (${recurring.count} times). `;
            actionResponse.reply = prefix + (actionResponse.reply || '');
          }
        }
      }

      // Track doctor interactions from booking actions
      if (actionResponse.action === 'open_booking' && actionResponse.doctorName) {
        await trackDoctorInteraction(userId, {
          doctorId: actionResponse.doctorId || null,
          doctorName: actionResponse.doctorName,
          specialization: actionResponse.specialization || null,
        });
      }

      // Persist workflow state for resumption
      if (actionResponse.action === 'open_booking') {
        const wfData = {
          doctorId: actionResponse.doctorId,
          doctorName: actionResponse.doctorName,
          specialization: actionResponse.specialization,
        };
        await saveUnfinishedWorkflow(userId, buildWorkflowState('booking', 'select_slot', wfData));
      }

      // Clear workflow when booking is explicitly completed/cancelled
      if (actionResponse.action === 'reply' && /booking.*(confirm|done|cancel|complet)/i.test(actionResponse.reply || '')) {
        await clearUnfinishedWorkflow(userId);
      }
    }

    // ── Step 8: Update in-memory session ──
    addMessage(sessionId, 'user', text);
    addMessage(sessionId, 'assistant', actionResponse.reply || '');

    if (actionResponse.specialization) {
      updateContext(sessionId, { lastSpecialization: actionResponse.specialization });
    }

    // ── Step 9: Save to long-term memory (async, non-blocking) ──
    if (userId) {
      Promise.all([
        saveConversationMemory(userId, sessionId, 'user', text),
        saveConversationMemory(userId, sessionId, 'assistant', actionResponse.reply || ''),
      ]).catch(err => console.warn('[AssistantController] Memory save error (non-critical):', err?.message));
    }

    // ── Step 10: Emit response via Socket.IO (realtime delivery) ──
    if (userId) {
      emitToUser(userId, {
        type: 'action',
        ...actionResponse,
        timestamp: new Date().toISOString(),
      });
    }

    // ── Step 11: Return HTTP response ──
    return res.json({
      success: true,
      sessionId,
      ...actionResponse,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[MediAI] processIntent error:', error);

    return res.json({
      success: false,
      action: 'reply',
      reply: "I'm having trouble understanding that right now. Please try again or use the navigation menu. 🩺",
      timestamp: new Date().toISOString(),
    });
  }
}

// ─── Get Conversation History ─────────────────────────────────────────────────

/**
 * GET /api/assistant/history
 * Get recent conversation history for the current session
 */
async function getConversationHistory(req, res) {
  try {
    const { sessionId } = req.query;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const history = getHistory(sessionId, 20);
    return res.json({ success: true, history });
  } catch (error) {
    console.error('[MediAI] getHistory error:', error);
    return res.status(500).json({ error: 'Failed to retrieve history' });
  }
}

// ─── Clear Session ────────────────────────────────────────────────────────────

/**
 * DELETE /api/assistant/session
 * Clear a user's session memory
 */
async function clearConversation(req, res) {
  try {
    const { sessionId } = req.body;
    if (sessionId) {
      clearSession(sessionId);
    }
    return res.json({ success: true, message: 'Session cleared' });
  } catch (error) {
    console.error('[MediAI] clearSession error:', error);
    return res.status(500).json({ error: 'Failed to clear session' });
  }
}

module.exports = { processIntent, getConversationHistory, clearConversation };
