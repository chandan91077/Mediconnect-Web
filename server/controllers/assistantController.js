/**
 * MediAI Assistant Controller
 * Handles intent processing, session memory, and AI responses.
 */

const { callGPT, localFallbackParse } = require('../ai/gptClient');
const { buildSystemPrompt } = require('../ai/systemPrompt');
const {
  getHistory,
  addMessage,
  getContext,
  updateContext,
  clearSession,
} = require('../ai/sessionMemory');
const { emitToUser } = require('../socket/assistantSocket');

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
    const userName = user?.name || 'User';
    const userId = user?._id?.toString();

    // Step 1: Try local rule-based parser first (faster, no API cost)
    const localResult = localFallbackParse(text, pageContext);

    let actionResponse;

    if (localResult) {
      // Local parse succeeded — use it
      actionResponse = localResult;
    } else {
      // Step 2: GPT-4.1 intent detection
      const systemPrompt = buildSystemPrompt(role, userName);
      const history = getHistory(sessionId, 8);
      const context = getContext(sessionId);

      // Enrich user message with context if available
      let enrichedText = text;
      if (context.lastSpecialization) {
        enrichedText = `[Context: User was looking for ${context.lastSpecialization}]\n${enrichedText}`;
      }
      if (pageContext) {
        enrichedText = `[Screen Content: ${pageContext}]\n${enrichedText}`;
      }

      actionResponse = await callGPT(systemPrompt, history, enrichedText);
    }

    // Step 3: Update session memory
    addMessage(sessionId, 'user', text);
    addMessage(sessionId, 'assistant', actionResponse.reply || '');

    // Update context from action response
    if (actionResponse.specialization) {
      updateContext(sessionId, { lastSpecialization: actionResponse.specialization });
    }

    // Step 4: Emit response via Socket.IO (realtime delivery)
    if (userId) {
      emitToUser(userId, {
        type: 'action',
        ...actionResponse,
        timestamp: new Date().toISOString(),
      });
    }

    // Step 5: Return HTTP response
    return res.json({
      success: true,
      sessionId,
      ...actionResponse,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[MediAI] processIntent error:', error);

    // Graceful fallback response
    return res.json({
      success: false,
      action: 'reply',
      reply: "I'm having trouble understanding that right now. Please try again or use the navigation menu. 🩺",
      timestamp: new Date().toISOString(),
    });
  }
}

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
