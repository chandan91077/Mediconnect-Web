/**
 * UserMemoryProfile Model
 * Permanent long-term memory for each user's health journey.
 * Powers the personalized AI healthcare companion experience.
 */

const mongoose = require('mongoose');

// ─── Sub-schemas ─────────────────────────────────────────────────────────────

const healthConditionSchema = new mongoose.Schema({
  name: { type: String, required: true },         // e.g. "asthma", "diabetes"
  firstMentioned: { type: Date, default: Date.now },
  lastMentioned: { type: Date, default: Date.now },
  mentionCount: { type: Number, default: 1 },
  confirmed: { type: Boolean, default: false },   // true = user explicitly stated, false = inferred
}, { _id: false });

const recurringSymptomSchema = new mongoose.Schema({
  symptom: { type: String, required: true },      // e.g. "breathing issue", "headache"
  count: { type: Number, default: 1 },
  firstSeen: { type: Date, default: Date.now },
  lastSeen: { type: Date, default: Date.now },
  relatedSpecialist: { type: String, default: null }, // e.g. "Pulmonologist"
}, { _id: false });

const preferredDoctorSchema = new mongoose.Schema({
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
  doctorName: { type: String },
  specialization: { type: String },
  visitCount: { type: Number, default: 1 },
  lastVisit: { type: Date, default: Date.now },
}, { _id: false });

const appointmentSummarySchema = new mongoose.Schema({
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
  doctorName: { type: String },
  specialization: { type: String },
  date: { type: Date },
  reason: { type: String },
  outcome: { type: String, default: null }, // brief note
}, { _id: false });

const conversationSummarySchema = new mongoose.Schema({
  sessionId: { type: String },
  summary: { type: String },        // GPT-compressed session summary
  keyTopics: [{ type: String }],    // ["breathing", "appointment", "cardiologist"]
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const workflowStateSchema = new mongoose.Schema({
  type: { type: String },           // "booking", "rescheduling", "payment"
  step: { type: String },           // "select_doctor", "select_slot", "confirm"
  data: { type: mongoose.Schema.Types.Mixed }, // partial booking data
  savedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date },        // workflow expires after 24h
}, { _id: false });

const aiPreferencesSchema = new mongoose.Schema({
  language: { type: String, default: 'en' },
  verbosity: { type: String, enum: ['brief', 'normal', 'detailed'], default: 'normal' },
  tone: { type: String, enum: ['formal', 'friendly', 'clinical'], default: 'friendly' },
  preferVoice: { type: Boolean, default: false },
}, { _id: false });

// ─── Main Schema ─────────────────────────────────────────────────────────────

const userMemoryProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },

  // Health intelligence
  healthConditions: { type: [healthConditionSchema], default: [] },
  recurringSymptoms: { type: [recurringSymptomSchema], default: [] },

  // Doctor preferences
  preferredDoctors: { type: [preferredDoctorSchema], default: [] },

  // History
  appointmentHistory: { type: [appointmentSummarySchema], default: [] },
  conversationSummaries: { type: [conversationSummarySchema], default: [] },

  // Active workflow (unfinished booking, etc.)
  lastActiveWorkflow: { type: workflowStateSchema, default: null },

  // AI behavior preferences
  aiPreferences: { type: aiPreferencesSchema, default: () => ({}) },

  // Metadata
  totalConversations: { type: Number, default: 0 },
  lastInteraction: { type: Date, default: Date.now },

}, { timestamps: true });

// ─── Indexes ─────────────────────────────────────────────────────────────────
// Note: userId index is created automatically by unique:true above
userMemoryProfileSchema.index({ lastInteraction: -1 });

// ─── Static Methods ───────────────────────────────────────────────────────────

/**
 * Get or create a memory profile for a user
 */
userMemoryProfileSchema.statics.getOrCreate = async function (userId) {
  let profile = await this.findOne({ userId });
  if (!profile) {
    profile = await this.create({ userId });
  }
  return profile;
};

module.exports = mongoose.model('UserMemoryProfile', userMemoryProfileSchema);
