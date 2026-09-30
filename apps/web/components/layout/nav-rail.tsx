'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Inbox, KanbanSquare, LayoutDashboard, ScrollText, Settings, Tag } from 'lucide-react';
import type { Role } from '@leaddesk/shared';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { getNavItems, type NavIcon } from './nav';

const ICONS: Record<NavIcon, typeof Inbox> = {
  inbox: Inbox,
  pipeline: KanbanSquare,
  dashboard: LayoutDashboard,
  offers: Tag,
  settings: Settings,
  audit: ScrollText,
};

export function NavRail({ role, pathname }: { role: Role; pathname?: string }) {
  const current = usePathname();
  const active = pathname ?? current ?? '';

  return (
    <TooltipProvider delayDuration={100}>
      <nav
        aria-label="Main"
        className="flex h-full w-14 shrink-0 flex-col items-center gap-1 border-r border-slate-800 bg-slate-900 py-3"
      >
        <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-md bg-blue-600 text-xs font-bold text-white">
          ED
        </div>
        {getNavItems(role).map((item) => {
          const Icon = ICONS[item.icon];
          const isActive = active === item.href || active.startsWith(`${item.href}/`);
          return (
            <Tooltip key={item.href}>
              <TooltipTrigger asChild>
                <Link
                  href={item.href}
                  aria-label={item.label}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex h-10 w-full items-center justify-center border-l-2 border-transparent text-slate-400 transition-colors hover:text-slate-100',
                    isActive && 'border-blue-600 text-slate-100',
                  )}
                >
                  <Icon className="h-5 w-5" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
    </TooltipProvider>
  );
}
