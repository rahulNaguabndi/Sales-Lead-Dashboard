import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';
import {
  ACTIVITY_KINDS,
  ACTIVITY_TYPES,
  AGE_BANDS,
  ASSIGN_STRATEGIES,
  BEST_TIMES,
  CHANNELS,
  DISCOUNT_TYPES,
  FOLLOW_UP_STATUSES,
  LEAD_SOURCES,
  LOST_REASONS,
  OUTCOMES,
  PRIORITIES,
  ROLES,
  STAGES,
  TEAM_REGIONS,
} from '@leaddesk/shared';

/** Unix-ms timestamp column. */
const ts = (name: string) => integer(name);
/** Boolean stored as 0/1. */
const bool = (name: string) => integer(name, { mode: 'boolean' });
/** Typed JSON stored as text. */
const json = <T>(name: string) => text(name, { mode: 'json' }).$type<T>();

export type ScoreBreakdown = {
  intent: number;
  source: number;
  customer: number;
  freshness: number;
  engagement: number;
};

export type OfferEligibility = {
  customerType?: 'RETURNING' | 'NEW' | 'ANY';
  models?: string[];
  countries?: string[];
  requiresTradeIn?: boolean;
  requiresFinance?: boolean;
  minBudget?: number;
  sources?: string[];
};

export const teams = sqliteTable('teams', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  region: text('region', { enum: TEAM_REGIONS }).notNull(),
  countries: json<string[]>('countries').notNull(),
  // Circular reference to users; enforced in app + seed order.
  managerId: text('manager_id'),
  autoAssign: bool('auto_assign').notNull().default(true),
  assignStrategy: text('assign_strategy', { enum: ASSIGN_STRATEGIES })
    .notNull()
    .default('LOAD_BALANCED'),
  rrCursor: text('rr_cursor'),
});

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role', { enum: ROLES }).notNull(),
    managerId: text('manager_id').references((): AnySQLiteColumn => users.id),
    teamId: text('team_id').references(() => teams.id),
    languages: json<string[]>('languages').notNull(),
    avatarColor: text('avatar_color').notNull(),
    isActive: bool('is_active').notNull().default(true),
    maxOpenLeads: integer('max_open_leads').notNull().default(25),
    lastAssignedAt: ts('last_assigned_at'),
    tokenVersion: integer('token_version').notNull().default(0),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [uniqueIndex('users_email_uq').on(t.email), index('users_manager_idx').on(t.managerId)],
);

export const customers = sqliteTable(
  'customers',
  {
    id: text('id').primaryKey(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    email: text('email'),
    phone: text('phone'),
    country: text('country').notNull(),
    city: text('city'),
    age: integer('age'),
    ageBand: text('age_band', { enum: AGE_BANDS }).notNull().default('UNKNOWN'),
    language: text('language').notNull(),
    preferredChannel: text('preferred_channel', { enum: CHANNELS }).notNull(),
    secondaryChannel: text('secondary_channel', { enum: CHANNELS }),
    bestTime: text('best_time', { enum: BEST_TIMES }).notNull().default('ANYTIME'),
    isReturning: bool('is_returning').notNull().default(false),
    marketingConsent: bool('marketing_consent').notNull().default(false),
    searchText: text('search_text').notNull().default(''),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [
    check('customers_contact_chk', sql`${t.email} IS NOT NULL OR ${t.phone} IS NOT NULL`),
    index('customers_phone_idx').on(t.phone),
    index('customers_email_idx').on(t.email),
    index('customers_search_idx').on(t.searchText),
  ],
);

// offers is declared before leads because leads.applied_offer_id references it.
export const offers = sqliteTable('offers', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  discountType: text('discount_type', { enum: DISCOUNT_TYPES }).notNull(),
  value: integer('value'),
  validFrom: ts('valid_from').notNull(),
  validTo: ts('valid_to').notNull(),
  eligibility: json<OfferEligibility>('eligibility').notNull(),
  isActive: bool('is_active').notNull().default(true),
  createdBy: text('created_by').references(() => users.id),
  createdAt: ts('created_at').notNull(),
});

export const leads = sqliteTable(
  'leads',
  {
    id: text('id').primaryKey(),
    reference: text('reference').notNull(),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id),
    ownerId: text('owner_id').references(() => users.id),
    source: text('source', { enum: LEAD_SOURCES }).notNull(),
    sourceDetail: text('source_detail'),
    stage: text('stage', { enum: STAGES }).notNull().default('NEW'),
    vehicleModel: text('vehicle_model'),
    budgetMin: integer('budget_min'),
    budgetMax: integer('budget_max'),
    hasTradeIn: bool('has_trade_in').notNull().default(false),
    wantsFinance: bool('wants_finance').notNull().default(false),
    testDriveRequested: bool('test_drive_requested').notNull().default(false),
    message: text('message'),
    score: integer('score').notNull().default(0),
    priority: text('priority', { enum: PRIORITIES }).notNull().default('COOL'),
    scoreBreakdown: json<ScoreBreakdown>('score_breakdown').notNull(),
    attemptCount: integer('attempt_count').notNull().default(0),
    dealValue: integer('deal_value'),
    appliedOfferId: text('applied_offer_id').references(() => offers.id),
    lostReason: text('lost_reason', { enum: LOST_REASONS }),
    lostNote: text('lost_note'),
    firstResponseAt: ts('first_response_at'),
    lastActivityAt: ts('last_activity_at'),
    lastContactAt: ts('last_contact_at'),
    assignedAt: ts('assigned_at'),
    closedAt: ts('closed_at'),
    createdAt: ts('created_at').notNull(),
    updatedAt: ts('updated_at').notNull(),
    version: integer('version').notNull().default(0),
  },
  (t) => [
    uniqueIndex('leads_reference_uq').on(t.reference),
    index('leads_owner_stage_idx').on(t.ownerId, t.stage),
    index('leads_team_owner_idx').on(t.teamId, t.ownerId),
    index('leads_created_idx').on(t.createdAt),
    index('leads_last_activity_idx').on(t.lastActivityAt),
    index('leads_stage_last_contact_idx').on(t.stage, t.lastContactAt),
    index('leads_source_idx').on(t.source),
    index('leads_priority_score_idx').on(t.priority, t.score),
  ],
);

export const activities = sqliteTable(
  'activities',
  {
    id: text('id').primaryKey(),
    leadId: text('lead_id')
      .notNull()
      .references(() => leads.id),
    actorId: text('actor_id').references(() => users.id),
    kind: text('kind', { enum: ACTIVITY_KINDS }).notNull(),
    type: text('type', { enum: ACTIVITY_TYPES }).notNull(),
    outcome: text('outcome', { enum: OUTCOMES }),
    note: text('note').notNull().default(''),
    aiAssisted: bool('ai_assisted').notNull().default(false),
    metadata: json<Record<string, unknown>>('metadata'),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [index('activities_lead_time_idx').on(t.leadId, t.createdAt)],
);

export const stageHistory = sqliteTable(
  'stage_history',
  {
    id: text('id').primaryKey(),
    leadId: text('lead_id')
      .notNull()
      .references(() => leads.id),
    fromStage: text('from_stage', { enum: STAGES }),
    toStage: text('to_stage', { enum: STAGES }).notNull(),
    changedBy: text('changed_by').references(() => users.id),
    reason: text('reason'),
    changedAt: ts('changed_at').notNull(),
  },
  (t) => [index('stage_history_lead_time_idx').on(t.leadId, t.changedAt)],
);

export const followUps = sqliteTable(
  'follow_ups',
  {
    id: text('id').primaryKey(),
    leadId: text('lead_id')
      .notNull()
      .references(() => leads.id),
    assignedTo: text('assigned_to')
      .notNull()
      .references(() => users.id),
    dueAt: ts('due_at').notNull(),
    status: text('status', { enum: FOLLOW_UP_STATUSES }).notNull().default('PENDING'),
    note: text('note'),
    createdBy: text('created_by').references(() => users.id),
    createdAt: ts('created_at').notNull(),
    completedAt: ts('completed_at'),
    completedByActivityId: text('completed_by_activity_id').references(() => activities.id),
  },
  (t) => [index('follow_ups_assignee_status_due_idx').on(t.assignedTo, t.status, t.dueAt)],
);

export const purchases = sqliteTable(
  'purchases',
  {
    id: text('id').primaryKey(),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    leadId: text('lead_id').references(() => leads.id),
    vehicleModel: text('vehicle_model').notNull(),
    amount: integer('amount').notNull(),
    purchasedAt: ts('purchased_at').notNull(),
  },
  (t) => [index('purchases_customer_idx').on(t.customerId)],
);

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    actorId: text('actor_id').references(() => users.id),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id').notNull(),
    before: json<unknown>('before'),
    after: json<unknown>('after'),
    meta: json<Record<string, unknown>>('meta'),
    ip: text('ip'),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [
    index('audit_entity_idx').on(t.entity, t.entityId),
    index('audit_created_idx').on(t.createdAt),
  ],
);
