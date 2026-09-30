import { desc, eq, inArray } from 'drizzle-orm';
import { monotonicFactory } from 'ulid';
import {
  VEHICLES,
  renderTemplate,
  truncateMessage,
  type AgeBand,
  type BestTime,
  type Channel,
  type PatchPreferences,
  type Stage,
  type TemplateKey,
} from '@leaddesk/shared';
import { writeAudit } from '../db/audit';
import { db, type Db } from '../db/client';
import { activities, customers, leads, purchases, users } from '../db/schema';
import { NotFoundError, ValidationError } from '../http/errors';
import { authorize, can, resolveScope } from '../policy';
import type { CurrentUser } from '../policy';
import { ADAPTERS } from './DeepLinkAdapter';

const newId = monotonicFactory();
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
const NOT_FOUND = 'Customer';

export type ProfileDeps = { database?: Db };

export type CustomerView = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  country: string;
  city: string | null;
  ageBand: AgeBand;
  language: string;
  preferredChannel: Channel;
  secondaryChannel: Channel | null;
  bestTime: BestTime;
  marketingConsent: boolean;
  isReturning: boolean;
};

export type HistoryLead =
  | {
      id: string;
      reference: string;
      stage: Stage;
      createdAt: number;
      ownerName: string | null;
      inScope: true;
    }
  | { reference: string; stage: Stage; createdAt: number; inScope: false };

export type CustomerProfile = {
  customer: CustomerView;
  history: {
    purchases: { vehicleModel: string; amount: number; purchasedAt: number }[];
    leads: HistoryLead[];
  };
};

function toView(c: typeof customers.$inferSelect): CustomerView {
  return {
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    phone: c.phone,
    email: c.email,
    country: c.country,
    city: c.city,
    ageBand: c.ageBand,
    language: c.language,
    preferredChannel: c.preferredChannel,
    secondaryChannel: c.secondaryChannel,
    bestTime: c.bestTime,
    marketingConsent: c.marketingConsent,
    isReturning: c.isReturning,
  };
}

/**
 * The lead must exist and belong to the customer (otherwise 404, so existence is not leaked) and
 * pass `action` (403 when out of scope).
 */
async function loadLeadForCustomer(
  user: CurrentUser,
  customerId: string,
  leadId: string,
  action: 'lead:read' | 'lead:write',
  database: Db,
) {
  if (!ULID_RE.test(leadId)) throw new NotFoundError(NOT_FOUND);
  const lead = database.select().from(leads).where(eq(leads.id, leadId)).get();
  if (!lead || lead.customerId !== customerId) throw new NotFoundError(NOT_FOUND);
  const scope = await resolveScope(user.id, database);
  await authorize(user, action, { kind: 'lead', lead }, { scope, database });
  return { lead, scope };
}

export async function getProfile(
  user: CurrentUser,
  customerId: string,
  leadId: string,
  deps: ProfileDeps = {},
): Promise<CustomerProfile> {
  const database = deps.database ?? db;
  const { scope } = await loadLeadForCustomer(user, customerId, leadId, 'lead:read', database);
  const customer = database.select().from(customers).where(eq(customers.id, customerId)).get();
  if (!customer) throw new NotFoundError(NOT_FOUND);

  const past = database
    .select()
    .from(leads)
    .where(eq(leads.customerId, customerId))
    .orderBy(desc(leads.createdAt), desc(leads.id))
    .all();
  const ownerIds = [...new Set(past.map((l) => l.ownerId).filter((x): x is string => !!x))];
  const owners = new Map(
    (ownerIds.length
      ? database
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(inArray(users.id, ownerIds))
          .all()
      : []
    ).map((o) => [o.id, o.name]),
  );

  const history: HistoryLead[] = [];
  for (const l of past) {
    if (l.id === leadId) continue;
    const visible = await can(user, 'lead:read', { kind: 'lead', lead: l }, { scope, database });
    history.push(
      visible
        ? {
            id: l.id,
            reference: l.reference,
            stage: l.stage,
            createdAt: l.createdAt,
            ownerName: l.ownerId ? (owners.get(l.ownerId) ?? null) : null,
            inScope: true,
          }
        : { reference: l.reference, stage: l.stage, createdAt: l.createdAt, inScope: false },
    );
  }

  const bought = database
    .select()
    .from(purchases)
    .where(eq(purchases.customerId, customerId))
    .orderBy(desc(purchases.purchasedAt))
    .all();

  return {
    customer: toView(customer),
    history: {
      purchases: bought.map((b) => ({
        vehicleModel: b.vehicleModel,
        amount: b.amount,
        purchasedAt: b.purchasedAt,
      })),
      leads: history,
    },
  };
}

const CHANNEL_LABEL: Record<Channel, string> = {
  CALL: 'Call',
  WHATSAPP: 'WhatsApp',
  SMS: 'SMS',
  EMAIL: 'Email',
};

const nice = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

function describeChange(
  before: typeof customers.$inferSelect,
  next: { preferredChannel: Channel; secondaryChannel: Channel | null; bestTime: BestTime; language: string },
): string {
  const parts: string[] = [];
  if (next.preferredChannel !== before.preferredChannel) {
    parts.push(`${CHANNEL_LABEL[before.preferredChannel]} → ${CHANNEL_LABEL[next.preferredChannel]}`);
  }
  if (next.secondaryChannel !== before.secondaryChannel) {
    const f = before.secondaryChannel ? CHANNEL_LABEL[before.secondaryChannel] : 'none';
    const t = next.secondaryChannel ? CHANNEL_LABEL[next.secondaryChannel] : 'none';
    parts.push(`secondary ${f} → ${t}`);
  }
  if (next.bestTime !== before.bestTime) {
    parts.push(`best time ${nice(before.bestTime)} → ${nice(next.bestTime)}`);
  }
  if (next.language !== before.language) parts.push(`language ${before.language} → ${next.language}`);
  return `Preferences updated: ${parts.join(', ') || 'no changes'}`;
}

/** One transaction: customer update + audit row + SYSTEM note on the viewed lead. */
export async function updatePreferences(
  user: CurrentUser,
  customerId: string,
  input: PatchPreferences,
  deps: ProfileDeps = {},
): Promise<CustomerView> {
  const database = deps.database ?? db;
  const { leadId, ...patch } = input;
  await loadLeadForCustomer(user, customerId, leadId, 'lead:write', database);

  return database.transaction((tx) => {
    const before = tx.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!before) throw new NotFoundError(NOT_FOUND);
    const preferred = patch.preferredChannel ?? before.preferredChannel;
    const secondary =
      patch.secondaryChannel === undefined ? before.secondaryChannel : patch.secondaryChannel;
    const next = {
      preferredChannel: preferred,
      // Keep the invariant secondary != preferred when only the preferred channel changed.
      secondaryChannel: secondary === preferred ? null : secondary,
      bestTime: patch.bestTime ?? before.bestTime,
      language: patch.language ?? before.language,
    };
    tx.update(customers).set(next).where(eq(customers.id, customerId)).run();

    const pick = (c: typeof next) => ({
      preferredChannel: c.preferredChannel,
      secondaryChannel: c.secondaryChannel,
      bestTime: c.bestTime,
      language: c.language,
    });
    writeAudit(tx, {
      actorId: user.id,
      action: 'customer.preferences.update',
      entity: 'customer',
      entityId: customerId,
      before: pick(before),
      after: pick(next),
      meta: { leadId },
    });
    tx.insert(activities)
      .values({
        id: newId(),
        leadId,
        actorId: user.id,
        kind: 'SYSTEM',
        type: 'NOTE',
        outcome: null,
        note: describeChange(before, next),
        aiAssisted: false,
        metadata: { source: 'customer-preferences' },
        createdAt: Date.now(),
      })
      .run();
    return toView({ ...before, ...next });
  });
}

export type ContactLink = {
  href: string;
  message: string;
  subject?: string;
  truncated: boolean;
  langUsed: string;
};

/** Optional server-side builder; read-only (no DB writes). */
export async function getContactLink(
  user: CurrentUser,
  leadId: string,
  q: { channel: Channel; template?: TemplateKey; lang?: string; offer?: string },
  deps: ProfileDeps = {},
): Promise<ContactLink> {
  const database = deps.database ?? db;
  if (!ULID_RE.test(leadId)) throw new NotFoundError('Lead');
  const lead = database.select().from(leads).where(eq(leads.id, leadId)).get();
  if (!lead) throw new NotFoundError('Lead');
  const scope = await resolveScope(user.id, database);
  await authorize(user, 'lead:read', { kind: 'lead', lead }, { scope, database });
  const customer = database.select().from(customers).where(eq(customers.id, lead.customerId)).get();
  if (!customer) throw new NotFoundError('Lead');

  const adapter = ADAPTERS[q.channel];
  const avail = adapter.isAvailable(customer);
  if (!avail.available) throw new ValidationError(avail.reason, { fields: { channel: avail.reason } });

  if (q.channel === 'CALL') {
    return { href: adapter.buildLink(customer, ''), message: '', truncated: false, langUsed: customer.language };
  }
  const key = q.template ?? 'first_contact';
  if (key === 'offer_share' && !q.offer) {
    throw new ValidationError('No applicable offer', { fields: { template: 'No applicable offer' } });
  }
  const model = VEHICLES.find((v) => v.slug === lead.vehicleModel)?.name ?? lead.vehicleModel ?? '';
  const rendered = renderTemplate(key, q.lang ?? customer.language, {
    firstName: customer.firstName,
    repFirstName: user.name.split(' ')[0],
    dealership: 'EuroDrive Motors',
    model,
    offer: q.offer,
  });
  const { text, truncated } = truncateMessage(rendered.body);
  return {
    href: adapter.buildLink(customer, text, { subject: rendered.subject }),
    message: text,
    subject: q.channel === 'EMAIL' ? rendered.subject : undefined,
    truncated,
    langUsed: rendered.langUsed,
  };
}
