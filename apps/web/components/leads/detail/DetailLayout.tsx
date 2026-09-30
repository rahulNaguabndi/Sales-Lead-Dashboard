'use client';

import { useState, type ReactNode } from 'react';
import { ComposerProvider } from '@/components/leads/composer';
import { Timeline } from '@/components/timeline/Timeline';
import { CustomerCard } from './CustomerCard';
import { HistoryCard } from './HistoryCard';
import { InterestCard } from './InterestCard';
import { LeadHeader } from './LeadHeader';
import { ScoreCard } from './ScoreCard';
import { leadSlots, type LeadSlotName, type LeadSlots } from './slots';
import type { ActivityPage, LeadDetail, LeadSlotUser } from './types';

type Tab = 'details' | 'timeline' | 'actions';
const TABS: { id: Tab; label: string }[] = [
  { id: 'details', label: 'Details' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'actions', label: 'Actions' },
];

export function DetailLayout({
  detail,
  initialActivities,
  currentUser,
  slots = leadSlots,
}: {
  detail: LeadDetail;
  initialActivities: ActivityPage;
  currentUser: LeadSlotUser;
  slots?: LeadSlots;
}) {
  const [tab, setTab] = useState<Tab>('timeline');
  const { lead, customer, permissions } = detail;
  const slotProps = { lead, customer, permissions, currentUser };

  const slot = (name: LeadSlotName): ReactNode => {
    const Slot = slots[name];
    return Slot ? <Slot {...slotProps} /> : null;
  };

  // Mobile (<1024px): one column at a time via tabs, Timeline first. Desktop: all three columns.
  const show = (id: Tab) => `${tab === id ? 'block' : 'hidden'} space-y-4 lg:block`;

  return (
    <ComposerProvider>
      <div className="space-y-4 p-4 lg:p-6">
        <LeadHeader detail={detail} actions={slot('headerActions')} />
        {slot('liveNote')}

        <div role="tablist" aria-label="Lead sections" className="flex gap-1 lg:hidden">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`rounded-md px-3 py-1.5 text-sm ${
                tab === t.id ? 'bg-muted font-medium' : 'text-muted-foreground'
              }`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)_minmax(0,300px)]">
          <div data-region="left" className={show('details')}>
            <CustomerCard customer={customer} extras={slot('customerExtras')} />
            {slot('channels')}
            <InterestCard lead={lead} />
            <HistoryCard history={detail.history} />
          </div>
          <div data-region="center" className={show('timeline')}>
            {slots.composer ? (
              slot('composer')
            ) : !permissions.canLogActivity && permissions.canClaim ? (
              <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
                Claim this lead to work on it
              </p>
            ) : null}
            <Timeline leadId={lead.id} initial={initialActivities} />
          </div>
          <div data-region="right" className={show('actions')}>
            <ScoreCard lead={lead} />
            {slot('followUps')}
            {slot('offers')}
            {slot('ai')}
          </div>
        </div>
      </div>
    </ComposerProvider>
  );
}
