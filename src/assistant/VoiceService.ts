/**
 * MediAI Voice Service
 * Wraps Web Speech API — supports continuous listening with auto-restart
 * and silence-based auto-stop.
 */

type OnResultCallback = (transcript: string, isFinal: boolean) => void;
type OnErrorCallback = (error: string) => void;
type OnStateChangeCallback = (state: 'listening' | 'stopped' | 'processing') => void;
type OnSilenceTimeoutCallback = () => void;

class VoiceService {
  private recognition: SpeechRecognition | null = null;
  private synthesis: SpeechSynthesis | null = null;
  private isListening = false;
  private shouldContinue = false;         // continuous mode flag
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private silenceTimeoutMs = 5000;        // stop after 5s of silence
  private gotResultThisSession = false;   // track if a result was received

  private onResult: OnResultCallback | null = null;
  private onError: OnErrorCallback | null = null;
  private onStateChange: OnStateChangeCallback | null = null;
  private onSilenceTimeout: OnSilenceTimeoutCallback | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.synthesis = window.speechSynthesis;
      this.initRecognition();
    }
  }

  private initRecognition() {
    const SpeechRecognitionAPI =
      (window as unknown as { SpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      console.warn('[VoiceService] SpeechRecognition not supported.');
      return;
    }

    this.recognition = new SpeechRecognitionAPI();
    this.recognition.continuous = false;   // we manage restart ourselves for reliability
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';
    this.recognition.maxAlternatives = 1;

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      this.gotResultThisSession = true;
      this.resetSilenceTimer(); // reset silence countdown on any speech

      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      if (finalTranscript) {
        this.onResult?.(finalTranscript.trim(), true);
        this.onStateChange?.('processing');
      } else if (interimTranscript) {
        this.onResult?.(interimTranscript.trim(), false);
      }
    };

    this.recognition.onend = () => {
      this.isListening = false;

      // If we should continue AND mic wasn't deliberately stopped → restart
      if (this.shouldContinue) {
        // Small delay before restarting to avoid rapid-fire restarts
        setTimeout(() => {
          if (this.shouldContinue) {
            this.startListeningInternal();
          }
        }, 250);
      } else {
        this.onStateChange?.('stopped');
        this.clearSilenceTimer();
      }
    };

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      this.isListening = false;

      // 'no-speech' is not a real error in continuous mode — just restart
      if (event.error === 'no-speech' && this.shouldContinue) {
        setTimeout(() => {
          if (this.shouldContinue) this.startListeningInternal();
        }, 300);
        return;
      }

      // 'aborted' means we deliberately stopped
      if (event.error === 'aborted') {
        this.onStateChange?.('stopped');
        return;
      }

      const errorMsg = this.getErrorMessage(event.error);
      this.onError?.(errorMsg);
      this.onStateChange?.('stopped');
      this.shouldContinue = false;
      this.clearSilenceTimer();
    };
  }

  private startListeningInternal() {
    if (!this.recognition || this.isListening) return;
    try {
      this.recognition.start();
      this.isListening = true;
      this.onStateChange?.('listening');
    } catch (err) {
      console.warn('[VoiceService] restart error:', err);
      // If already started, ignore
    }
  }

  private resetSilenceTimer() {
    this.clearSilenceTimer();
    this.silenceTimer = setTimeout(() => {
      // Silence timeout reached — stop everything
      if (this.shouldContinue) {
        this.stopContinuousListening();
        this.onSilenceTimeout?.();
      }
    }, this.silenceTimeoutMs);
  }

  private clearSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  private getErrorMessage(error: string): string {
    const messages: Record<string, string> = {
      'no-speech': 'No speech detected.',
      'audio-capture': 'Microphone not accessible. Please check permissions.',
      'not-allowed': 'Microphone permission denied. Please allow access in browser settings.',
      'network': 'Network error during speech recognition.',
      'aborted': 'Voice recognition was cancelled.',
    };
    return messages[error] || `Voice recognition error: ${error}`;
  }

  isSupported(): boolean {
    return this.recognition !== null;
  }

  setCallbacks(callbacks: {
    onResult?: OnResultCallback;
    onError?: OnErrorCallback;
    onStateChange?: OnStateChangeCallback;
    onSilenceTimeout?: OnSilenceTimeoutCallback;
  }) {
    if (callbacks.onResult) this.onResult = callbacks.onResult;
    if (callbacks.onError) this.onError = callbacks.onError;
    if (callbacks.onStateChange) this.onStateChange = callbacks.onStateChange;
    if (callbacks.onSilenceTimeout) this.onSilenceTimeout = callbacks.onSilenceTimeout;
  }

  /**
   * Start one-shot listening (used by chat popup mic button)
   */
  startListening(): boolean {
    if (!this.recognition) {
      this.onError?.('Voice recognition not supported in this browser.');
      return false;
    }
    if (this.isListening) {
      this.stopListening();
      return false;
    }
    this.shouldContinue = false;
    this.gotResultThisSession = false;
    try {
      this.recognition.start();
      this.isListening = true;
      this.onStateChange?.('listening');
      return true;
    } catch (err) {
      console.error('[VoiceService] startListening error:', err);
      this.isListening = false;
      this.onError?.('Could not start voice recognition. Please try again.');
      return false;
    }
  }

  /**
   * Start continuous listening — restarts automatically, stops on silence.
   * Used by the Siri-style voice overlay.
   */
  startContinuousListening(silenceTimeoutMs = 5000): boolean {
    if (!this.recognition) {
      this.onError?.('Voice recognition not supported in this browser.');
      return false;
    }
    this.silenceTimeoutMs = silenceTimeoutMs;
    this.shouldContinue = true;
    this.gotResultThisSession = false;

    // Start initial silence timer — if user never speaks within timeout, stop
    this.resetSilenceTimer();

    // Stop any existing session first
    if (this.isListening) {
      try { this.recognition.stop(); } catch {}
      this.isListening = false;
    }

    setTimeout(() => this.startListeningInternal(), 150);
    return true;
  }

  /**
   * Resume continuous listening after processing a command (mic back on)
   */
  resumeContinuousListening() {
    if (!this.shouldContinue) return;
    this.gotResultThisSession = false;
    this.resetSilenceTimer(); // reset 5s silence clock
    setTimeout(() => this.startListeningInternal(), 400); // small gap after TTS
  }

  /**
   * Stop one-shot listening
   */
  stopListening() {
    this.shouldContinue = false;
    this.clearSilenceTimer();
    if (this.recognition && this.isListening) {
      this.recognition.stop();
      this.isListening = false;
    }
  }

  /**
   * Stop continuous listening completely
   */
  stopContinuousListening() {
    this.shouldContinue = false;
    this.clearSilenceTimer();
    if (this.recognition && this.isListening) {
      try { this.recognition.stop(); } catch {}
      this.isListening = false;
    }
    this.onStateChange?.('stopped');
  }

  /**
   * Speak text aloud using SpeechSynthesis
   */
  speak(text: string, options?: { rate?: number; pitch?: number; volume?: number }): Promise<void> {
    return new Promise((resolve) => {
      if (!this.synthesis) { resolve(); return; }

      this.synthesis.cancel();

      const cleanText = text
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/[\u{1F300}-\u{1FFFF}]/gu, '')
        .trim();

      if (!cleanText) { resolve(); return; }

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = options?.rate ?? 1.05;
      utterance.pitch = options?.pitch ?? 1.0;
      utterance.volume = options?.volume ?? 1.0;
      utterance.lang = 'en-US';

      const voices = this.synthesis.getVoices();
      const preferred = voices.find(
        (v) => v.lang.startsWith('en') &&
          (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Samantha'))
      );
      if (preferred) utterance.voice = preferred;

      let resolved = false;
      const safeResolve = () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };

      utterance.onend = safeResolve;
      utterance.onerror = safeResolve;

      this.synthesis.speak(utterance);

      // Safety fallback: Chromium sometimes fails to fire onend for speech synthesis.
      // Estimate 100ms per character + 1500ms buffer.
      const fallbackMs = (cleanText.length * 100) + 1500;
      setTimeout(safeResolve, fallbackMs);
    });
  }

  stopSpeaking() {
    this.synthesis?.cancel();
  }

  getIsListening(): boolean {
    return this.isListening;
  }

  getIsContinuous(): boolean {
    return this.shouldContinue;
  }
}

export const voiceService = new VoiceService();
