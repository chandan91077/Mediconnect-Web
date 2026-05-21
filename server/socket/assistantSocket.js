/**
 * MediAI Socket.IO Handler
 * Manages real-time assistant channels via Socket.IO rooms.
 */

let io = null;

/**
 * Initialize the Socket.IO assistant handler
 * @param {Object} socketIO - The Socket.IO server instance
 */
function initAssistantSocket(socketIO) {
  io = socketIO;

  io.on('connection', (socket) => {
    console.log(`[MediAI Socket] Client connected: ${socket.id}`);

    // User joins their personal room for targeted messages
    socket.on('assistant:join', (data) => {
      const { userId, sessionId } = data;
      if (userId) {
        socket.join(`user:${userId}`);
        console.log(`[MediAI Socket] User ${userId} joined room`);
      }
      if (sessionId) {
        socket.join(`session:${sessionId}`);
      }
    });

    // User leaves their room
    socket.on('assistant:leave', (data) => {
      const { userId } = data;
      if (userId) {
        socket.leave(`user:${userId}`);
      }
    });

    socket.on('disconnect', () => {
      console.log(`[MediAI Socket] Client disconnected: ${socket.id}`);
    });
  });
}

/**
 * Push an assistant response to a specific user's room
 * @param {string} userId - Target user ID
 * @param {Object} payload - { reply, action, params, ... }
 */
function emitToUser(userId, payload) {
  if (!io) return;
  io.to(`user:${userId}`).emit('assistant:response', payload);
}

/**
 * Push a notification to a specific user
 * @param {string} userId - Target user ID
 * @param {Object} notification - { type, message, data }
 */
function emitNotification(userId, notification) {
  if (!io) return;
  io.to(`user:${userId}`).emit('assistant:notification', notification);
}

/**
 * Broadcast a system-wide message (admin use)
 * @param {Object} message - Broadcast payload
 */
function broadcastToAll(message) {
  if (!io) return;
  io.emit('assistant:broadcast', message);
}

/**
 * Get the Socket.IO instance (for use in other modules)
 */
function getIO() {
  return io;
}

module.exports = {
  initAssistantSocket,
  emitToUser,
  emitNotification,
  broadcastToAll,
  getIO,
};
