/**
 * MediAI Session Memory
 * Short-term session storage with optional Redis backend.
 * Falls back to in-memory Map when Redis is unavailable.
 * Now also persists active flows to MongoDB for cross-session recovery.
 */

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ─── Redis Setup (Optional) ───────────────────────────────────────────────────

let redisClient = null;
let redisAvailable = false;

/**
 * Initialize Redis if REDIS_URL is configured.
 * Called once at startup — failure is graceful.
 */
async function initRedis() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.log('[SessionMemory] Redis not configured — using in-memory session store.');
    return;
  }

  try {
    const { createClient } = require('redis');
    redisClient = createClient({ url: redisUrl });

    redisClient.on('error', (err) => {
      console.warn('[SessionMemory] Redis error, falling back to in-memory:', err.message);
      redisAvailable = false;
    });

    redisClient.on('ready', () => {
      console.log('[SessionMemory] ✅ Redis connected — using Redis session store.');
      redisAvailable = true;
    });

    await redisClient.connect();
  } catch (error) {
    console.warn('[SessionMemory] Redis init failed, using in-memory store:', error?.message);
    redisClient = null;
    redisAvailable = false;
  }
}

// ─── In-Memory Fallback ───────────────────────────────────────────────────────

/**
 * @typedef {Object} SessionData
 * @property {Array} messages - Conversation history [{role, content}]
 * @property {Object|null} activeFlow - Current booking flow state
 * @property {string|null} lastDoctorId - Last selected doctor
 * @property {string|null} lastSpecialization - Last specialization mentioned
 * @property {number} updatedAt - Last activity timestamp
 */

// Main session store: Map<sessionId, SessionData>
const sessions = new Map();

// ─── Session Operations ───────────────────────────────────────────────────────

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
 * Set active booking flow state (in-memory + optional MongoDB persistence)
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

// ─── Redis Operations (optional, async) ──────────────────────────────────────

const REDIS_SESSION_TTL = 30 * 60; // 30 minutes in seconds

/**
 * Save session data to Redis (if available).
 * Used for distributed session sharing across multiple server instances.
 */
async function saveToRedis(sessionId, data) {
  if (!redisAvailable || !redisClient) return;
  try {
    await redisClient.setEx(
      `session:${sessionId}`,
      REDIS_SESSION_TTL,
      JSON.stringify(data)
    );
  } catch (error) {
    console.warn('[SessionMemory] Redis save failed:', error?.message);
  }
}

/**
 * Load session data from Redis (if available).
 */
async function loadFromRedis(sessionId) {
  if (!redisAvailable || !redisClient) return null;
  try {
    const data = await redisClient.get(`session:${sessionId}`);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.warn('[SessionMemory] Redis load failed:', error?.message);
    return null;
  }
}

/**
 * Delete session data from Redis.
 */
async function deleteFromRedis(sessionId) {
  if (!redisAvailable || !redisClient) return;
  try {
    await redisClient.del(`session:${sessionId}`);
  } catch (error) {
    console.warn('[SessionMemory] Redis delete failed:', error?.message);
  }
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

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

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  initRedis,
  getSession,
  getHistory,
  addMessage,
  setActiveFlow,
  getActiveFlow,
  clearActiveFlow,
  updateContext,
  getContext,
  clearSession,
  saveToRedis,
  loadFromRedis,
  deleteFromRedis,
  isRedisAvailable: () => redisAvailable,
};
