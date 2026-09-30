import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DetailLayout } from './DetailLayout';
import { leadSlots, type LeadSlots } from './slots';
import type { LeadDetail, LeadSlotProps } from './types';

const detail: LeadDetail = {
  lead: {
    id: '01HZX0000000000000000000AA',
    reference: 'ED-1',
    stage: 'NEW',
    source: 'WEBSITE',
    sourceDetail: null,
    vehicleModel: 'aurora-suv',
    vehicleName: 'Aurora SUV',
    vehiclePrice: 3_890_000,
    budgetMin: null,
    budgetMax: null,
    hasTradeIn: false,
    wantsFinance: false,
    testDriveRequested: false,
    message: null,
    score: 50,
    priority: 'WARM',
    scoreBreakdown: { intent: 10, source: 5, customer: 5, freshness: 10, engagement: 0 },
    ownerId: null,
    teamId: 't',
    lostReason: null,
    lostNote: null,
    createdAt: 1,
    updatedAt: 1,
    lastActivityAt: null,
    version: 1,
  },
  customer: {
    id: 'c',
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'a@b.test',
    phone: null,
    country: 'DE',
    city: null,
    ageBand: 'UNKNOWN',
    language: 'de',
    preferredChannel: 'EMAIL',
    secondaryChannel: null,
    bestTime: 'ANYTIME',
    isReturning: false,
  },
  owner: null,
  team: { id: 't', name: 'Team' },
  history: { previousLeads: [], purchases: [] },
  followUps: { next: null, pendingCount: 0 },
  permissions: {
    canRead: true,
    canLogActivity: false,
    canChangeStage: false,
    canAssign: false,
    canClaim: true,
  },
};

const user = { id: 'u', name: 'U', role: 'REP' as const, teamId: 't' };
const render = (slots: LeadSlots) =>
  renderToStaticMarkup(
    createElement(DetailLayout, {
      detail,
      initialActivities: { items: [], nextCursor: null },
      currentUser: user,
      slots,
    }),
  );

describe('DetailLayout slots', () => {
  it('null slots render nothing', () => {
    const html = render(leadSlots);
    expect(html).not.toContain('SLOT-');
    expect(html).toContain('Ada Lovelace');
  });

  it('a registered slot renders in its region with lead, customer, permissions and user', () => {
    const Probe = (p: LeadSlotProps) =>
      createElement(
        'div',
        { id: 'probe' },
        `SLOT-${p.lead.reference}-${p.customer.firstName}-${p.permissions.canClaim}-${p.currentUser.id}`,
      );
    const html = render({ ...leadSlots, followUps: Probe });
    expect(html).toContain('SLOT-ED-1-Ada-true-u');
    const right = html.indexOf('data-region="right"');
    expect(html.indexOf('SLOT-')).toBeGreaterThan(right);
  });

  it('shows the claim prompt (composer read-only note) when the user cannot log activity but can claim', () => {
    expect(render(leadSlots)).toContain('Claim this lead to log activities');
  });
});
