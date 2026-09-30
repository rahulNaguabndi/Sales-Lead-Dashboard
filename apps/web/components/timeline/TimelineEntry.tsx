'use client';

import { useState } from 'react';
import {
  Calendar,
  Car,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  Sparkles,
  StickyNote,
  type LucideIcon,
} from 'lucide-react';
import type { ActivityItem } from '@/components/leads/detail/types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { RelativeTime } from './RelativeTime';

const TYPE_META: Record<string, { label: string; Icon: LucideIcon }> = {
  CALL: { label: 'Call', Icon: Phone },
  WHATSAPP: { label: 'WhatsApp', Icon: MessageCircle },
  SMS: { label: 'SMS', Icon: MessageSquare },
  EMAIL: { label: 'Email', Icon: Mail },
  MEETING: { label: 'Meeting', Icon: Calendar },
  TEST_DRIVE: { label: 'Test drive', Icon: Car },
  NOTE: { label: 'Note', Icon: StickyNote },
};

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');

export function CollapsibleText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.split('\n').length > 6 || text.length > 400;
  return (
    <div>
      {/* Plain text only: React escapes it and whitespace-pre-wrap keeps line breaks. */}
      <p
        className={`whitespace-pre-wrap break-words text-sm ${long && !open ? 'line-clamp-6' : ''}`}
      >
        {text}
      </p>
      {long && (
        <button
          type="button"
          className="mt-1 text-xs text-blue-400 hover:underline"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

export function TimelineEntry({ item }: { item: ActivityItem }) {
  const meta = TYPE_META[item.type] ?? { label: titleCase(item.type), Icon: StickyNote };
  const actorName = item.actor ? item.actor.name : 'System';
  return (
    <li className="flex gap-3 rounded-md border border-border bg-card p-3">
      <meta.Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">{meta.label}</span>
          {item.outcome && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
              {titleCase(item.outcome)}
            </span>
          )}
          {item.aiAssisted && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-xs text-violet-300">
              <Sparkles aria-hidden className="h-3 w-3" />
              AI-assisted
            </span>
          )}
          <RelativeTime at={item.createdAt} className="ml-auto text-xs text-muted-foreground" />
        </div>
        {item.note && <CollapsibleText text={item.note} />}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Avatar className="h-5 w-5">
            <AvatarFallback className="text-[10px]">{actorName.slice(0, 1)}</AvatarFallback>
          </Avatar>
          <span>
            {actorName}
            {item.actor && !item.actor.isActive ? ' (inactive)' : ''}
          </span>
        </div>
      </div>
    </li>
  );
}
