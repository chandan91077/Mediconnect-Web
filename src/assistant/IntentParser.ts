/**
 * MediAI Intent Parser
 * Sends user text to backend AI and returns a structured ActionResponse.
 */

import axios from 'axios';

// Strip trailing /api if present — we build the full path ourselves
const RAW_API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const API_BASE = RAW_API_URL.replace(/\/api\/?$/, '');


export interface ActionResponse {
  action: string;
  reply: string;
  page?: string;
  specialization?: string;
  doctorId?: string;
  doctorName?: string;
  specialist?: string;
  reason?: string;
  question?: string;
  context?: string;
  filter?: string;          // doctor name for name-based search
  appointmentId?: string;
  newTime?: string;
  requiresConfirmation?: boolean;
  followUp?: string;
  timestamp?: string;
}


/**
 * Parse user intent via backend AI endpoint
 */
export async function parseIntent(
  text: string,
  sessionId: string,
  token: string | null,
  pageContext?: string
): Promise<ActionResponse> {
  if (!text.trim()) {
    return {
      action: 'reply',
      reply: "I didn't catch that. Could you please repeat? 🎤",
    };
  }

  try {
    const response = await axios.post(
      `${API_BASE}/api/assistant/intent`,
      { text: text.trim(), sessionId, pageContext },
      {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        timeout: 15000, // 15s timeout
      }
    );

    const data = response.data;

    if (!data.action) {
      return {
        action: 'reply',
        reply: data.reply || "I'm not sure how to help with that. Please try again.",
      };
    }

    return data as ActionResponse;
  } catch (error: unknown) {
    console.error('[IntentParser] API error:', error);

    // Network error fallback
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') {
        return {
          action: 'reply',
          reply: "That took too long. Please check your connection and try again. 🌐",
        };
      }
      if (error.response?.status === 401) {
        return {
          action: 'reply',
          reply: "Please log in to use the AI assistant. 🔐",
        };
      }
    }

    return {
      action: 'reply',
      reply: "I'm having trouble connecting right now. Please try again in a moment. 🩺",
    };
  }
}
