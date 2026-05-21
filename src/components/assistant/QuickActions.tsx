/**
 * MediAI Quick Actions
 * Predefined command chips shown when assistant opens.
 */

import { Calendar, Search, User, Stethoscope, FileText, Bell } from 'lucide-react';

interface QuickAction {
  id: string;
  label: string;
  command: string;
  icon: React.ReactNode;
  color: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'appointments',
    label: 'My Appointments',
    command: 'Show my appointments',
    icon: <Calendar size={14} />,
    color: 'from-teal-500/20 to-teal-600/20 border-teal-500/30 text-teal-300 hover:border-teal-400',
  },
  {
    id: 'find-doctor',
    label: 'Find a Doctor',
    command: 'Show all doctors',
    icon: <Search size={14} />,
    color: 'from-blue-500/20 to-blue-600/20 border-blue-500/30 text-blue-300 hover:border-blue-400',
  },
  {
    id: 'book',
    label: 'Book Appointment',
    command: 'Book an appointment',
    icon: <Stethoscope size={14} />,
    color: 'from-violet-500/20 to-violet-600/20 border-violet-500/30 text-violet-300 hover:border-violet-400',
  },
  {
    id: 'profile',
    label: 'My Profile',
    command: 'Open my profile',
    icon: <User size={14} />,
    color: 'from-emerald-500/20 to-emerald-600/20 border-emerald-500/30 text-emerald-300 hover:border-emerald-400',
  },
  {
    id: 'prescriptions',
    label: 'Prescriptions',
    command: 'Show my prescriptions',
    icon: <FileText size={14} />,
    color: 'from-amber-500/20 to-amber-600/20 border-amber-500/30 text-amber-300 hover:border-amber-400',
  },
  {
    id: 'notifications',
    label: 'Notifications',
    command: 'Open notifications',
    icon: <Bell size={14} />,
    color: 'from-rose-500/20 to-rose-600/20 border-rose-500/30 text-rose-300 hover:border-rose-400',
  },
];

interface QuickActionsProps {
  onAction: (command: string) => void;
  disabled?: boolean;
}

export function QuickActions({ onAction, disabled }: QuickActionsProps) {
  return (
    <div className="px-3 py-2">
      <p className="text-xs text-white/40 mb-2 font-medium tracking-wide uppercase">Quick Actions</p>
      <div className="grid grid-cols-2 gap-1.5">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.id}
            id={`quick-action-${action.id}`}
            disabled={disabled}
            onClick={() => onAction(action.command)}
            className={`
              flex items-center gap-1.5 px-2.5 py-2 rounded-lg border
              bg-gradient-to-r text-xs font-medium
              transition-all duration-200 
              hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]
              disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100
              ${action.color}
            `}
          >
            <span className="flex-shrink-0">{action.icon}</span>
            <span className="truncate">{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
