'use client';

import { Calendar, FileText, Mail, MessageCircle, MessageSquare, Phone, Car } from 'lucide-react';
import type { ComponentType } from 'react';
import { USER_ACTIVITY_TYPES, type UserActivityType } from '@leaddesk/shared';
import { cn } from '@/lib/utils';

export const TYPE_LABELS: Record<UserActivityType, string> = {
  CALL: 'Call',
  WHATSAPP: 'WhatsApp',
  SMS: 'SMS',
  EMAIL: 'Email',
  MEETING: 'Meeting',
  TEST_DRIVE: 'Test drive',
  NOTE: 'Note',
};

const ICONS: Record<UserActivityType, ComponentType<{ className?: string }>> = {
  CALL: Phone,
  WHATSAPP: MessageCircle,
  SMS: MessageSquare,
  EMAIL: Mail,
  MEETING: Calendar,
  TEST_DRIVE: Car,
  NOTE: FileText,
};

export type TypeSegmentedControlProps = {
  value: UserActivityType;
  onChange: (type: UserActivityType) => void;
  disabled?: boolean;
};

/** Radio group of the seven activity types. Icon + text labels; keys 1-7 select (see composer). */
export function TypeSegmentedControl({ value, onChange, disabled }: TypeSegmentedControlProps) {
  return (
    <div role="radiogroup" aria-label="Activity type" className="flex flex-wrap gap-1">
      {USER_ACTIVITY_TYPES.map((type, i) => {
        const Icon = ICONS[type];
        const selected = type === value;
        return (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            title={`${TYPE_LABELS[type]} (${i + 1})`}
            onClick={() => onChange(type)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected
                ? 'border-blue-600 bg-blue-600/15 text-blue-200'
                : 'border-slate-700 text-slate-300 hover:bg-slate-800',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            <span>{TYPE_LABELS[type]}</span>
          </button>
        );
      })}
    </div>
  );
}
