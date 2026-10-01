import type {
  ActivityKind,
  ActivityType,
  AgeBand,
  Channel,
  LeadSource,
  Outcome,
  Priority,
  Role,
  Stage,
} from '@leaddesk/shared';
import type { ScoreBreakdown } from '@/server/db/schema';

export type LeadPermissions = {
  canRead: boolean;
  canLogActivity: boolean;
  canChangeStage: boolean;
  canAssign: boolean;
  canClaim: boolean;
};

export type LeadDetail = {
  lead: {
    id: string;
    reference: string;
    stage: Stage;
    source: LeadSource;
    sourceDetail: string | null;
    vehicleModel: string | null;
    vehicleName: string | null;
    vehiclePrice: number | null;
    budgetMin: number | null;
    budgetMax: number | null;
    hasTradeIn: boolean;
    wantsFinance: boolean;
    testDriveRequested: boolean;
    message: string | null;
    score: number;
    priority: Priority;
    scoreBreakdown: ScoreBreakdown;
    ownerId: string | null;
    teamId: string;
    lostReason: string | null;
    lostNote: string | null;
    createdAt: number;
    updatedAt: number;
    lastActivityAt: number | null;
    version: number;
  };
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    country: string;
    city: string | null;
    ageBand: AgeBand;
    language: string;
    preferredChannel: Channel;
    secondaryChannel: Channel | null;
    bestTime: string;
    isReturning: boolean;
  };
  owner: { id: string; name: string; avatarColor: string; isActive: boolean } | null;
  team: { id: string; name: string };
  history: {
    previousLeads: {
      id: string;
      reference: string;
      vehicleModel: string | null;
      stage: Stage;
      createdAt: number;
      /** Null when unassigned. */
      ownerName: string | null;
      canView: boolean;
    }[];
    purchases: { vehicleModel: string; amount: number; purchasedAt: number }[];
  };
  followUps: { next: { id: string; dueAt: number; note: string | null } | null; pendingCount: number };
  permissions: LeadPermissions;
};

export type ActivityItem = {
  id: string;
  kind: ActivityKind;
  type: ActivityType;
  outcome: Outcome | null;
  note: string | null;
  actor: { id: string; name: string; avatarColor: string; isActive: boolean } | null;
  aiAssisted: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: number;
};

export type ActivityPage = { items: ActivityItem[]; nextCursor: string | null };

export type ActivityOrder = 'asc' | 'desc';
export type ActivityKindFilter = 'ALL' | ActivityKind;

export type LeadSlotUser = { id: string; name: string; role: Role; teamId: string | null };

export type LeadSlotProps = {
  lead: LeadDetail['lead'];
  customer: LeadDetail['customer'];
  permissions: LeadPermissions;
  currentUser: LeadSlotUser;
};
