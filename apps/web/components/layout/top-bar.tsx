'use client';

import type { Role } from '@leaddesk/shared';
import { UserMenu } from './user-menu';
import { Input } from '@/components/ui/input';

export function TopBar({
  user,
  title = '',
}: {
  user: { name: string; role: Role; teamName?: string | null };
  title?: string;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b border-slate-800 bg-slate-950 px-4">
      <h1 className="w-56 truncate text-base font-semibold">{title}</h1>
      <div className="flex flex-1 justify-center">
        <Input
          readOnly
          placeholder="Search leads (⌘K)"
          aria-label="Search leads"
          className="h-8 max-w-md bg-slate-900"
        />
      </div>
      <div className="flex items-center gap-3">
        {/* Mount points: F15 offers strip, F12 live indicator, F02 user menu. */}
        <div data-slot="offers-strip" />
        <div data-slot="live-dot" />
        <div data-slot="user-menu">
          <UserMenu user={user} />
        </div>
      </div>
    </header>
  );
}
