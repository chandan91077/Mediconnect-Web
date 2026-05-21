/**
 * MediAI Assistant Store (Zustand)
 * Global state for the AI assistant — messages, voice, flow state.
 */

import { create } from 'zustand';

export type MessageRole = 'user' | 'assistant' | 'system';

export interface AssistantMessage {
  id: string;
  role: MessageRole;
  content: string;
  action?: string;
  params?: Record<string, unknown>;
  timestamp: Date;
  isLoading?: boolean;
}

export interface BookingFlow {
  step: 'specialization' | 'doctor' | 'datetime' | 'confirm';
  specialization?: string;
  doctorId?: string;
  doctorName?: string;
  date?: string;
  time?: string;
  parsedDate?: Date | null;
  parsedTime?: string | null;
}

interface AssistantState {
  // UI State
  isOpen: boolean;
  isListening: boolean;
  isThinking: boolean;
  hasUnread: boolean;
  isVoiceMode: boolean;           // Siri-style voice overlay open
  voiceTranscript: string;        // Live transcript while speaking
  voiceStatus: 'idle' | 'listening' | 'thinking' | 'done' | 'error';
  lastSpokenCommand: string;      // Last command for display

  // Conversation
  messages: AssistantMessage[];
  sessionId: string;

  // Active flow
  activeFlow: BookingFlow | null;

  // UI Booking State (driven by voice)
  uiBookingDate: Date | null;
  uiBookingTime: string | null;
  triggerBookingSubmit: boolean;

  // Actions
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  setListening: (listening: boolean) => void;
  setThinking: (thinking: boolean) => void;
  setVoiceMode: (on: boolean) => void;
  setVoiceTranscript: (text: string) => void;
  setVoiceStatus: (status: AssistantState['voiceStatus']) => void;
  setLastSpokenCommand: (cmd: string) => void;
  addMessage: (msg: Omit<AssistantMessage, 'id' | 'timestamp'>) => string;
  updateMessage: (id: string, updates: Partial<AssistantMessage>) => void;
  removeMessage: (id: string) => void;
  clearMessages: () => void;
  setActiveFlow: (flow: BookingFlow | null) => void;
  markRead: () => void;
  generateSessionId: () => string;

  // UI Booking Setters
  setUiBookingDate: (date: Date | null) => void;
  setUiBookingTime: (time: string | null) => void;
  setTriggerBookingSubmit: (trigger: boolean) => void;
}


function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useAssistantStore = create<AssistantState>((set, get) => ({
  // Initial state
  isOpen: false,
  isListening: false,
  isThinking: false,
  hasUnread: false,
  isVoiceMode: false,
  voiceTranscript: '',
  voiceStatus: 'idle',
  lastSpokenCommand: '',
  messages: [
    {
      id: 'welcome',
      role: 'assistant',
      content: "👋 Hi! I'm **MediAI**, your healthcare assistant. I can help you book appointments, find doctors, or navigate the app. How can I help you today?",
      timestamp: new Date(),
    },
  ],
  sessionId: generateId(),
  activeFlow: null,

  uiBookingDate: null,
  uiBookingTime: null,
  triggerBookingSubmit: false,

  // UI Actions
  setOpen: (open) => set({ isOpen: open, hasUnread: open ? false : get().hasUnread }),
  toggleOpen: () => {
    const open = !get().isOpen;
    set({ isOpen: open, hasUnread: open ? false : get().hasUnread });
  },
  setListening: (listening) => set({ isListening: listening }),
  setThinking: (thinking) => set({ isThinking: thinking }),
  setVoiceMode: (on) => set({ isVoiceMode: on, voiceTranscript: on ? '' : get().voiceTranscript }),
  setVoiceTranscript: (text) => set({ voiceTranscript: text }),
  setVoiceStatus: (status) => set({ voiceStatus: status }),
  setLastSpokenCommand: (cmd) => set({ lastSpokenCommand: cmd }),


  // Message Actions
  addMessage: (msg) => {
    const id = generateId();
    const message: AssistantMessage = {
      ...msg,
      id,
      timestamp: new Date(),
    };
    set((state) => ({
      messages: [...state.messages, message],
      hasUnread: !state.isOpen && msg.role === 'assistant',
    }));
    return id;
  },

  updateMessage: (id, updates) => {
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, ...updates } : m
      ),
    }));
  },

  removeMessage: (id) => {
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== id),
    }));
  },

  clearMessages: () => {
    set({
      messages: [
        {
          id: 'welcome',
          role: 'assistant',
          content: "👋 Hi! I'm **MediAI**, your healthcare assistant. How can I help you today?",
          timestamp: new Date(),
        },
      ],
      sessionId: generateId(),
      activeFlow: null,
    });
  },

  // Flow
  setActiveFlow: (flow) => set({ activeFlow: flow }),

  // Read state
  markRead: () => set({ hasUnread: false }),

  // Generate a new session ID
  generateSessionId: () => {
    const id = generateId();
    set({ sessionId: id });
    return id;
  },

  setUiBookingDate: (date) => set({ uiBookingDate: date }),
  setUiBookingTime: (time) => set({ uiBookingTime: time }),
  setTriggerBookingSubmit: (trigger) => set({ triggerBookingSubmit: trigger }),
}));
