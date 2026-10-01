'use client';

import type { Role } from '@leaddesk/shared';
import { UserMenu } from './user-menu';
import { LiveStatusDot } from '@/components/live/LiveStatusDot';
import { Input } from '@/components/ui/input';
import { OffersStrip } from '@/components/offers/OffersStrip';

export function TopBar({
  user,
  title = '',
}: {
  user: { name: string; role: Role; teamName?: string | null };
  title?: string;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-slate-800 bg-slate-950 px-3 sm:gap-4 sm:px-4">
      {/* Pages own the h1; the bar only shows a label (an empty h1 here broke the outline). */}
      {title ? (
        <span className="hidden w-56 truncate text-base font-semibold lg:block">{title}</span>
      ) : null}
      <div className="hidden min-w-0 flex-1 justify-center md:flex">
        <Input
          readOnly
          placeholder="Search leads (⌘K)"
          aria-label="Search leads"
          className="h-8 max-w-md bg-slate-900"
        />
      </div>
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {/* Mount points: F15 offers strip, F12 live indicator, F02 user menu. */}
        <div data-slot="offers-strip">
          <OffersStrip />
        </div>
        <div data-slot="live-dot">
          <LiveStatusDot />
        </div>
        <div data-slot="user-menu">
          <UserMenu user={user} />
        </div>
      </div>
    </header>
  );
}
