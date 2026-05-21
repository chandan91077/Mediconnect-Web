/**
 * MediAI Assistant Routes
 */

const express = require('express');
const router = express.Router();
const {
  processIntent,
  getConversationHistory,
  clearConversation,
} = require('../controllers/assistantController');

// Auth middleware — reuse the project's existing middleware
const { protect } = require('../middleware/authMiddleware');

// POST /api/assistant/intent — process voice/text command
router.post('/intent', protect, processIntent);

// GET /api/assistant/history — get session conversation history
router.get('/history', protect, getConversationHistory);

// DELETE /api/assistant/session — clear session memory
router.delete('/session', protect, clearConversation);

module.exports = router;
