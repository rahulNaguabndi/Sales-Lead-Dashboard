import { CHANNELS, renderTemplate, resolveTemplateLang, type Channel } from '@leaddesk/shared';
import { contactActivities, type LeadAiContext } from './context';
import type { DraftOutput, SuggestOutput } from './schemas';

const CLOSED = ['WON', 'LOST'];
const BEFORE_TEST_DRIVE = ['NEW', 'CONTACTED', 'QUALIFIED'];
const HOT_UNTOUCHED_MS = 30 * 60_000;

type Action = SuggestOutput['nextBestAction'];

function channelAction(channel: Channel): Action['action'] {
  return channel;
}

/** Secondary channel, or WhatsApp/SMS when the customer's primary channel is the phone. */
function switchChannel(ctx: LeadAiContext): Channel {
  if (ctx.secondaryChannel && ctx.secondaryChannel !== 'CALL') return ctx.secondaryChannel;
  if (ctx.preferredChannel === 'CALL') return ctx.secondaryChannel ?? 'WHATSAPP';
  return ctx.preferredChannel === 'WHATSAPP' ? 'SMS' : 'WHATSAPP';
}

function bestTimeText(bestTime: string): string {
  switch (bestTime) {
    case 'MORNING':
      return 'Tomorrow morning';
    case 'AFTERNOON':
      return 'This afternoon';
    case 'EVENING':
      return 'This evening (after 18:00)';
    default:
      return 'Today';
  }
}

function relative(ts: number, now: number): string {
  const min = Math.max(0, Math.round((now - ts) / 60_000));
  if (min < 60) return `${min} min ago`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h ago`;
  return `${Math.round(min / 1440)} d ago`;
}

function pickAction(ctx: LeadAiContext): { a: Action; confidence: SuggestOutput['confidence'] } {
  const contacts = contactActivities(ctx);
  const lastContact = contacts[contacts.length - 1];
  const lastUser = [...ctx.activities].reverse().find((x) => x.byRep);
  const offer = ctx.offers[0];
  const pref = ctx.preferredChannel;

  // 1. Closed
  if (CLOSED.includes(ctx.stage))
    return {
      a: { action: 'WAIT', channel: null, timing: 'No action', reason: 'Lead closed', offerId: null },
      confidence: 'high',
    };
  // 2. New and untouched
  if (ctx.stage === 'NEW' && contacts.length === 0)
    return {
      a: {
        action: channelAction(pref),
        channel: pref,
        timing: 'Now',
        reason: 'New lead, respond within SLA',
        offerId: null,
      },
      confidence: 'high',
    };
  // 3. Hot and untouched
  const lastTouch = lastUser?.at ?? ctx.createdAt;
  if (ctx.priority === 'HOT' && ctx.now - lastTouch > HOT_UNTOUCHED_MS)
    return {
      a: {
        action: 'ESCALATE_TO_MANAGER',
        channel: null,
        timing: 'Now',
        reason: 'Hot lead untouched for more than 30 minutes',
        offerId: null,
      },
      confidence: 'high',
    };
  // 4. Repeated no-answer
  if (contacts.length >= 2 && lastContact?.outcome === 'NO_ANSWER') {
    const ch = switchChannel(ctx);
    return {
      a: {
        action: channelAction(ch),
        channel: ch,
        timing: bestTimeText(ctx.bestTime),
        reason: `${contacts.length} attempts, last unanswered; try another channel`,
        offerId: null,
      },
      confidence: 'medium',
    };
  }
  // 5. Test drive requested
  if (ctx.testDriveRequested && BEFORE_TEST_DRIVE.includes(ctx.stage))
    return {
      a: {
        action: 'SCHEDULE_TEST_DRIVE',
        channel: pref,
        timing: bestTimeText(ctx.bestTime),
        reason: 'Customer asked for a test drive',
        offerId: null,
      },
      confidence: 'medium',
    };
  // 6. Applicable offer
  if (offer)
    return {
      a: {
        action: 'SEND_OFFER',
        channel: pref,
        timing: bestTimeText(ctx.bestTime),
        reason: `Eligible offer: ${offer.title}`,
        offerId: offer.id,
      },
      confidence: 'medium',
    };
  // 7. Cold revival
  if (ctx.stage === 'COLD')
    return {
      a: {
        action: channelAction(pref),
        channel: pref,
        timing: bestTimeText(ctx.bestTime),
        reason: 'Lead went cold; try to revive it',
        offerId: null,
      },
      confidence: 'low',
    };
  // 8. Default
  return {
    a: {
      action: channelAction(pref),
      channel: pref,
      timing: bestTimeText(ctx.bestTime),
      reason: 'Keep the conversation going on the preferred channel',
      offerId: null,
    },
    confidence: 'low',
  };
}

export function ruleSummary(ctx: LeadAiContext): string {
  const contacts = contactActivities(ctx);
  const last = contacts[contacts.length - 1];
  const who = [ctx.firstName, ctx.ageBand, ctx.city].filter(Boolean).join(', ');
  const parts = [`${who}${ctx.isReturning ? ' · returning customer' : ''}.`];
  const interest = [
    `Interested in ${ctx.vehicle ?? 'a vehicle'}${ctx.budgetBand ? ` (${ctx.budgetBand})` : ''}`,
    ctx.hasTradeIn ? 'trade-in' : '',
    ctx.wantsFinance ? 'finance' : '',
  ].filter(Boolean);
  parts.push(`${interest.join(', ')}.`);
  parts.push(
    last
      ? `${contacts.length} touch${contacts.length === 1 ? '' : 'es'}; last: ${last.type}${last.outcome ? ` - ${last.outcome}` : ''} (${relative(last.at, ctx.now)}).`
      : 'No contact yet.',
  );
  parts.push(`Stage ${ctx.stage} · ${ctx.priority} ${ctx.score}.`);
  return parts.join(' ').slice(0, 600);
}

export function ruleSuggest(ctx: LeadAiContext): SuggestOutput {
  const { a, confidence } = pickAction(ctx);
  return { summary: ruleSummary(ctx), nextBestAction: a, confidence };
}

/** Template draft. `templateLanguage` is set when the customer's language is unsupported (English used). */
export function ruleDraft(
  ctx: LeadAiContext,
  channel: Exclude<Channel, 'CALL'>,
): { draft: DraftOutput; templateLanguage?: string } {
  const { lang, fellBack } = resolveTemplateLang(ctx.language);
  const offer = ctx.offers[0];
  const key = offer ? 'offer_share' : ctx.meta.lastActivityAt == null ? 'first_contact' : 'follow_up';
  const rendered = renderTemplate(key, lang, {
    firstName: ctx.firstName,
    repFirstName: ctx.repFirstName,
    dealership: 'EuroDrive Motors',
    model: ctx.vehicle ?? '',
    offer: offer?.title,
  });
  const limit = channel === 'EMAIL' ? 1000 : 600;
  return {
    draft: {
      channel,
      language: lang,
      subject: channel === 'EMAIL' ? rendered.subject.slice(0, 120) : null,
      body: rendered.body.slice(0, limit),
      offerId: offer?.id ?? null,
    },
    ...(fellBack ? { templateLanguage: 'en' } : {}),
  };
}

export const DRAFT_CHANNELS = CHANNELS.filter((c) => c !== 'CALL') as Exclude<Channel, 'CALL'>[];
