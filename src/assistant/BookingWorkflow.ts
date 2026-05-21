/**
 * MediAI Booking Workflow Manager
 * Multi-step state machine for appointment booking flow.
 */

import type { BookingFlow } from '@/store/assistantStore';

export type BookingStep = 'specialization' | 'doctor' | 'datetime' | 'confirm' | 'done';

export interface BookingState {
  step: BookingStep;
  specialization?: string;
  doctorId?: string;
  doctorName?: string;
  date?: string;
  time?: string;
  parsedDate?: Date | null;
  parsedTime?: string | null;
}

/**
 * Parse user reply in context of the current booking step
 */
export function advanceBookingStep(
  current: BookingState,
  userInput: string
): { nextState: BookingState; promptMessage: string } {
  const input = userInput.trim().toLowerCase();

  switch (current.step) {
    case 'specialization': {
      // Validation for specialization
      if (input.length < 3 || ['yes', 'no', 'idk', 'i dont know', 'any'].includes(input)) {
        return {
          nextState: current,
          promptMessage: `I didn't quite catch that. Please specify a valid doctor specialization, like "Cardiologist", "Dentist", or "General Physician".`,
        };
      }

      // User provides specialization, move to doctor selection
      return {
        nextState: { ...current, step: 'doctor', specialization: userInput },
        promptMessage: `Great! Looking for a **${userInput}** specialist. Let me show you available doctors. Please tell me the name of the doctor you'd like to book with.`,
      };
    }

    case 'doctor': {
      // Validation for doctor name
      if (input.length < 2 || ['yes', 'no', 'idk', 'i dont know'].includes(input)) {
        return {
          nextState: current,
          promptMessage: `Please tell me the name of the doctor you'd like to book with, or say "anyone" if you don't have a preference.`,
        };
      }

      // User selects a doctor
      return {
        nextState: { ...current, step: 'datetime', doctorName: userInput },
        promptMessage: `Excellent choice! When would you like to schedule your appointment with **${userInput}**? Please tell me the date and time (e.g., "tomorrow at 3 PM" or "Monday morning").`,
      };
    }

    case 'datetime': {
      // Parse date/time from input
      const { date, time, parsedDate, parsedTime } = parseDateTimeFromText(input);

      // Validation for datetime
      if (!date && !time) {
        return {
          nextState: current,
          promptMessage: `I couldn't recognize a valid date or time in that. Could you please specify exactly when? For example: "Tomorrow at 10 AM" or "Next Monday afternoon".`,
        };
      }

      const finalDate = date || 'To be confirmed';
      const finalTime = time || 'To be confirmed';

      return {
        nextState: { 
          ...current, 
          step: 'confirm', 
          date: finalDate, 
          time: finalTime,
          parsedDate,
          parsedTime 
        },
        promptMessage: `Perfect! Here's your appointment summary:\n\n📋 **Doctor:** ${current.doctorName || 'Selected Doctor'}\n📅 **Date:** ${finalDate}\n⏰ **Time:** ${finalTime}\n\n⚠️ **Please confirm**: Type "**confirm**" to proceed, or "**cancel**" to start over.`,
      };
    }

    case 'confirm': {
      if (input === 'confirm' || input === 'yes' || input === 'book' || input === 'proceed') {
        return {
          nextState: { ...current, step: 'done' },
          promptMessage: `✅ Great! Taking you to complete your booking. Remember to review all details before confirming. 🏥`,
        };
      } else if (input === 'cancel' || input === 'no' || input === 'stop') {
        return {
          nextState: { step: 'specialization' },
          promptMessage: `No problem! Booking cancelled. Is there anything else I can help you with? 😊`,
        };
      } else {
        return {
          nextState: current,
          promptMessage: `Please type "**confirm**" to proceed with the booking, or "**cancel**" to start over.`,
        };
      }
    }

    default:
      return {
        nextState: { step: 'specialization' },
        promptMessage: "Let's start a new booking. What type of specialist are you looking for?",
      };
  }
}

/**
 * Get the next prompt message for a booking step
 */
export function getBookingPrompt(step: BookingStep): string {
  const prompts: Record<BookingStep, string> = {
    specialization: "What type of doctor or specialist are you looking for? (e.g., Cardiologist, Dermatologist, General Physician) 🩺",
    doctor: "Which doctor would you like to book with? I can show you available doctors if you need help choosing.",
    datetime: "When would you like your appointment? Please tell me the preferred date and time. 📅",
    confirm: "Please review the details above and type **confirm** to proceed or **cancel** to start over.",
    done: "Booking initiated! Redirecting you to complete the payment. 💳",
  };
  return prompts[step];
}

/**
 * Simple date/time parser from natural language
 */
function parseDateTimeFromText(text: string): { date: string; time: string; parsedDate: Date | null; parsedTime: string | null } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  let dateStr = '';
  let timeStr = '';
  let parsedDate: Date | null = null;
  let parsedTime: string | null = null;

  // Date parsing
  if (/today/i.test(text)) {
    dateStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    parsedDate = today;
  } else if (/tomorrow/i.test(text)) {
    dateStr = tomorrow.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    parsedDate = tomorrow;
  } else {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (let i = 0; i < days.length; i++) {
      if (new RegExp(days[i], 'i').test(text)) {
        dateStr = days[i].charAt(0).toUpperCase() + days[i].slice(1);
        let targetDate = new Date(today);
        let dayOffset = i - today.getDay();
        if (dayOffset <= 0) dayOffset += 7; // Next occurrence
        targetDate.setDate(today.getDate() + dayOffset);
        parsedDate = targetDate;
        break;
      }
    }
  }

  // Time parsing
  const timeMatch = text.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)/i);
  if (timeMatch) {
    let hour = parseInt(timeMatch[1], 10);
    const min = timeMatch[2] || '00';
    const period = timeMatch[3].toUpperCase();
    timeStr = `${hour}:${min} ${period}`;
    
    if (period === 'PM' && hour < 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
    parsedTime = `${hour.toString().padStart(2, '0')}:${min}`;
  } else if (/morning/i.test(text)) {
    timeStr = '10:00 AM';
    parsedTime = '10:00';
  } else if (/afternoon/i.test(text)) {
    timeStr = '2:00 PM';
    parsedTime = '14:00';
  } else if (/evening/i.test(text)) {
    timeStr = '5:00 PM';
    parsedTime = '17:00';
  } else if (/night/i.test(text)) {
    timeStr = '7:00 PM';
    parsedTime = '19:00';
  } else {
    // Look for just a number e.g. "at 3"
    const simpleTimeMatch = text.match(/\b(1[0-2]|[1-9])\b/);
    if (simpleTimeMatch) {
      const hour = parseInt(simpleTimeMatch[1], 10);
      const isMorning = hour >= 8 && hour <= 11;
      const period = isMorning ? 'AM' : 'PM';
      timeStr = `${hour}:00 ${period}`;
      const parsedHour = period === 'PM' && hour < 12 ? hour + 12 : hour;
      parsedTime = `${parsedHour.toString().padStart(2, '0')}:00`;
    }
  }

  return { date: dateStr, time: timeStr, parsedDate, parsedTime };
}

/**
 * Convert store BookingFlow to local BookingState
 */
export function flowToState(flow: BookingFlow): BookingState {
  return {
    step: flow.step as BookingStep,
    specialization: flow.specialization,
    doctorId: flow.doctorId,
    doctorName: flow.doctorName,
    date: flow.date,
    time: flow.time,
    parsedDate: flow.parsedDate,
    parsedTime: flow.parsedTime,
  };
}

/**
 * Convert BookingState back to store BookingFlow format
 */
export function stateToFlow(state: BookingState): BookingFlow {
  return {
    step: state.step as BookingFlow['step'],
    specialization: state.specialization,
    doctorId: state.doctorId,
    doctorName: state.doctorName,
    date: state.date,
    time: state.time,
    parsedDate: state.parsedDate,
    parsedTime: state.parsedTime,
  };
}
