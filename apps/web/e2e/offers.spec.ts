import { expect, test, type APIRequestContext } from '@playwright/test';
import { signIn } from './helpers';

// Port comes from playwright.config.ts (PORT); nothing is hardcoded.
const VP = 'isabelle.laurent@eurodrive.test';
const REP = 'anna.weber@eurodrive.test'; // Team DACH

type LeadRow = { id: string };

/** Finds one of the rep's leads that the given offer title applies to (via the real endpoint). */
async function findMatchingLead(request: APIRequestContext, title: string): Promise<string | null> {
  const list = await request.get('/api/leads?view=mine&pageSize=50');
  const { items } = (await list.json()) as { items: LeadRow[] };
  for (const l of items) {
    const res = await request.get(`/api/leads/${l.id}/offers`);
    const { offers } = (await res.json()) as { offers: { offer: { title: string } }[] };
    if (offers.some((o) => o.offer.title === title)) return l.id;
  }
  return null;
}

test('VP creates an offer, the rep sees it on a matching lead, the rep cannot create offers', async ({
  browser,
}) => {
  const suffix = String(Date.now()).slice(-5);
  const title = `Autumn Finance 0,9 % ${suffix}`;

  const vp = await (await browser.newContext()).newPage();
  const rep = await (await browser.newContext()).newPage();
  await signIn(vp, VP);
  await signIn(rep, REP);

  // The expired seeded offer never appears in the strip; the count shows active offers only.
  await expect(rep.getByTestId('offers-strip-count')).toHaveText(/^\d+$/, { timeout: 15_000 });
  await rep.getByTestId('offers-strip').click();
  await expect(rep.getByTestId('offers-strip-list')).toContainText('Loyalty Bonus');
  await expect(rep.getByTestId('offers-strip-list')).not.toContainText('Summer Sale');
  await rep.keyboard.press('Escape');

  // VP creates the offer through the form.
  await vp.goto('/offers');
  await expect(vp.getByTestId('offers-table')).toContainText('Summer Sale'); // VP sees expired too
  await vp.getByRole('button', { name: 'New offer' }).click();
  await vp.getByLabel('Title').fill(title);
  await vp.getByLabel('Discount type').selectOption('APR');
  await vp.getByLabel('Value').fill('0.9');
  await vp.getByRole('button', { name: /DE Germany/ }).click();
  await vp.getByRole('button', { name: /AT Austria/ }).click();
  await vp.getByLabel('Requires finance').check();
  await vp.getByRole('button', { name: 'Create offer' }).click();
  await expect(vp.getByTestId('offers-table')).toContainText(title);
  await expect(vp.getByRole('row', { name: new RegExp(title) })).toContainText('0,9');

  // A rep sees the new offer on a matching DE finance lead.
  const leadId = await findMatchingLead(rep.request, title);
  expect(leadId, 'a DACH lead with finance interest should match the new offer').not.toBeNull();
  await rep.goto(`/leads/${leadId}`);
  const panel = rep
    .getByRole('region', { name: 'Offers for this lead' })
    .or(rep.getByLabel('Offers for this lead'));
  await expect(panel).toContainText(title, { timeout: 15_000 });
  await expect(panel).toContainText('Wants finance');
  await expect(panel).not.toContainText('Summer Sale');

  // The rep cannot create offers, and the read-only page hides management controls.
  const forbidden = await rep.request.post('/api/offers', {
    data: {
      title: 'Rep offer',
      description: '',
      discountType: 'GIFT',
      validFrom: Date.now(),
      validTo: Date.now() + 86_400_000,
      eligibility: {},
    },
  });
  expect(forbidden.status()).toBe(403);
  await rep.goto('/offers');
  await expect(rep.getByRole('button', { name: 'New offer' })).toHaveCount(0);
  await expect(rep.getByTestId('offers-table')).toContainText(title);

  // Clean up so the journey can re-run against the same database.
  const all = await vp.request.get('/api/offers?status=all');
  const created = ((await all.json()) as { offers: { id: string; title: string }[] }).offers.find(
    (o) => o.title === title,
  );
  expect(created).toBeTruthy();
  expect((await vp.request.delete(`/api/offers/${created!.id}`)).status()).toBe(204);
});
