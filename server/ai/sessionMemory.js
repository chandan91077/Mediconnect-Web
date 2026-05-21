/**
 * MediAI Session Memory
 * In-memory session storage — Redis-ready interface.
 * Stores conversation history and active flow state per session.
 */

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Main session store: Map<sessionId, SessionData>
const sessions = new Map();

/**
 * @typedef {Object} SessionData
 * @property {Array} messages - Conversation history [{role, content}]
 * @property {Object|null} activeFlow - Current booking flow state
 * @property {string|null} lastDoctorId - Last selected doctor
 * @property {string|null} lastSpecialization - Last specialization mentioned
 * @property {number} updatedAt - Last activity timestamp
 */

/**
 * Get or create session data for a sessionId
 */
function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      messages: [],
      activeFlow: null,
      lastDoctorId: null,
      lastSpecialization: null,
      updatedAt: Date.now(),
    });
  }
  const session = sessions.get(sessionId);
  session.updatedAt = Date.now();
  return session;
}

/**
 * Get conversation history for a session (last N messages for context window)
 */
function getHistory(sessionId, limit = 10) {
  const session = getSession(sessionId);
  return session.messages.slice(-limit);
}

/**
 * Append a message to session history
 */
function addMessage(sessionId, role, content) {
  const session = getSession(sessionId);
  session.messages.push({ role, content });
  // Keep last 50 messages to avoid infinite growth
  if (session.messages.length > 50) {
    session.messages = session.messages.slice(-50);
  }
  session.updatedAt = Date.now();
}

/**
 * Set active booking flow state
 */
function setActiveFlow(sessionId, flow) {
  const session = getSession(sessionId);
  session.activeFlow = flow;
  session.updatedAt = Date.now();
}

/**
 * Get active booking flow state
 */
function getActiveFlow(sessionId) {
  return getSession(sessionId).activeFlow;
}

/**
 * Clear active flow (booking completed or cancelled)
 */
function clearActiveFlow(sessionId) {
  const session = getSession(sessionId);
  session.activeFlow = null;
  session.updatedAt = Date.now();
}

/**
 * Update context info (last doctor, specialization, etc.)
 */
function updateContext(sessionId, context) {
  const session = getSession(sessionId);
  Object.assign(session, context, { updatedAt: Date.now() });
}

/**
 * Get full context for a session
 */
function getContext(sessionId) {
  const session = getSession(sessionId);
  return {
    activeFlow: session.activeFlow,
    lastDoctorId: session.lastDoctorId,
    lastSpecialization: session.lastSpecialization,
  };
}

/**
 * Clear a session completely
 */
function clearSession(sessionId) {
  sessions.delete(sessionId);
}

/**
 * Cleanup expired sessions (run periodically)
 */
function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.updatedAt > SESSION_TTL_MS) {
      sessions.delete(sessionId);
    }
  }
}

// Auto-cleanup every 10 minutes
setInterval(cleanupExpiredSessions, 10 * 60 * 1000);

module.exports = {
  getSession,
  getHistory,
  addMessage,
  setActiveFlow,
  getActiveFlow,
  clearActiveFlow,
  updateContext,
  getContext,
  clearSession,
};
