import type { ActivityKind, ActivityType, LeadSource, Outcome, Priority, Stage } from './enums';

export const EVENTS_CHANNEL = 'leaddesk:events';

type Base = {
  at: number;
  teamId: string;
  ownerId: string | null;
  by: string | null;
};

export type LeadSummary = {
  id: string;
  reference: string;
  customerName: string;
  vehicleModel: string | null;
  source: LeadSource;
  stage: Stage;
  priority: Priority;
  score: number;
  ownerId: string | null;
  ownerName: string | null;
  teamId: string;
  createdAt: number;
  lastActivityAt: number | null;
  nextFollowUpAt: number | null;
  isReturning: boolean;
  slaStatus: 'ok' | 'breached' | null;
};

export type ActivityDTO = {
  id: string;
  leadId: string;
  actorId: string | null;
  actorName: string | null;
  kind: ActivityKind;
  type: ActivityType;
  outcome: Outcome | null;
  note: string;
  aiAssisted: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: number;
};

export type LeadDeskEvent =
  | (Base & { type: 'lead.created'; lead: LeadSummary })
  | (Base & {
      type: 'lead.assigned';
      leadId: string;
      fromOwnerId: string | null;
      toOwnerId: string | null;
      method: 'AUTO' | 'MANUAL' | 'CLAIM';
    })
  | (Base & { type: 'lead.updated'; leadId: string; changes: Partial<LeadSummary> })
  | (Base & { type: 'activity.created'; leadId: string; activity: ActivityDTO })
  | (Base & { type: 'followup.due'; followUpId: string; leadId: string; dueAt: number })
  | (Omit<Base, 'ownerId' | 'teamId'> & {
      type: 'offer.changed';
      offerId: string;
      teamId: null;
      ownerId: null;
    });
