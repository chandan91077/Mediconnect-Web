/**
 * MediAI GPT Client
 * Sends conversation history to GPT-4.1 and parses structured action responses.
 */

const OpenAI = require('openai');

let _openai = null;

function getOpenAIClient() {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}


/**
 * Valid actions the AI can return — used for response validation
 */
const VALID_ACTIONS = [
  'navigate',
  'search_doctors',
  'open_booking',
  'get_doctor_appointments',
  'suggest_specialist',
  'ask_followup',
  'show_appointments',
  'reschedule_appointment',
  'open_payment',
  'read_page',
  'reply',
];

/**
 * Parse and validate GPT response — extract JSON action object
 * @param {string} content - Raw GPT response text
 * @returns {Object} Parsed action response
 */
function parseActionResponse(content) {
  try {
    // Strip any markdown code fences if present
    const cleaned = content
      .replace(/```json\n?/gi, '')
      .replace(/```\n?/gi, '')
      .trim();

    const parsed = JSON.parse(cleaned);

    // Validate required fields
    if (!parsed.action || !VALID_ACTIONS.includes(parsed.action)) {
      return {
        action: 'reply',
        reply: parsed.reply || content || "I'm sorry, I didn't understand that. Could you try again?",
      };
    }

    return parsed;
  } catch {
    // If JSON parse fails, return as plain reply
    return {
      action: 'reply',
      reply: content || "I'm sorry, I didn't understand that. Could you try again?",
    };
  }
}

/**
 * Call GPT-4.1 with conversation history
 * @param {string} systemPrompt - Role-aware system prompt
 * @param {Array} history - Previous messages [{role, content}]
 * @param {string} userMessage - Current user input
 * @returns {Object} Parsed ActionResponse
 */
async function callGPT(systemPrompt, history, userMessage) {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userMessage },
  ];

  const response = await getOpenAIClient().chat.completions.create({
    model: 'gpt-4o',
    messages,
    temperature: 0.4,
    max_tokens: 500,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content || '';
  return parseActionResponse(content);
}

/**
 * Fallback rule-based intent parser (works without OpenAI key)
 * Handles common commands locally to reduce API calls
 */
function localFallbackParse(text, pageContext = '') {
  const lower = text.toLowerCase().trim();

  // Screen reading / Contextual questions (Bypass OpenAI to avoid 429 quota errors)
  if (/(what|read|tell|show).*(doctor|prescription|suggest|medication|medicine|pill|page|screen)/i.test(lower)) {
    if (pageContext && pageContext.includes('prescriptions')) {
      // Extract doctor name (e.g. from "Dr. Suryansh Singh cardiologist")
      const docMatch = pageContext.match(/Dr\.\s+([A-Za-z\s]+?)\s+(?:cardiologist|dermatologist|neurologist|doctor|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);
      const doctorName = docMatch ? docMatch[1].trim() : 'your doctor';
      
      // Extract medications (between "Medications" and "Patient Instructions")
      const medsMatch = pageContext.match(/Medications\s+(.+?)\s+Patient Instructions/i);
      const meds = medsMatch ? medsMatch[1].trim() : '';

      // Extract instructions (between "Patient Instructions" and "Clinical Notes" or end)
      const instMatch = pageContext.match(/Patient Instructions\s+(.+?)(?:\s+Clinical Notes|$)/i);
      const instructions = instMatch ? instMatch[1].trim() : '';

      if (meds) {
         return { 
           action: 'reply', 
           reply: `Based on your recent prescription from Dr. ${doctorName}, the suggested medications are: ${meds}. The instructions given by the doctor are: ${instructions}. Let me know if you have any questions!`
         };
      } else {
         return { 
           action: 'reply', 
           reply: `I see you're looking at your prescriptions, but I couldn't find specific medications listed in the most recent one.` 
         };
      }
    }
    return { 
      action: 'reply', 
      reply: "I'm sorry, I don't see any prescriptions on the screen right now. Please navigate to your prescriptions page first." 
    };
  }

  // Navigation commands
  if (/\b(open|go to|show|take me to)\b.*\bappointment/i.test(lower)) {
    return { action: 'navigate', page: 'appointments', reply: "Opening your appointments page! 📅" };
  }
  if (/\b(open|go to|show|take me to)\b.*\bdoctor/i.test(lower)) {
    return { action: 'navigate', page: 'doctors', reply: "Taking you to the doctors page! 🩺" };
  }
  if (/\b(open|go to|show|take me to)\b.*\bprofile|dashboard/i.test(lower)) {
    return { action: 'navigate', page: 'dashboard', reply: "Opening your dashboard! 👤" };
  }
  if (/\b(open|go to|show|take me to)\b.*\bchat|message/i.test(lower)) {
    return { action: 'navigate', page: 'chat', reply: "Opening chat! 💬" };
  }
  if (/\b(open|go to|show|take me to)\b.*\bprescription/i.test(lower)) {
    return { action: 'navigate', page: 'prescriptions', reply: "Opening your prescriptions! 💊" };
  }
  if (/\b(open|go to|show|take me to)\b.*\bsetting/i.test(lower)) {
    return { action: 'navigate', page: 'settings', reply: "Opening settings! ⚙️" };
  }
  if (/\b(open|go to|show|take me to)\b.*\bnotification/i.test(lower)) {
    return { action: 'navigate', page: 'notifications', reply: "Opening notifications! 🔔" };
  }
  if (/\b(open|go to|show|take me to)\b.*\bpayment/i.test(lower)) {
    return { action: 'navigate', page: 'appointments', reply: "Opening appointments to find payments! 💳" };
  }
  if (/(home|main page)/i.test(lower)) {
    return { action: 'navigate', page: 'home', reply: "Taking you home! 🏠" };
  }

  // Doctor search
  const specMatch = lower.match(/\b(cardiolog|dermatolog|neurolog|orthoped|pediatric|psychiatr|gynecolog|urolog|oncolog|pulmonolog|ophthalmolog|dentist|endocrinolog|gastroenterolog|rheumatolog|general|skin|heart|brain|bone|child|mental|eye|stomach)\w*/i);
  if (specMatch && /\b(find|search|show|book|look for|need)\b/i.test(lower)) {
    const spec = specMatch[0];
    return { action: 'search_doctors', specialization: spec, reply: `Searching for ${spec} doctors! 🔍` };
  }

  // General doctor availability
  if (/\b(how many|show|list|all|available|find|search)\b.*\bdoctor/i.test(lower)) {
    return { action: 'search_doctors', specialization: null, reply: "Here are the available doctors! Let's take a look. 🩺" };
  }

  // Symptom-based specialist suggestion
  if (/chest pain|heart/i.test(lower)) {
    return { action: 'suggest_specialist', specialist: 'Cardiologist', reason: 'chest pain symptoms', reply: "Based on your symptoms, you should consult a **Cardiologist**. I cannot diagnose conditions, but a heart specialist can properly evaluate chest pain. Would you like me to find Cardiologists near you? 🫀" };
  }
  if (/skin|rash|itching|acne/i.test(lower)) {
    return { action: 'suggest_specialist', specialist: 'Dermatologist', reason: 'skin-related symptoms', reply: "For skin-related concerns, you should consult a **Dermatologist**. Would you like me to find one? 🩺" };
  }
  if (/head|headache|migraine|brain/i.test(lower)) {
    return { action: 'suggest_specialist', specialist: 'Neurologist', reason: 'neurological symptoms', reply: "For headache or brain-related symptoms, a **Neurologist** is the right specialist. Want me to find one? 🧠" };
  }
  if (/bone|joint|knee|back pain|spine/i.test(lower)) {
    return { action: 'suggest_specialist', specialist: 'Orthopedic', reason: 'bone/joint symptoms', reply: "For bone or joint issues, an **Orthopedic specialist** can help. Shall I find one for you? 🦴" };
  }
  if (/eye|vision|blur/i.test(lower)) {
    return { action: 'suggest_specialist', specialist: 'Ophthalmologist', reason: 'eye-related symptoms', reply: "For eye or vision concerns, an **Ophthalmologist** is the right doctor. Want me to search for one? 👁️" };
  }
  if (/child|baby|kid/i.test(lower)) {
    return { action: 'suggest_specialist', specialist: 'Pediatrician', reason: 'child-related health concern', reply: "For child health concerns, a **Pediatrician** specializes in children's care. Want me to find one? 👶" };
  }
  if (/stomach|digestion|abdomen/i.test(lower)) {
    return { action: 'suggest_specialist', specialist: 'Gastroenterologist', reason: 'digestive symptoms', reply: "For digestive or stomach issues, a **Gastroenterologist** is the specialist you need. Shall I find one? 🏥" };
  }
  if (/fever|cold|flu|general|not feeling|sick/i.test(lower)) {
    return { action: 'suggest_specialist', specialist: 'General Physician', reason: 'general illness symptoms', reply: "For general illness symptoms, a **General Physician** is the best starting point. Want me to find one? 🩺" };
  }

  // Screen reading is handled by passing pageContext to GPT-4 directly. No local fallback needed.

  // Booking WITH a specific doctor name — e.g. "book with Dr. Smith" / "book appointment with John"
  const bookWithNameMatch = lower.match(
    /\b(?:book|schedule|appointment)\b.*?\bwith\b\s+(?:dr\.?\s+)?([a-z][a-z\s]{1,30}?)(?:\s+doctor|\s+physician|\s+appointment|$)/i
  );
  if (bookWithNameMatch && bookWithNameMatch[1]) {
    const doctorName = bookWithNameMatch[1].trim();
    // Filter out generic words that aren't names
    const genericWords = ['a', 'an', 'the', 'any', 'my', 'your', 'best', 'good', 'available'];
    const isName = !genericWords.includes(doctorName.toLowerCase());
    if (isName && doctorName.length > 2) {
      return {
        action: 'open_booking',
        doctorName: doctorName,
        reply: `Opening booking page for Dr. ${doctorName}. When would you like to schedule your appointment?`,
      };
    }
  }

  // Generic booking — starts multi-step flow
  if (/\b(book|schedule|appointment)\b/i.test(lower)) {
    return { action: 'open_booking', doctorId: null, specialization: null, reply: "Let's book an appointment! What type of doctor or specialization are you looking for? 🗓️" };
  }

  return null; // No local match — defer to GPT
}

module.exports = { callGPT, localFallbackParse };
