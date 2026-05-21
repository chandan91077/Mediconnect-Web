/**
 * MediAI Assistant Popup
 * Glassmorphism chat popup with voice, text, Socket.IO, and action execution.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import {
  Mic,
  MicOff,
  Send,
  X,
  Trash2,
  Bot,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';

import { useAssistantStore } from '@/store/assistantStore';
import { useAuthContext } from '@/contexts/AuthContext';
import { voiceService } from '@/assistant/VoiceService';
import { parseIntent } from '@/assistant/IntentParser';
import { executeAction } from '@/assistant/ActionEngine';
import { AssistantMessageBubble } from './AssistantMessage';
import { QuickActions } from './QuickActions';
import { VoiceWave } from './VoiceWave';

// Strip trailing /api from env URL — same logic as IntentParser
const RAW_API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const SOCKET_BASE = RAW_API_URL.replace(/\/api\/?$/, '');


export function AssistantPopup() {
  const navigate = useNavigate();
  const { user, session } = useAuthContext();

  const {
    isOpen,
    isListening,
    isThinking,
    messages,
    sessionId,
    activeFlow,
    setOpen,
    setListening,
    setThinking,
    addMessage,
    updateMessage,
    clearMessages,
    setActiveFlow,
  } = useAssistantStore();

  const [inputText, setInputText] = useState('');
  const [isSpeakEnabled, setIsSpeakEnabled] = useState(false);
  const [socketReady, setSocketReady] = useState(false);
  const [interimText, setInterimText] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const token = session?.token || localStorage.getItem('token');

  // ─── Socket.IO Setup ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !isOpen) return;

    const socket = io(SOCKET_BASE, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });

    socket.on('connect', () => {
      setSocketReady(true);
      socket.emit('assistant:join', {
        userId: user._id || user.id,
        sessionId,
      });
    });

    socket.on('assistant:notification', (notification: { message: string; type: string }) => {
      addMessage({
        role: 'assistant',
        content: `🔔 ${notification.message}`,
        action: 'notification',
      });
    });

    socket.on('disconnect', () => {
      setSocketReady(false);
    });

    socketRef.current = socket;

    return () => {
      socket.emit('assistant:leave', { userId: user._id || user.id });
      socket.disconnect();
      setSocketReady(false);
    };
  }, [user, isOpen, sessionId, addMessage]);

  // ─── Auto-scroll messages ──────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ─── Focus input when popup opens ─────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  // ─── Voice service callbacks ───────────────────────────────────────────────
  useEffect(() => {
    voiceService.setCallbacks({
      onResult: (transcript, isFinal) => {
        if (isFinal) {
          setInterimText('');
          setInputText('');
          handleSubmit(transcript);
        } else {
          setInterimText(transcript);
        }
      },
      onError: (error) => {
        setListening(false);
        setInterimText('');
        addMessage({ role: 'assistant', content: `⚠️ ${error}` });
      },
      onStateChange: (state) => {
        setListening(state === 'listening');
        if (state === 'stopped') setInterimText('');
      },
    });
  }, [sessionId, activeFlow]);

  // ─── Submit handler ────────────────────────────────────────────────────────
  const handleSubmit = useCallback(
    async (text: string = inputText) => {
      const trimmed = text.trim();
      if (!trimmed || isThinking) return;

      setInputText('');
      setInterimText('');

      // Add user message
      addMessage({ role: 'user', content: trimmed });

      // Add loading spinner bubble
      const loadingId = addMessage({ role: 'assistant', content: '', isLoading: true });

      setThinking(true);

      try {
        // Parse intent via backend AI
        const response = await parseIntent(trimmed, sessionId, token);

        // Speak the reply if TTS enabled
        if (isSpeakEnabled && response.reply) {
          voiceService.speak(response.reply);
        }

        // Execute the action — it will replace the loading bubble via updateMessage(loadingId)
        executeAction(response, {
          navigate,
          addMessage,
          updateMessage,
          loadingId,
          setThinking,
          setOpen,
          activeFlow,
          setActiveFlow,
          userText: trimmed,
        });
      } catch {
        updateMessage(loadingId, {
          isLoading: false,
          content: "Sorry, I couldn't process that. Please try again. 🩺",
        });
      } finally {
        setThinking(false);
      }
    },
    [inputText, isThinking, sessionId, token, activeFlow, isSpeakEnabled, navigate]
  );

  // ─── Voice toggle ──────────────────────────────────────────────────────────
  const toggleVoice = () => {
    if (isListening) {
      voiceService.stopListening();
      setListening(false);
    } else {
      if (!voiceService.isSupported()) {
        addMessage({
          role: 'assistant',
          content: "Voice recognition isn't supported in this browser. Please type your command instead. 💬",
        });
        return;
      }
      voiceService.startListening();
    }
  };

  // ─── Quick action handler ──────────────────────────────────────────────────
  const handleQuickAction = (command: string) => {
    handleSubmit(command);
  };

  // ─── Keyboard handler ──────────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (!isOpen) return null;

  const showQuickActions = messages.length <= 1;

  return (
    <div
      id="mediAI-assistant-popup"
      className="
        fixed bottom-24 right-6 z-50
        w-[380px] max-w-[calc(100vw-2rem)]
        h-[540px] max-h-[calc(100vh-8rem)]
        flex flex-col
        rounded-2xl overflow-hidden
        shadow-2xl shadow-black/50
        border border-white/10
        animate-popup-in
      "
      style={{
        background: 'linear-gradient(135deg, rgba(10,15,30,0.97) 0%, rgba(13,20,40,0.97) 50%, rgba(8,25,35,0.97) 100%)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
      }}
    >
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0"
        style={{
          background: 'linear-gradient(90deg, rgba(45,212,191,0.08) 0%, rgba(6,182,212,0.05) 100%)',
        }}
      >
        <div className="flex items-center gap-2.5">
          {/* AI avatar with animated ring */}
          <div className="relative">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center shadow-lg shadow-teal-500/30">
              <Bot size={18} className="text-white" />
            </div>
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-gray-900 ${
                socketReady ? 'bg-emerald-400' : 'bg-yellow-400'
              }`}
            />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold text-white">MediAI</h3>
              <Sparkles size={12} className="text-teal-400" />
            </div>
            <p className="text-[10px] text-white/40">
              {isListening
                ? '🎤 Listening...'
                : isThinking
                ? '⏳ Thinking...'
                : activeFlow
                ? `📋 Booking — Step: ${activeFlow.step}`
                : 'Your Healthcare Assistant'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* TTS toggle */}
          <button
            onClick={() => setIsSpeakEnabled((v) => !v)}
            title={isSpeakEnabled ? 'Disable voice reply' : 'Enable voice reply'}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/8 transition-all"
          >
            {isSpeakEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
          {/* Clear */}
          <button
            onClick={clearMessages}
            title="Clear conversation"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-rose-400 hover:bg-white/8 transition-all"
          >
            <Trash2 size={14} />
          </button>
          {/* Close */}
          <button
            onClick={() => setOpen(false)}
            id="mediAI-close-button"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/8 transition-all"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 scrollbar-hide">
        {messages.map((msg) => (
          <AssistantMessageBubble key={msg.id} message={msg} />
        ))}

        {/* Quick actions — shown initially */}
        {showQuickActions && (
          <div className="mt-2">
            <QuickActions onAction={handleQuickAction} disabled={isThinking} />
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Voice Wave Indicator ── */}
      {(isListening || interimText) && (
        <div className="px-4 py-2 border-t border-white/5 bg-teal-500/5 flex-shrink-0">
          <div className="flex items-center gap-3">
            <VoiceWave isActive={isListening} barCount={6} size="sm" />
            <span className="text-xs text-teal-300/80 italic truncate flex-1">
              {interimText || 'Listening for your voice...'}
            </span>
          </div>
        </div>
      )}

      {/* ── Active Booking Flow Indicator ── */}
      {activeFlow && !isListening && (
        <div className="px-4 py-1.5 bg-violet-500/10 border-t border-violet-500/20 flex-shrink-0">
          <p className="text-xs text-violet-300">
            📋 Booking in progress — Step: <strong>{activeFlow.step}</strong>
            {activeFlow.specialization && ` · ${activeFlow.specialization}`}
          </p>
        </div>
      )}

      {/* ── Input area ── */}
      <div className="flex-shrink-0 px-3 py-3 border-t border-white/8">
        <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2 focus-within:border-teal-500/50 focus-within:bg-white/7 transition-all duration-200">
          {/* Mic button */}
          <button
            id="mediAI-mic-button"
            onClick={toggleVoice}
            title={isListening ? 'Stop listening' : 'Start voice input'}
            className={`
              w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
              transition-all duration-200
              ${isListening
                ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'
                : 'text-white/40 hover:text-teal-400 hover:bg-teal-500/10'
              }
            `}
          >
            {isListening ? <MicOff size={15} /> : <Mic size={15} />}
          </button>

          {/* Text input */}
          <input
            ref={inputRef}
            id="mediAI-text-input"
            type="text"
            value={interimText || inputText}
            onChange={(e) => {
              if (!isListening) setInputText(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            placeholder={isListening ? 'Listening...' : 'Ask MediAI anything...'}
            disabled={isListening}
            className="
              flex-1 bg-transparent text-sm text-white placeholder-white/30
              focus:outline-none disabled:cursor-not-allowed
              min-w-0
            "
          />

          {/* Send button */}
          <button
            id="mediAI-send-button"
            onClick={() => handleSubmit()}
            disabled={(!inputText.trim() && !interimText) || isThinking || isListening}
            className="
              w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
              bg-gradient-to-r from-teal-500 to-cyan-500
              text-white shadow-lg shadow-teal-500/30
              transition-all duration-200
              hover:from-teal-400 hover:to-cyan-400 hover:scale-105
              disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100
            "
          >
            <Send size={13} />
          </button>
        </div>

        {/* Footer hint */}
        <p className="text-center text-[10px] text-white/20 mt-2">
          MediAI never auto-pays · never confirms without your approval
        </p>
      </div>
    </div>
  );
}
