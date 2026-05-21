/**
 * MediAI Action Engine
 * Maps AI action responses to concrete UI operations.
 * Uses React Router's navigate + store state.
 */

import type { NavigateFunction } from 'react-router-dom';
import type { ActionResponse } from './IntentParser';
import type { BookingFlow } from '@/store/assistantStore';
import { resolvePage, buildDoctorSearchUrl, buildDoctorSearchByNameUrl, buildBookingUrl } from './NavigationController';
import {
  advanceBookingStep,
  flowToState,
  stateToFlow,
  getBookingPrompt,
  type BookingState,
} from './BookingWorkflow';

export interface ActionEngineOptions {
  navigate: NavigateFunction;
  addMessage: (msg: { role: 'user' | 'assistant'; content: string; action?: string }) => string;
  updateMessage: (id: string, updates: Partial<{ role: 'user' | 'assistant'; content: string; action?: string; isLoading: boolean }>) => void;
  loadingId: string;        // ID of the loading bubble — actions replace it
  setThinking: (v: boolean) => void;
  setOpen: (v: boolean) => void;
  activeFlow: BookingFlow | null;
  setActiveFlow: (flow: BookingFlow | null) => void;
  userText?: string; // Original user input (needed for booking flow)
}

/**
 * Replace the loading bubble with the AI reply text.
 * This avoids adding a duplicate message.
 */
function showReply(
  content: string,
  action: string,
  options: ActionEngineOptions
): void {
  options.updateMessage(options.loadingId, {
    isLoading: false,
    content,
    action,
  });
}


/**
 * Execute an action response from the AI
 */
export function executeAction(
  response: ActionResponse,
  options: ActionEngineOptions
): void {
  const {
    navigate,
    addMessage,
    setOpen,
    activeFlow,
    setActiveFlow,
    userText = '',
  } = options;

  const action = response.action;

  // Handle active booking flow — intercept any input during a booking
  if (activeFlow && action !== 'ask_followup' && action !== 'reply') {
    handleBookingFlowInput(userText, activeFlow, options);
    return;
  }

  switch (action) {
    case 'read_page': {
      const path = window.location.pathname;
      if (path.includes('/prescriptions')) {
        // Read prescriptions from the DOM
        const cards = document.querySelectorAll('.bg-primary\\/5, .card, [class*="hover:shadow-md"]');
        if (cards.length > 0) {
          // Assume the first one is the most recent
          const firstCard = cards[0];
          const doctorNameNode = document.querySelector('.font-medium.text-foreground');
          const docName = doctorNameNode ? doctorNameNode.textContent?.replace('Dr. ', '').trim() : 'your doctor';
          
          // Find medications
          const medNodes = Array.from(firstCard.querySelectorAll('.font-semibold'));
          const medNames = medNodes
            .map(el => el.textContent?.trim())
            .filter(t => t && !['Medications', 'Patient Instructions', 'Clinical Notes'].includes(t)) as string[];
          
          // Find instructions
          const pNodes = Array.from(firstCard.querySelectorAll('p.text-muted-foreground.text-xs'));
          const instructions = pNodes.length > 0 ? pNodes[0].textContent?.trim() : '';

          let replyText = `For your recent visit with Dr. ${docName}, `;
          if (medNames.length > 0) {
            replyText += `the suggested medications are: ${medNames.join(', ')}. `;
          } else {
            replyText += `there are no specific medications listed. `;
          }
          if (instructions) {
            replyText += `The instructions are: ${instructions}.`;
          }
          showReply(replyText, 'reply', options);
        } else {
          showReply("You don't have any prescriptions listed on this page.", 'reply', options);
        }
      } else if (path.includes('/appointments') || path.includes('/dashboard')) {
        showReply("You are currently looking at your appointments. I can help you read the upcoming ones or book a new one.", 'reply', options);
      } else if (path.includes('/doctors')) {
        showReply("You are currently looking at the doctors list. Let me know if you want to search for a specific specialist.", 'reply', options);
      } else {
        showReply("I can't read the specific details of this page yet, but let me know what you're looking for!", 'reply', options);
      }
      break;
    }

    case 'navigate': {
      const path = resolvePage(response.page || '');
      showReply(
        response.reply || `Opening ${response.page}... 🔄`,
        'navigate',
        options
      );
      setTimeout(() => {
        navigate(path);
        setOpen(false);
      }, 700);
      break;
    }

    case 'search_doctors': {
      // Supports searching by specialization OR by doctor name (filter field)
      const url = response.filter
        ? buildDoctorSearchByNameUrl(response.filter)
        : buildDoctorSearchUrl(response.specialization);
      showReply(
        response.reply || (response.filter
          ? `Searching for ${response.filter}... 🔍`
          : `Searching for ${response.specialization} doctors... 🔍`),
        'search_doctors',
        options
      );
      setTimeout(() => {
        navigate(url);
        setOpen(false);
      }, 700);
      break;
    }

    case 'open_booking': {
      if (response.doctorId) {
        showReply(
          response.reply || `Opening booking for ${response.doctorName || 'doctor'}... 📋`,
          'open_booking',
          options
        );
        setTimeout(() => {
          navigate(buildBookingUrl(response.doctorId!));
          setOpen(false);
          const newFlow: BookingFlow = { step: 'datetime', doctorId: response.doctorId };
          setActiveFlow(newFlow);
        }, 700);
      } else if (response.doctorName) {
        showReply(
          response.reply || `Looking up Dr. ${response.doctorName}... 🔍`,
          'open_booking',
          options
        );
        
        // Find doctor async to get the real doctor ID for the booking page
        (async () => {
          try {
            const { default: api } = await import('@/lib/api');
            const { data: doctors } = await api.get('/doctors');
            const searchTerms = response.doctorName!.toLowerCase().split(' ').filter(t => t.length > 2);
            
            const matchedDoctor = doctors.find((d: any) => {
              const fullName = (d.user_id?.full_name || d.profile?.full_name || '').toLowerCase();
              if (fullName.includes(response.doctorName!.toLowerCase())) return true;
              return searchTerms.some(term => fullName.includes(term));
            });
            
            if (matchedDoctor) {
              const docId = matchedDoctor._id || matchedDoctor.id;
              navigate(buildBookingUrl(docId));
              setOpen(false);
              const newFlow: BookingFlow = { step: 'datetime', doctorId: docId };
              setActiveFlow(newFlow);
            } else {
              navigate(buildDoctorSearchByNameUrl(response.doctorName!));
              setOpen(false);
            }
          } catch (e) {
             navigate(buildDoctorSearchByNameUrl(response.doctorName!));
             setOpen(false);
          }
        })();
      } else {
        // Start the multi-step booking flow
        const newFlow: BookingFlow = { step: 'specialization' };
        setActiveFlow(newFlow);
        showReply(
          response.reply || getBookingPrompt('specialization'),
          'ask_followup',
          options
        );
      }
      break;
    }

    case 'show_appointments': {
      showReply(
        response.reply || 'Opening your appointments... 📅',
        'navigate',
        options
      );
      setTimeout(() => {
        navigate('/appointments');
        setOpen(false);
      }, 700);
      break;
    }

    case 'get_doctor_appointments': {
      showReply(
        response.reply || 'Opening your schedule... 🗓️',
        'navigate',
        options
      );
      setTimeout(() => {
        navigate('/doctor');
        setOpen(false);
      }, 700);
      break;
    }

    case 'suggest_specialist': {
      const msg = response.reply ||
        `Based on your symptoms, you should consult a **${response.specialist}**. I cannot diagnose conditions — only a specialist can do that. Would you like me to find a ${response.specialist}?`;
      showReply(msg, 'suggest_specialist', options);
      break;
    }

    case 'ask_followup': {
      showReply(
        response.reply || response.question || 'Could you please provide more details?',
        'ask_followup',
        options
      );
      break;
    }

    case 'reschedule_appointment': {
      showReply(
        response.requiresConfirmation
          ? `${response.reply}\n\n⚠️ Please type **confirm** to reschedule, or **cancel** to keep the original time.`
          : response.reply || 'Rescheduling your appointment...',
        'reschedule_appointment',
        options
      );
      break;
    }

    case 'open_payment': {
      if (response.appointmentId) {
        showReply(
          response.reply || 'Opening payment page... 💳',
          'navigate',
          options
        );
        setTimeout(() => {
          navigate(`/payment/${response.appointmentId}`);
          setOpen(false);
        }, 700);
      } else {
        showReply(
          response.reply || 'Please go to your appointments to find the payment link. 💳',
          'reply',
          options
        );
        setTimeout(() => {
          navigate('/appointments');
          setOpen(false);
        }, 700);
      }
      break;
    }

    case 'reply':
    default: {
      showReply(
        response.reply || "I'm here to help! What can I do for you?",
        'reply',
        options
      );
      break;
    }
  }
}

/**
 * Handle user input during an active booking flow
 * (Uses addMessage directly — no loading bubble in the booking continuation path)
 */
function handleBookingFlowInput(
  userText: string,
  activeFlow: BookingFlow,
  options: ActionEngineOptions
): void {
  const { navigate, addMessage, setOpen, setActiveFlow, updateMessage, loadingId } = options;

  const currentState = flowToState(activeFlow);
  const { nextState, promptMessage } = advanceBookingStep(currentState, userText);

  // Replace the loading bubble with booking flow reply
  updateMessage(loadingId, { isLoading: false, content: promptMessage, action: 'ask_followup' });

  if (nextState.step === 'done') {
    setActiveFlow(null);
    if (nextState.doctorId) {
      setTimeout(() => {
        navigate(buildBookingUrl(nextState.doctorId!));
        setOpen(false);
      }, 900);
    } else {
      setTimeout(() => {
        navigate('/doctors');
        setOpen(false);
      }, 900);
    }
  } else if (nextState.step === 'specialization' && currentState.step === 'confirm') {
    // User cancelled the booking
    setActiveFlow(null);
  } else {
    // Continue booking flow
    const newFlow = stateToFlow(nextState as BookingState);
    setActiveFlow(newFlow);
  }
}

