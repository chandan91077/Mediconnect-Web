/**
 * useMemoryLoader — Frontend Memory Loader Hook
 * Loads the user's personalized memory profile from the backend after login.
 * Powers the "assistant already knows you" experience.
 *
 * Usage:
 *   const { memoryProfile, isLoading, hasActiveWorkflow } = useMemoryLoader();
 */

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HealthCondition {
  name: string;
  mentionCount: number;
  firstMentioned: string;
  lastMentioned: string;
  confirmed: boolean;
}

export interface RecurringSymptom {
  symptom: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  relatedSpecialist: string | null;
}

export interface PreferredDoctor {
  doctorId: string;
  doctorName: string;
  specialization: string;
  visitCount: number;
  lastVisit: string;
}

export interface AIPreferences {
  language: string;
  verbosity: 'brief' | 'normal' | 'detailed';
  tone: 'formal' | 'friendly' | 'clinical';
  preferVoice: boolean;
}

export interface WorkflowState {
  type: string;
  step: string;
  data: Record<string, any>;
  savedAt: string;
  expiresAt: string;
}

export interface MemoryProfile {
  healthConditions: HealthCondition[];
  recurringSymptoms: RecurringSymptom[];
  preferredDoctors: PreferredDoctor[];
  appointmentHistory: any[];
  conversationSummaries: any[];
  aiPreferences: AIPreferences;
  lastActiveWorkflow: WorkflowState | null;
  totalConversations: number;
  lastInteraction: string;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMemoryLoader() {
  const [memoryProfile, setMemoryProfile] = useState<MemoryProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null);

  /**
   * Load the user's memory profile from the server.
   * Called automatically after login and can be called manually to refresh.
   */
  const loadMemoryProfile = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return; // Not authenticated

    setIsLoading(true);
    setError(null);

    try {
      const { data } = await api.get('/assistant/memory/profile');
      if (data.success && data.profile) {
        setMemoryProfile(data.profile);
        setLastLoaded(new Date());

        // Cache in sessionStorage for fast reads (cleared on tab close)
        try {
          sessionStorage.setItem('medi_memory_profile', JSON.stringify(data.profile));
          sessionStorage.setItem('medi_memory_loaded_at', new Date().toISOString());
        } catch {
          // Ignore storage errors
        }
      }
    } catch (err: any) {
      // Memory load failure should never block the app
      console.warn('[useMemoryLoader] Failed to load memory profile:', err?.message);
      setError(err?.message || 'Failed to load memory');

      // Try to restore from sessionStorage cache
      try {
        const cached = sessionStorage.getItem('medi_memory_profile');
        if (cached) {
          setMemoryProfile(JSON.parse(cached));
        }
      } catch {
        // Ignore
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Update the user's AI preferences.
   */
  const updateAIPreferences = useCallback(async (preferences: Partial<AIPreferences>) => {
    try {
      await api.put('/assistant/memory/profile', { aiPreferences: preferences });
      setMemoryProfile(prev => prev ? {
        ...prev,
        aiPreferences: { ...prev.aiPreferences, ...preferences },
      } : null);
    } catch (err: any) {
      console.warn('[useMemoryLoader] Failed to update AI preferences:', err?.message);
    }
  }, []);

  /**
   * Clear the saved unfinished workflow.
   */
  const clearWorkflow = useCallback(async () => {
    try {
      await api.delete('/assistant/memory/workflow');
      setMemoryProfile(prev => prev ? { ...prev, lastActiveWorkflow: null } : null);
    } catch (err: any) {
      console.warn('[useMemoryLoader] Failed to clear workflow:', err?.message);
    }
  }, []);

  /**
   * Search memories semantically.
   */
  const searchMemories = useCallback(async (query: string, limit = 5) => {
    try {
      const { data } = await api.get(`/assistant/memory/search?q=${encodeURIComponent(query)}&limit=${limit}`);
      return data.results || [];
    } catch {
      return [];
    }
  }, []);

  // Load on mount (if token is present)
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      loadMemoryProfile();
    }
  }, [loadMemoryProfile]);

  // ─── Derived State ────────────────────────────────────────────────────────

  const hasActiveWorkflow = !!(memoryProfile?.lastActiveWorkflow);
  const recurringSymptoms = memoryProfile?.recurringSymptoms?.filter(s => s.count >= 2) || [];
  const topConditions = memoryProfile?.healthConditions?.slice(0, 3).map(c => c.name) || [];
  const preferredDoctors = memoryProfile?.preferredDoctors?.slice(0, 3) || [];
  const isReturningUser = (memoryProfile?.totalConversations ?? 0) > 0;
  const language = memoryProfile?.aiPreferences?.language || 'en';

  return {
    // State
    memoryProfile,
    isLoading,
    error,
    lastLoaded,

    // Derived
    hasActiveWorkflow,
    recurringSymptoms,
    topConditions,
    preferredDoctors,
    isReturningUser,
    language,

    // Actions
    loadMemoryProfile,
    updateAIPreferences,
    clearWorkflow,
    searchMemories,
  };
}

export default useMemoryLoader;
