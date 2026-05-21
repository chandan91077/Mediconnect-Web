/**
 * MediAI Floating Assistant Button
 * Single tap → Siri-style voice overlay
 * Long press (500ms) → open chat popup
 */

import { useRef } from 'react';
import { Bot, Mic, MessageCircle } from 'lucide-react';
import { useAssistantStore } from '@/store/assistantStore';
import { VoiceWave } from './VoiceWave';

export function AssistantButton() {
  const {
    isOpen,
    toggleOpen,
    isListening,
    isThinking,
    hasUnread,
    isVoiceMode,
    voiceStatus,
    setVoiceMode,
    setOpen,
  } = useAssistantStore();

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  // ── Press handlers: tap = voice, hold = chat ──────────────────────────────
  const handlePressStart = () => {
    didLongPress.current = false;
    pressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      // Long press → open chat popup
      setOpen(true);
    }, 480);
  };

  const handlePressEnd = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    if (!didLongPress.current) {
      // Quick tap → toggle voice overlay
      if (isVoiceMode) {
        setVoiceMode(false);
      } else {
        setOpen(false); // close chat if open
        setVoiceMode(true);
      }
    }
  };

  const isActiveVoice = isVoiceMode && (voiceStatus === 'listening' || voiceStatus === 'thinking');

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-center gap-2">

      {/* Voice wave above button when listening */}
      {isListening && !isVoiceMode && (
        <div className="bg-gray-900/90 backdrop-blur-md border border-teal-500/30 rounded-full px-4 py-2 shadow-xl">
          <VoiceWave isActive={true} barCount={7} size="md" />
        </div>
      )}

      <div className="relative group">
        {/* Siri-style pulse rings when voice is active */}
        {isActiveVoice && (
          <>
            <span className="absolute inset-0 rounded-full animate-ping-slow bg-teal-400/25" />
            <span className="absolute -inset-3 rounded-full animate-ping-slower bg-teal-400/12" />
            <span className="absolute -inset-6 rounded-full animate-ping-slowest bg-teal-400/6" />
          </>
        )}

        {/* Thinking glow */}
        {isThinking && (
          <span className="absolute -inset-2 rounded-full bg-violet-500/20 blur-md animate-pulse-slow" />
        )}

        {/* Static glow */}
        <span
          className={`
            absolute -inset-1 rounded-full transition-all duration-500
            ${isOpen
              ? 'bg-gradient-to-r from-teal-500/30 to-cyan-500/30 blur-md scale-110'
              : isVoiceMode
              ? 'bg-teal-400/40 blur-md scale-115 animate-pulse-slow'
              : 'bg-teal-500/20 blur-sm scale-100'
            }
          `}
        />

        {/* Main button */}
        <button
          id="mediAI-assistant-button"
          onMouseDown={handlePressStart}
          onMouseUp={handlePressEnd}
          onMouseLeave={() => {
            if (pressTimer.current) clearTimeout(pressTimer.current);
          }}
          onTouchStart={handlePressStart}
          onTouchEnd={handlePressEnd}
          aria-label={isVoiceMode ? 'Stop voice — MediAI' : 'Tap to speak — MediAI (hold for chat)'}
          className={`
            relative w-14 h-14 rounded-full
            flex items-center justify-center
            transition-all duration-300 ease-out
            focus:outline-none focus:ring-2 focus:ring-teal-400 focus:ring-offset-2 focus:ring-offset-transparent
            shadow-2xl select-none
            ${isActiveVoice
              ? 'bg-gradient-to-br from-teal-400 to-cyan-400 scale-110 shadow-teal-400/60'
              : isVoiceMode
              ? 'bg-gradient-to-br from-teal-500 to-cyan-500 scale-105 shadow-teal-500/50'
              : isOpen
              ? 'bg-gradient-to-br from-teal-400 to-cyan-500 scale-110 shadow-teal-400/40'
              : 'bg-gradient-to-br from-teal-500 to-cyan-600 scale-100 hover:scale-110 shadow-teal-500/40'
            }
          `}
        >
          {/* Icon */}
          <span className="flex items-center justify-center">
            {isListening || isActiveVoice ? (
              <VoiceWave isActive={true} barCount={5} size="sm" color="#fff" />
            ) : isThinking && isVoiceMode ? (
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1 h-1 rounded-full bg-white"
                    style={{ animation: 'thinking-dot 1s ease-in-out infinite', animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </span>
            ) : isVoiceMode ? (
              <Mic size={22} className="text-white" />
            ) : (
              <Bot size={22} className="text-white" />
            )}
          </span>

          {/* Inner shine */}
          <span className="absolute inset-0 rounded-full bg-gradient-to-br from-white/20 to-transparent pointer-events-none" />
        </button>

        {/* Unread badge */}
        {hasUnread && !isOpen && !isVoiceMode && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-gradient-to-br from-rose-500 to-pink-500 border-2 border-white/20 flex items-center justify-center text-white text-[9px] font-bold shadow-lg animate-bounce-subtle">
            •
          </span>
        )}
      </div>

      {/* Tap hint tooltip — shown only on idle */}
      {!isVoiceMode && !isOpen && !isListening && !isThinking && (
        <div className="opacity-0 group-hover:opacity-100 absolute bottom-full mb-3 right-0 transition-opacity duration-200 pointer-events-none">
          <div className="bg-gray-900/95 text-white text-[11px] font-medium px-3 py-1.5 rounded-xl border border-white/10 shadow-xl whitespace-nowrap">
            <span className="text-teal-400">Tap</span> to speak · <span className="text-white/50">Hold</span> for chat
          </div>
        </div>
      )}

      {/* Chat bubble shortcut — shown when voice overlay is open */}
      {isVoiceMode && (
        <button
          onClick={() => { setVoiceMode(false); setOpen(true); }}
          className="w-9 h-9 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/20 transition-all shadow-lg"
          title="Switch to chat"
        >
          <MessageCircle size={15} />
        </button>
      )}

      {/* Voice status label */}
      {isActiveVoice && (
        <div className="text-xs text-teal-300 font-medium animate-pulse-slow">
          {voiceStatus === 'listening' ? 'Listening...' : 'Thinking...'}
        </div>
      )}
    </div>
  );
}
