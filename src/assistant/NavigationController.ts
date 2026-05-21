/**
 * MediAI Navigation Controller
 * Maps page names from AI responses to actual React Router paths.
 */

export type PageName =
  | 'home'
  | 'dashboard'
  | 'appointments'
  | 'doctors'
  | 'chat'
  | 'messages'
  | 'prescriptions'
  | 'notifications'
  | 'settings'
  | 'medical-documents'
  | 'past-appointments'
  | 'specializations'
  | 'about'
  | 'contact'
  | 'book'
  | 'payment'
  | 'profile'
  | 'doctor-dashboard';

const PAGE_ROUTES: Record<string, string> = {
  home: '/',
  index: '/',
  landing: '/',
  dashboard: '/dashboard',
  profile: '/dashboard',
  'patient-dashboard': '/dashboard',
  'doctor-dashboard': '/doctor',
  doctor: '/doctor',
  appointments: '/appointments',
  appointment: '/appointments',
  'past-appointments': '/doctor/past-appointments',
  'past appointments': '/doctor/past-appointments',
  doctors: '/doctors',
  'find doctor': '/doctors',
  'find doctors': '/doctors',
  'find a doctor': '/doctors',
  chat: '/chat',
  messages: '/messages',
  message: '/messages',
  prescriptions: '/prescriptions',
  prescription: '/prescriptions',
  notifications: '/notifications',
  notification: '/notifications',
  settings: '/settings',
  setting: '/settings',
  'medical-documents': '/medical-documents',
  'medical documents': '/medical-documents',
  records: '/medical-documents',
  'medical records': '/medical-documents',
  specializations: '/specializations',
  specialization: '/specializations',
  about: '/about',
  'about us': '/about',
  contact: '/contact',
  'contact us': '/contact',
  payment: '/appointments',
  payments: '/appointments',
};

/**
 * Resolve a page name string to a URL path
 * @param page - Page name from AI response
 * @param params - Optional path params (e.g., doctorId, appointmentId)
 */
export function resolvePage(page: string, params?: Record<string, string>): string {
  const normalized = page?.toLowerCase().trim() || '';

  // Check direct map first
  if (PAGE_ROUTES[normalized]) {
    let path = PAGE_ROUTES[normalized];

    // Replace path params
    if (params?.doctorId && path.includes(':doctorId')) {
      path = path.replace(':doctorId', params.doctorId);
    }
    if (params?.appointmentId && path.includes(':appointmentId')) {
      path = path.replace(':appointmentId', params.appointmentId);
    }

    return path;
  }

  // Fuzzy match — check if page name contains any known keyword
  for (const [key, route] of Object.entries(PAGE_ROUTES)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return route;
    }
  }

  // Default to home if nothing matches
  return '/';
}

/**
 * Build doctor search URL with query params
 */
export function buildDoctorSearchUrl(specialization?: string, name?: string): string {
  const params = new URLSearchParams();
  if (specialization) params.set('specialization', specialization.toLowerCase());
  if (name) params.set('search', name);
  const qs = params.toString();
  return qs ? `/doctors?${qs}` : '/doctors';
}

/**
 * Build a doctor search URL by name only
 */
export function buildDoctorSearchByNameUrl(name: string): string {
  return `/doctors?search=${encodeURIComponent(name)}`;
}

/**
 * Build booking URL for a specific doctor
 */
export function buildBookingUrl(doctorId: string): string {
  return `/book/${doctorId}`;
}
