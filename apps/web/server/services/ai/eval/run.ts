/* Manual eval: `npm run eval:ai -w apps/web` (needs ANTHROPIC_API_KEY). Prints schema validity,
   language match and latency for a small golden set of synthetic leads. */
import { fingerprint } from '../fingerprint';
import { generateDraft, generateSuggest } from '../generate';
import type { LeadAiContext } from '../context';

const base: LeadAiContext = {
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
  message: 'Interested in the E3, what financing is available?',
  source: 'WEB_FORM',
  stage: 'CONTACTED',
  priority: 'WARM',
  score: 55,
  previousLeads: 0,
  purchases: 0,
  activities: [],
  offers: [],
  now: Date.now(),
  createdAt: Date.now() - 3_600_000,
  meta: { leadId: 'eval', version: 1, lastActivityAt: null },
};

const langs = ['it', 'de', 'fr', 'es', 'nl', 'pt', 'en', 'it', 'de', 'fr'];
const golden: LeadAiContext[] = langs.map((language, i) => ({
  ...base,
  language,
  testDriveRequested: i % 3 === 0,
  stage: i % 4 === 0 ? 'NEW' : 'CONTACTED',
  meta: { ...base.meta, leadId: `eval${i}` },
}));

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('ANTHROPIC_API_KEY not set: nothing to evaluate.');
    return;
  }
  const lat: number[] = [];
  for (const ctx of golden) {
    const t = Date.now();
    const s = await generateSuggest(ctx, fingerprint(ctx));
    const d = await generateDraft(ctx, 'WHATSAPP', fingerprint(ctx, 'WHATSAPP'));
    lat.push(Date.now() - t);
    console.log(
      `${ctx.language} suggest=${s.source} draft=${d.source} langOk=${d.draft.language === ctx.language} ${Date.now() - t}ms`,
    );
  }
  lat.sort((a, b) => a - b);
  console.log(`p50=${lat[Math.floor(lat.length / 2)]}ms p95=${lat[Math.floor(lat.length * 0.95)]}ms`);
}

void main();
