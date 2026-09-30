import type { LeadSource, Stage, LostReason, Priority } from '@leaddesk/shared';
import type * as schema from '../schema';

export type TeamRow = typeof schema.teams.$inferInsert;
export type UserRow = typeof schema.users.$inferInsert;
export type CustomerRow = typeof schema.customers.$inferInsert & { id: string };
export type OfferRow = typeof schema.offers.$inferInsert;
export type LeadRow = typeof schema.leads.$inferInsert;
export type ActivityRow = typeof schema.activities.$inferInsert;
export type StageHistoryRow = typeof schema.stageHistory.$inferInsert;
export type FollowUpRow = typeof schema.followUps.$inferInsert;
export type PurchaseRow = typeof schema.purchases.$inferInsert;

export type OrgResult = {
  teams: TeamRow[];
  users: UserRow[];
  teamByRegion: Record<string, string>;
  vpId: string;
  managerIds: string[];
  repsByTeam: Record<string, string[]>;
  repIdByName: Record<string, string>;
  repFactor: Record<string, number>;
};

/** Everything needed to build one lead and its timeline. */
export type LeadPlan = {
  id: string;
  customer: CustomerRow;
  teamId: string;
  ownerId: string | null;
  source: LeadSource;
  sourceDetail: string | null;
  createdAt: number;
  stage: Stage;
  vehicleModel: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  hasTradeIn: boolean;
  wantsFinance: boolean;
  testDriveRequested: boolean;
  message: string | null;
  /** Base leads may be re-owned by the rep-imbalance scenario; scenario leads may not. */
  movable: boolean;
  /** Timestamp of the last user activity for open/cold leads (default: a recent time). */
  endAt?: number;
  /** Stage NEW with an owner but no contact activity. */
  noContact?: boolean;
  /** Stage NEW, owned, with only an internal NOTE. */
  onlyNote?: boolean;
  lostReason?: LostReason;
  forceHot?: boolean;
  priorityHint?: Priority;
  /** Rep-imbalance scenario: open lead should look recently contacted (true) or neglected. */
  recentContact?: boolean;
  activityCount?: number;
};

export type BuiltLead = {
  lead: LeadRow;
  activities: ActivityRow[];
  history: StageHistoryRow[];
  purchase?: PurchaseRow;
  doneFollowUp?: FollowUpRow;
};
