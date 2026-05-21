/**
 * MediAI Voice Command Overlay — Bottom-Right Siri Panel
 *
 * Behaviour:
 *  • Appears bottom-right above the floating button (no backdrop blur)
 *  • 144px orb with equalizer animation
 *  • Continuous mic — restarts after each command
 *  • Active booking flow handled LOCALLY — mic stays on for each step
 *  • Auto-stops after 5 seconds of silence
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Mic, MicOff, MessageCircle } from 'lucide-react';
import { useAssistantStore } from '@/store/assistantStore';
import { useAuthContext } from '@/contexts/AuthContext';
import { voiceService } from '@/assistant/VoiceService';
import { parseIntent } from '@/assistant/IntentParser';
import { executeAction } from '@/assistant/ActionEngine';
import {
  advanceBookingStep,
  flowToState,
  stateToFlow,
  getBookingPrompt,
  type BookingState,
} from '@/assistant/BookingWorkflow';
import { buildBookingUrl, buildDoctorSearchByNameUrl } from '@/assistant/NavigationController';

export function VoiceCommandOverlay() {
  const navigate = useNavigate();
  const { session } = useAuthContext();

  const {
    isVoiceMode,
    isListening,
    isThinking,
    voiceTranscript,
    voiceStatus,
    lastSpokenCommand,
    sessionId,
    activeFlow,
    setVoiceMode,
    setVoiceTranscript,
    setVoiceStatus,
    setLastSpokenCommand,
    setListening,
    setThinking,
    setActiveFlow,
    setOpen,
    addMessage,
    updateMessage,
    setUiBookingDate,
    setUiBookingTime,
    setTriggerBookingSubmit,
  } = useAssistantStore();

  const token = session?.token || localStorage.getItem('token');
  const isProcessingRef = useRef(false);
  const [aiReplyText, setAiReplyText] = useState('');

  // ─────────────────────────────────────────────────────────────────────────
  // processCommand — handles both booking flow (locally) and normal AI calls
  // ─────────────────────────────────────────────────────────────────────────
  const processCommand = useCallback(async (text: string) => {
    if (!text.trim() || isProcessingRef.current) return;
    isProcessingRef.current = true;

    setLastSpokenCommand(text);
    setVoiceTranscript('');
    setVoiceStatus('thinking');
    setThinking(true);

    // ── If a booking flow is already active, handle each step locally ──────
    if (activeFlow) {
      addMessage({ role: 'user', content: text });
      const loadingId = addMessage({ role: 'assistant', content: '', isLoading: true });

      const currentState = flowToState(activeFlow);
      const { nextState, promptMessage } = advanceBookingStep(currentState, text);

      // --- AUTO-NAVIGATE TO BOOKING PAGE IF DOCTOR NAME PROVIDED ---
      if (currentState.step === 'doctor' && nextState.step === 'datetime' && nextState.doctorName) {
        try {
          // Dynamically import api to avoid circular dependencies if any, or use the standard import
          const { default: api } = await import('@/lib/api');
          const { data: doctors } = await api.get('/doctors');
          const searchTerms = nextState.doctorName!.toLowerCase().split(' ').filter(t => t.length > 2);
          
          const matchedDoctor = doctors.find((d: any) => {
            const fullName = (d.user_id?.full_name || d.profile?.full_name || '').toLowerCase();
            // Exact match
            if (fullName.includes(nextState.doctorName!.toLowerCase())) return true;
            // Fuzzy match: if any word > 2 chars from the spoken name matches the full name
            return searchTerms.some(term => fullName.includes(term));
          });
          
          if (matchedDoctor) {
            nextState.doctorId = matchedDoctor._id || matchedDoctor.id;
            navigate(buildBookingUrl(nextState.doctorId!));
          } else {
            // Fallback: navigate to search results
            navigate(buildDoctorSearchByNameUrl(nextState.doctorName));
          }
        } catch (e) {
          console.error("Failed to fetch doctors for voice navigation", e);
          navigate(buildDoctorSearchByNameUrl(nextState.doctorName));
        }
      }

      updateMessage(loadingId, { isLoading: false, content: promptMessage, action: 'ask_followup' });

      if (nextState.step === 'confirm') {
        // Sync the parsed date/time to the UI store
        if (nextState.parsedDate) setUiBookingDate(nextState.parsedDate);
        if (nextState.parsedTime) setUiBookingTime(nextState.parsedTime);
      }

      // Speak the booking prompt
      setAiReplyText(promptMessage);
      setVoiceStatus('done');
      
      if (nextState.step === 'done') {
        const bookMatch = window.location.pathname.match(/\/book\/([a-zA-Z0-9]+)/);
        
        if (bookMatch) {
          // UI-DRIVEN BOOKING: Trigger the page's "Proceed to Payment" button directly
          voiceService.speak("Processing your booking...", { rate: 1.05 });
          setAiReplyText('');
          setActiveFlow(null);
          setTriggerBookingSubmit(true);
          
          setTimeout(() => {
            setOpen(false);
            handleClose(false);
            setTriggerBookingSubmit(false); // Reset trigger
          }, 800);
        } else {
          // LEGACY BOOKING: Navigate manually
          voiceService.speak(promptMessage, { rate: 1.05 });
          setAiReplyText('');
          setActiveFlow(null);
          setTimeout(() => {
            if (nextState.doctorId) {
              navigate(buildBookingUrl(nextState.doctorId));
            } else {
              navigate('/doctors');
            }
            setOpen(false);
            handleClose(false); 
          }, 800);
        }
        
        setThinking(false);
        isProcessingRef.current = false;
        return;
      }

      await voiceService.speak(promptMessage, { rate: 1.05 });
      setAiReplyText('');

      if (
        nextState.step === 'specialization' &&
        currentState.step === 'confirm'
      ) {
        // Cancelled — clear flow, keep mic on
        setActiveFlow(null);
        setVoiceStatus('listening');
        setLastSpokenCommand('');
        voiceService.resumeContinuousListening();
      } else {
        // Advance to next step — keep mic on for next answer
        setActiveFlow(stateToFlow(nextState as BookingState));
        setVoiceStatus('listening');
        setLastSpokenCommand('');
        voiceService.resumeContinuousListening();
      }

      setThinking(false);
      isProcessingRef.current = false;
      return;
    }

    // ── No active flow — send to backend AI ──────────────────────────────
    addMessage({ role: 'user', content: text });
    const loadingId = addMessage({ role: 'assistant', content: '', isLoading: true });

    try {
      let pageContext = '';
      const path = window.location.pathname;
      if (path.includes('/prescriptions')) {
        const cards = document.querySelectorAll('.card, [class*="hover:shadow-md"]');
        if (cards.length > 0) {
          pageContext = `User is looking at their prescriptions. The most recent prescription says: ${cards[0].textContent?.replace(/\s+/g, ' ').trim()}`;
        }
      } else if (path.includes('/doctors')) {
        pageContext = `User is on the doctors list page.`;
      } else if (path.includes('/dashboard')) {
        pageContext = `User is on their dashboard.`;
      }

      const response = await parseIntent(text, sessionId, token, pageContext);

      executeAction(response, {
        navigate,
        addMessage,
        updateMessage,
        loadingId,
        setThinking,
        setOpen,
        activeFlow: null,
        setActiveFlow,
        userText: text,
      });

      // Speak the reply
      if (response.reply) {
        setAiReplyText(response.reply);
        setVoiceStatus('done');
        await voiceService.speak(response.reply, { rate: 1.05 });
        setAiReplyText('');
      }

      // If the action opened a booking flow, keep overlay open and resume mic
      // The next call to processCommand will handle the booking steps locally
      setVoiceStatus('listening');
      setLastSpokenCommand('');
      setVoiceTranscript('');
      voiceService.resumeContinuousListening();

    } catch {
      setVoiceStatus('error');
      setAiReplyText("Sorry, I had trouble with that. Please try again.");
      await voiceService.speak("Sorry, I had trouble with that. Please try again.");
      setAiReplyText('');
      setVoiceStatus('listening');
      setVoiceTranscript('');
      voiceService.resumeContinuousListening();
    } finally {
      setThinking(false);
      isProcessingRef.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, token, activeFlow, navigate]);

  // ─────────────────────────────────────────────────────────────────────────
  // Voice callbacks — re-registered when processCommand changes
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isVoiceMode) return;

    voiceService.setCallbacks({
      onResult: (transcript, isFinal) => {
        setVoiceTranscript(transcript);
        if (isFinal && !isProcessingRef.current) {
          processCommand(transcript);
        }
      },
      onError: (error) => {
        if (error.includes('permission') || error.includes('denied')) {
          setVoiceStatus('error');
          setVoiceTranscript(error);
        }
        // Other errors are handled silently in continuous mode
      },
      onStateChange: (state) => {
        setListening(state === 'listening');
        if (state === 'listening' && !isProcessingRef.current) {
          setVoiceStatus('listening');
        }
      },
      onSilenceTimeout: () => {
        handleClose();
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVoiceMode, processCommand]);

  // ─────────────────────────────────────────────────────────────────────────
  // Start / stop continuous listening with page context greeting
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    if (isVoiceMode) {
      isProcessingRef.current = false;
      setVoiceTranscript('');
      setLastSpokenCommand('');
      
      const initiateGreeting = async () => {
        setVoiceStatus('thinking');
        
        let greeting = "How can I help you today?";
        const path = window.location.pathname;
        const bookMatch = path.match(/\/book\/([a-zA-Z0-9]+)/);

        // Validate active flow against current page context
        let validFlow = activeFlow;
        if (validFlow && !path.includes('/book') && !path.includes('/doctors')) {
           validFlow = null;
           setActiveFlow(null); // Clear the abandoned flow
        }

        if (validFlow) {
           greeting = `Let's continue. ${getBookingPrompt(validFlow.step as BookingStep)}`;
        } else if (bookMatch) {
           // Auto-start booking flow on the book page
           const flow = { step: 'datetime' as const, doctorId: bookMatch[1] };
           setActiveFlow(flow);
           greeting = getBookingPrompt('datetime');
        } else {
           if (path === '/') greeting = "You are on the Home page. How can I help you today?";
           else if (path.includes('/doctors')) greeting = "You are on the Doctors page. What kind of specialist are you looking for?";
           else if (path.includes('/appointments') || path.includes('/past-appointments')) greeting = "You are viewing your appointments. Would you like to book a new one?";
           else if (path.includes('/prescriptions')) greeting = "You are viewing your prescriptions. Need help finding anything?";
           else if (path.includes('/dashboard')) greeting = "You are on your dashboard. How can I assist you?";
           else if (path.includes('/messages') || path.includes('/chat')) greeting = "You are in your messages. Who would you like to chat with?";
        }
        
        setAiReplyText(greeting);
        setVoiceStatus('done');
        await voiceService.speak(greeting, { rate: 1.05 });
        
        if (mounted) {
          setAiReplyText('');
          setVoiceStatus('listening');
          voiceService.startContinuousListening(60000);
        }
      };

      initiateGreeting();
    } else {
      voiceService.stopContinuousListening();
    }
    
    return () => {
      mounted = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVoiceMode]);

  // Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isVoiceMode) handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVoiceMode]);

  // ─────────────────────────────────────────────────────────────────────────
  const handleClose = (stopTTS = true) => {
    voiceService.stopContinuousListening();
    if (stopTTS) {
      voiceService.stopSpeaking();
    }
    setVoiceMode(false);
    setVoiceStatus('idle');
    setVoiceTranscript('');
    setLastSpokenCommand('');
    setListening(false);
    setThinking(false);
    isProcessingRef.current = false;
    setAiReplyText('');
  };

  if (!isVoiceMode) return null;

  // ── Visual helpers ──────────────────────────────────────────────────────
  const statusLabel = activeFlow
    ? `Step: ${activeFlow.step}`
    : {
        idle:      'Ready',
        listening: 'Listening...',
        thinking:  'Processing...',
        done:      'Got it!',
        error:     'Try again',
      }[voiceStatus] ?? 'Listening...';

  const statusColor = {
    idle:      'text-white/50',
    listening: 'text-teal-300',
    thinking:  'text-violet-300',
    done:      'text-emerald-400',
    error:     'text-rose-400',
  }[voiceStatus] ?? 'text-teal-300';

  const orbGradient = {
    idle:      'from-slate-600 to-slate-700',
    listening: 'from-teal-500 to-cyan-400',
    thinking:  'from-violet-600 to-purple-500',
    done:      'from-emerald-500 to-teal-400',
    error:     'from-rose-500 to-pink-500',
  }[voiceStatus] ?? 'from-teal-500 to-cyan-400';

  const ringColor = voiceStatus === 'thinking'
    ? 'rgba(139,92,246,'
    : 'rgba(45,212,191,';
  const orbGlow = voiceStatus === 'thinking'
    ? 'rgba(139,92,246,0.55)'
    : voiceStatus === 'done'
    ? 'rgba(52,211,153,0.5)'
    : voiceStatus === 'error'
    ? 'rgba(244,63,94,0.5)'
    : 'rgba(45,212,191,0.55)';

  const displayText = voiceTranscript || lastSpokenCommand;

  return (
    <>
      {/* Semi-transparent backdrop — NO blur */}
      <div
        className="fixed inset-0 z-[58] bg-black/30 animate-fade-in"
        onClick={handleClose}
      />

      {/* ── Compact bottom-right panel ── */}
      <div
        id="mediAI-voice-overlay"
        className="
          fixed bottom-24 right-6 z-[59]
          w-72
          rounded-2xl overflow-hidden
          border border-white/10
          shadow-2xl shadow-black/70
          animate-popup-in
          flex flex-col items-center
          pt-5 pb-6 px-5
        "
        style={{
          background: 'linear-gradient(160deg, rgba(10,18,35,0.98) 0%, rgba(8,22,44,0.98) 100%)',
          backdropFilter: 'blur(0px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="w-full flex items-center justify-between mb-4">
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
              isListening ? 'bg-teal-400 animate-pulse' : 'bg-white/20'
            }`} />
            <span className="text-[10px] font-semibold tracking-widest uppercase text-white/40">
              MediAI Voice
            </span>
            {activeFlow && (
              <span className="text-[9px] text-violet-400/70 bg-violet-500/10 px-1.5 py-0.5 rounded-full border border-violet-500/20">
                Booking
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { handleClose(); setOpen(true); }}
              title="Switch to chat"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/8 transition-all"
            >
              <MessageCircle size={13} />
            </button>
            <button
              onClick={handleClose}
              title="Close voice"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/8 transition-all"
            >
              <X size={13} />
            </button>
          </div>
        </div>

        {/* ── Siri Orb — 144px ── */}
        <div className="relative mb-5 flex items-center justify-center">
          {/* Pulse rings */}
          {(voiceStatus === 'listening' || voiceStatus === 'thinking') && (
            <>
              <span
                className="absolute w-36 h-36 rounded-full animate-siri-ring-1"
                style={{ background: `${ringColor}0.18)` }}
              />
              <span
                className="absolute w-44 h-44 rounded-full animate-siri-ring-2"
                style={{ background: `${ringColor}0.10)` }}
              />
              <span
                className="absolute w-52 h-52 rounded-full animate-siri-ring-3"
                style={{ background: `${ringColor}0.05)` }}
              />
            </>
          )}

          {/* Orb */}
          <div
            className={`relative w-36 h-36 rounded-full bg-gradient-to-br ${orbGradient} flex items-center justify-center transition-all duration-500`}
            style={{ boxShadow: `0 0 50px ${orbGlow}, 0 0 100px ${orbGlow.replace('0.55', '0.20').replace('0.5', '0.15')}` }}
          >
            {voiceStatus === 'listening' && (
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    className="w-1.5 bg-white rounded-full"
                    style={{
                      minHeight: '6px',
                      animation: `voice-bar ${0.45 + i * 0.09}s ease-in-out infinite alternate`,
                      animationDelay: `${i * 0.05}s`,
                    }}
                  />
                ))}
              </div>
            )}
            {voiceStatus === 'thinking' && (
              <div className="flex gap-2">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-2.5 h-2.5 rounded-full bg-white"
                    style={{ animation: 'thinking-dot 1s ease-in-out infinite', animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            )}
            {voiceStatus === 'done'  && <span className="text-4xl">✅</span>}
            {voiceStatus === 'error' && <span className="text-4xl">⚠️</span>}
            {voiceStatus === 'idle'  && <Mic size={40} className="text-white/60" />}
            <span className="absolute inset-0 rounded-full bg-gradient-to-br from-white/20 to-transparent pointer-events-none" />
          </div>
        </div>

        {/* Status */}
        <p className={`text-sm font-semibold mb-2 transition-colors duration-300 ${statusColor}`}>
          {statusLabel}
        </p>

        {/* Transcript / AI Reply */}
        <div className="w-full min-h-[3rem] flex flex-col items-center justify-center mb-3">
          {aiReplyText ? (
            <p className="text-center text-teal-300 text-sm font-medium leading-snug px-2 animate-fade-in">
              {aiReplyText}
            </p>
          ) : displayText ? (
            <p className="text-center text-white/85 text-sm font-medium leading-snug px-2 animate-fade-in">
              "{displayText}"
            </p>
          ) : voiceStatus === 'listening' && (
            <p className="text-center text-white/25 text-xs animate-pulse-slow">
              {activeFlow
                ? `Answer for ${activeFlow.step} step...`
                : 'Say a command...'}
            </p>
          )}
        </div>

        {/* Hint chips — only when not in booking flow */}
        {!activeFlow && (voiceStatus === 'listening' || voiceStatus === 'idle') && (
          <div className="flex flex-wrap justify-center gap-1.5 mb-4">
            {['"Open appointments"', '"Find doctor"', '"Book a doctor"', '"Chest pain"'].map((h) => (
              <span
                key={h}
                className="text-[10px] text-white/25 bg-white/4 border border-white/8 px-2 py-0.5 rounded-full"
              >
                {h}
              </span>
            ))}
          </div>
        )}

        {/* Booking flow step hint */}
        {activeFlow && (
          <div className="w-full mb-4 px-1">
            <div className="text-[10px] text-violet-400/60 text-center bg-violet-500/8 border border-violet-500/15 rounded-lg py-1.5 px-2">
              {activeFlow.step === 'specialization' && 'Say a specialization — e.g. "Cardiologist"'}
              {activeFlow.step === 'doctor' && 'Say the doctor\'s name you prefer'}
              {activeFlow.step === 'datetime' && 'Say date & time — e.g. "Tomorrow at 3 PM"'}
              {activeFlow.step === 'confirm' && 'Say "confirm" to book or "cancel" to stop'}
            </div>
          </div>
        )}

        {/* Control button */}
        <button
          onClick={voiceStatus === 'listening' ? handleClose : () => {}}
          className={`
            flex items-center gap-2 px-5 py-2 rounded-full text-xs font-medium
            border transition-all duration-200
            ${voiceStatus === 'listening'
              ? 'bg-rose-500/15 border-rose-500/30 text-rose-400 hover:bg-rose-500/25'
              : 'bg-white/8 border-white/15 text-white/40 cursor-default'
            }
          `}
        >
          {voiceStatus === 'listening'
            ? <><MicOff size={13} /> Stop</>
            : <><Mic size={13} /> {isListening ? 'Listening' : 'Processing'}</>
          }
        </button>

        <p className="mt-3 text-[9px] text-white/18 text-center">
          Mic stays on · Auto-stops after 1m silence · <kbd className="px-1 py-0.5 rounded bg-white/8 font-mono">Esc</kbd> to cancel
        </p>
      </div>
    </>
  );
}
