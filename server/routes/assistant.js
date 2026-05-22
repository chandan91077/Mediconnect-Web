/**
 * MediAI Assistant Routes
 * Includes memory management APIs for personalized AI healthcare companion.
 */

const express = require('express');
const router = express.Router();
const {
  processIntent,
  getConversationHistory,
  clearConversation,
} = require('../controllers/assistantController');

const {
  getMemoryProfile,
  updateMemoryProfile,
  searchMemory,
  saveMemory,
  deleteMemory,
  getRecentMemories,
  getWorkflow,
  clearWorkflow,
  clearAllMemory,
} = require('../controllers/memoryController');

// Auth middleware — reuse the project's existing middleware
const { protect } = require('../middleware/authMiddleware');

// ─── Core Assistant Routes ────────────────────────────────────────────────────

// POST /api/assistant/intent — process voice/text command (RAG-enhanced)
router.post('/intent', protect, processIntent);

// GET /api/assistant/history — get session conversation history
router.get('/history', protect, getConversationHistory);

// DELETE /api/assistant/session — clear session memory
router.delete('/session', protect, clearConversation);

// ─── Memory Profile Routes ────────────────────────────────────────────────────

// GET /api/assistant/memory/profile — get user's long-term health memory profile
router.get('/memory/profile', protect, getMemoryProfile);

// PUT /api/assistant/memory/profile — update AI preferences and health conditions
router.put('/memory/profile', protect, updateMemoryProfile);

// ─── Memory Search Routes ─────────────────────────────────────────────────────

// GET /api/assistant/memory/search?q=<query> — semantic search over user memories
router.get('/memory/search', protect, searchMemory);

// GET /api/assistant/memory/recent — get recent conversation memories
router.get('/memory/recent', protect, getRecentMemories);

// ─── Memory CRUD Routes ───────────────────────────────────────────────────────

// POST /api/assistant/memory/save — manually save a memory entry
router.post('/memory/save', protect, saveMemory);

// DELETE /api/assistant/memory/all — delete ALL memories (GDPR data erasure)
router.delete('/memory/all', protect, clearAllMemory);

// DELETE /api/assistant/memory/:memoryId — delete a specific memory entry
router.delete('/memory/:memoryId', protect, deleteMemory);

// ─── Workflow Routes ──────────────────────────────────────────────────────────

// GET /api/assistant/memory/workflow — get unfinished workflow state
router.get('/memory/workflow', protect, getWorkflow);

// DELETE /api/assistant/memory/workflow — clear unfinished workflow
router.delete('/memory/workflow', protect, clearWorkflow);

module.exports = router;
