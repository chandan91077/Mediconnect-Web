/**
 * MediAI Symptom Tracker & Tag Extractor
 * NLP keyword extraction and importance scoring for user messages.
 * Powers memory tagging, health condition detection, and personalization.
 */

// ─── Symptom Keyword Maps ──────────────────────────────────────────────────────

const SYMPTOM_KEYWORDS = {
  'breathing issue': ['breathing', 'breath', 'shortness of breath', 'can\'t breathe', 'difficulty breathing', 'wheezing', 'inhaler'],
  'chest pain': ['chest pain', 'chest tightness', 'chest pressure', 'heart pain'],
  'headache': ['headache', 'migraine', 'head pain', 'head hurts', 'throbbing head'],
  'fever': ['fever', 'temperature', 'chills', 'sweating', 'hot body'],
  'stomach pain': ['stomach pain', 'abdominal pain', 'stomach ache', 'nausea', 'vomiting', 'diarrhea'],
  'back pain': ['back pain', 'backache', 'spine pain', 'lower back'],
  'joint pain': ['joint pain', 'knee pain', 'hip pain', 'arthritis', 'swollen joint'],
  'skin rash': ['rash', 'itching', 'acne', 'skin irritation', 'hives', 'eczema'],
  'eye problem': ['eye pain', 'blurry vision', 'vision loss', 'eye redness', 'watery eyes'],
  'fatigue': ['fatigue', 'tired', 'exhausted', 'weakness', 'low energy'],
  'anxiety': ['anxiety', 'panic', 'anxious', 'stress', 'nervous'],
  'cold flu': ['cold', 'flu', 'runny nose', 'sore throat', 'sneezing', 'cough'],
  'blood pressure': ['blood pressure', 'hypertension', 'bp high', 'bp low'],
  'diabetes': ['diabetes', 'blood sugar', 'glucose', 'insulin'],
};

const HEALTH_TOPIC_KEYWORDS = [
  'doctor', 'appointment', 'specialist', 'hospital', 'clinic', 'medicine',
  'medication', 'prescription', 'symptom', 'diagnosis', 'treatment', 'surgery',
  'emergency', 'pain', 'health', 'medical', 'disease', 'condition', 'test',
  'lab', 'blood', 'scan', 'xray', 'mri', 'consult',
];

const SPECIALIST_KEYWORDS = [
  'cardiologist', 'dermatologist', 'neurologist', 'orthopedic', 'pediatrician',
  'psychiatrist', 'gynecologist', 'urologist', 'oncologist', 'pulmonologist',
  'ophthalmologist', 'dentist', 'endocrinologist', 'gastroenterologist',
  'rheumatologist', 'general physician', 'surgeon', 'radiologist',
];

const ACTION_KEYWORDS = [
  'book', 'schedule', 'appointment', 'cancel', 'reschedule', 'navigate',
  'find', 'search', 'show', 'open', 'go to', 'payment', 'pay',
];

// ─── Symptom to Specialist Mapping ───────────────────────────────────────────

const SYMPTOM_TO_SPECIALIST = {
  'breathing issue': 'Pulmonologist',
  'chest pain': 'Cardiologist',
  'headache': 'Neurologist',
  'fever': 'General Physician',
  'stomach pain': 'Gastroenterologist',
  'back pain': 'Orthopedic',
  'joint pain': 'Rheumatologist',
  'skin rash': 'Dermatologist',
  'eye problem': 'Ophthalmologist',
  'fatigue': 'General Physician',
  'anxiety': 'Psychiatrist',
  'cold flu': 'General Physician',
  'blood pressure': 'Cardiologist',
  'diabetes': 'Endocrinologist',
};

// ─── Tag Extraction ───────────────────────────────────────────────────────────

/**
 * Extract semantic tags from a user message.
 * Returns an array of relevant category tags.
 *
 * @param {string} text
 * @returns {string[]} tags
 */
function extractTags(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  const tags = new Set();

  // Symptom tags
  for (const [symptomKey, keywords] of Object.entries(SYMPTOM_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      tags.add(symptomKey.replace(/ /g, '_'));
    }
  }

  // Health topic tags
  for (const kw of HEALTH_TOPIC_KEYWORDS) {
    if (lower.includes(kw)) {
      tags.add('health_topic');
      break;
    }
  }

  // Specialist tags
  for (const spec of SPECIALIST_KEYWORDS) {
    if (lower.includes(spec)) {
      tags.add(`specialist_${spec.replace(/ /g, '_')}`);
    }
  }

  // Action tags
  for (const action of ACTION_KEYWORDS) {
    if (lower.includes(action)) {
      tags.add('action');
      break;
    }
  }

  return Array.from(tags);
}

// ─── Importance Scoring ───────────────────────────────────────────────────────

/**
 * Compute an importance score for a message (0–1).
 * Health-related messages score higher and are kept longer in memory.
 *
 * @param {string} text
 * @param {string[]} tags - Pre-extracted tags
 * @returns {number} score between 0 and 1
 */
function computeImportanceScore(text, tags = []) {
  if (!text) return 0.1;
  const lower = text.toLowerCase();

  let score = 0.3; // Baseline

  // High-value health content
  if (tags.some(t => t.startsWith('breathing') || t.includes('chest') || t.includes('heart'))) {
    score += 0.4;
  } else if (tags.some(t => t !== 'action' && t !== 'health_topic')) {
    score += 0.25; // Other symptoms
  }

  // Explicit health statements
  if (/i have|i've been|suffering from|diagnosed with|my doctor|i was told/i.test(lower)) {
    score += 0.15;
  }

  // Appointment-related
  if (/appointment|book|schedule|cancel|reschedule/i.test(lower)) {
    score += 0.1;
  }

  // Navigation commands — low importance
  if (/^(open|go to|show|navigate|take me)/i.test(lower)) {
    score = Math.min(score, 0.2);
  }

  // Greetings — very low importance
  if (/^(hi|hello|hey|thanks|thank you|ok|okay|yes|no)$/i.test(lower.trim())) {
    score = 0.1;
  }

  return Math.min(Math.max(Math.round(score * 100) / 100, 0), 1);
}

// ─── Symptom Detection ────────────────────────────────────────────────────────

/**
 * Detect all symptoms mentioned in text and return them with suggested specialists.
 *
 * @param {string} text
 * @returns {Array<{symptom: string, specialist: string}>}
 */
function detectSymptoms(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  const found = [];

  for (const [symptomKey, keywords] of Object.entries(SYMPTOM_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      found.push({
        symptom: symptomKey,
        specialist: SYMPTOM_TO_SPECIALIST[symptomKey] || 'General Physician',
      });
    }
  }

  return found;
}

// ─── Recurring Symptom Alert ──────────────────────────────────────────────────

/**
 * Check if a symptom is recurring in the user's profile.
 * Returns the symptom record if count >= 2.
 *
 * @param {Object} memoryProfile
 * @param {string} symptomKey
 * @returns {Object|null}
 */
function isRecurringSymptom(memoryProfile, symptomKey) {
  if (!memoryProfile?.recurringSymptoms) return null;
  return memoryProfile.recurringSymptoms.find(
    s => s.symptom === symptomKey && s.count >= 2
  ) || null;
}

module.exports = {
  extractTags,
  computeImportanceScore,
  detectSymptoms,
  isRecurringSymptom,
  SYMPTOM_TO_SPECIALIST,
  SYMPTOM_KEYWORDS,
};
