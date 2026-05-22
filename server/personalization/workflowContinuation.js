/**
 * MediAI Workflow Continuation
 * Detects "continue booking" / "resume" intents and restores saved workflow state.
 * Enables the assistant to remember unfinished bookings across sessions.
 */

const { getUnfinishedWorkflow } = require('../memory/memoryManager');

// ─── Resume Intent Detection ──────────────────────────────────────────────────

const RESUME_PATTERNS = [
  /continue\s+(booking|appointment|scheduling|my\s+booking)/i,
  /resume\s+(booking|appointment|my\s+booking)/i,
  /finish\s+(booking|my\s+appointment)/i,
  /complete\s+(the\s+)?(booking|appointment)/i,
  /where\s+did\s+i\s+leave\s+off/i,
  /continue\s+where\s+i\s+left/i,
  /pick\s+up\s+where/i,
  /go\s+back\s+to\s+(booking|my\s+appointment)/i,
  /i\s+was\s+booking/i,
  /my\s+unfinished\s+(booking|appointment)/i,
];

/**
 * Check if user's message is requesting to resume a previous workflow.
 *
 * @param {string} text - User message
 * @returns {boolean}
 */
function isResumeIntent(text) {
  if (!text) return false;
  return RESUME_PATTERNS.some(pattern => pattern.test(text));
}

// ─── Workflow Continuation ────────────────────────────────────────────────────

/**
 * Attempt to resume an unfinished workflow for the user.
 * Returns an action response to continue the booking flow.
 *
 * @param {string} userId
 * @returns {Promise<Object|null>} Action response or null if no saved workflow
 */
async function resumeWorkflow(userId) {
  try {
    const workflow = await getUnfinishedWorkflow(userId);
    if (!workflow) return null;

    const { type, step, data } = workflow;

    if (type === 'booking') {
      return buildBookingResumeResponse(step, data);
    }

    if (type === 'rescheduling') {
      return buildReschedulingResumeResponse(step, data);
    }

    return {
      action: 'reply',
      reply: `I found an unfinished task from your last session. You were in the middle of ${type}. How can I help you continue?`,
    };
  } catch (error) {
    console.error('[WorkflowContinuation] resumeWorkflow error:', error?.message);
    return null;
  }
}

// ─── Booking Resume Responses ─────────────────────────────────────────────────

function buildBookingResumeResponse(step, data = {}) {
  switch (step) {
    case 'select_doctor':
      return {
        action: 'search_doctors',
        specialization: data.specialization || null,
        reply: `Welcome back! 👋 You were looking for a **${data.specialization || 'doctor'}** to book an appointment. Let me pull up those results again.`,
        resumedWorkflow: true,
      };

    case 'select_slot':
      return {
        action: 'open_booking',
        doctorId: data.doctorId || null,
        doctorName: data.doctorName || null,
        reply: `Welcome back! 👋 You were booking an appointment with **Dr. ${data.doctorName || 'your selected doctor'}**. Let's pick a time slot to finish your booking.`,
        resumedWorkflow: true,
      };

    case 'confirm':
      return {
        action: 'open_booking',
        doctorId: data.doctorId || null,
        doctorName: data.doctorName || null,
        selectedSlot: data.selectedSlot || null,
        reply: `Welcome back! 👋 You were just about to confirm your appointment with **Dr. ${data.doctorName || 'your doctor'}**${data.selectedSlot ? ` on **${data.selectedSlot}**` : ''}. Would you like to confirm it now?`,
        requiresConfirmation: true,
        resumedWorkflow: true,
      };

    default:
      return {
        action: 'open_booking',
        doctorId: data.doctorId || null,
        reply: `Welcome back! 👋 You had an unfinished appointment booking. Let's get that sorted for you. What type of doctor are you looking for?`,
        resumedWorkflow: true,
      };
  }
}

function buildReschedulingResumeResponse(step, data = {}) {
  return {
    action: 'reschedule_appointment',
    appointmentId: data.appointmentId || null,
    reply: `Welcome back! 👋 You were rescheduling an appointment${data.doctorName ? ` with **Dr. ${data.doctorName}**` : ''}. Would you like to continue rescheduling?`,
    requiresConfirmation: true,
    resumedWorkflow: true,
  };
}

// ─── Workflow State Builder ───────────────────────────────────────────────────

/**
 * Build a workflow state object from action response data.
 * Called after booking actions to persist partial state.
 *
 * @param {string} type - 'booking' | 'rescheduling'
 * @param {string} step - current workflow step
 * @param {Object} data - partial booking data
 * @returns {Object} workflow state
 */
function buildWorkflowState(type, step, data) {
  return { type, step, data };
}

module.exports = {
  isResumeIntent,
  resumeWorkflow,
  buildWorkflowState,
};
