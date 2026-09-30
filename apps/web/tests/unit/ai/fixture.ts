import type { LeadAiContext } from '@/server/services/ai/context';

export const NOW = 1_800_000_000_000;
export const MIN = 60_000;

export function makeCtx(over: Partial<LeadAiContext> = {}): LeadAiContext {
  return {
    firstName: 'Giulia',
    repFirstName: 'Sofia',
    ageBand: '35-44',
    city: 'Milan',
    country: 'IT',
    language: 'it',
    isReturning: false,
    preferredChannel: 'WHATSAPP',
    secondaryChannel: 'EMAIL',
    bestTime: 'EVENING',
    vehicle: 'EuroDrive E3',
    budgetBand: '~€30,000',
    hasTradeIn: true,
    wantsFinance: false,
    testDriveRequested: false,
    message: null,
    source: 'WEB_FORM',
    stage: 'CONTACTED',
    priority: 'WARM',
    score: 55,
    previousLeads: 0,
    purchases: 0,
    activities: [],
    offers: [],
    now: NOW,
    createdAt: NOW - 5 * 60 * MIN,
    meta: { leadId: 'lead1', version: 3, lastActivityAt: NOW - 60 * MIN },
    ...over,
  } as LeadAiContext;
}

export const act = (type: string, outcome: string | null, at: number, byRep = true) => ({
  type,
  outcome,
  note: '',
  byRep,
  system: !byRep,
  aiAssisted: false,
  at,
});
