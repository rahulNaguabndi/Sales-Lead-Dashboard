import { rng } from './utils/rng';
import { clock, DAY } from './utils/time';
import { newId } from './utils/ids';
import type { OfferRow } from './types';

export type OffersResult = { offers: OfferRow[]; offerIds: Record<string, string> };

export function seedOffers(vpId: string): OffersResult {
  const now = clock.now;
  // Evergreen offers run for a realistic season, not years (seed offers valid to 2029 looked like mistakes).
  const seasonEnd = now + 180 * DAY;
  const createdAt = now - 130 * DAY;
  const def = (
    title: string,
    description: string,
    discountType: OfferRow['discountType'],
    value: number | null,
    validFrom: number,
    validTo: number,
    eligibility: OfferRow['eligibility'],
  ): OfferRow => ({
    id: newId(createdAt + rng.int(0, 1000)),
    title,
    description,
    discountType,
    value,
    validFrom,
    validTo,
    eligibility,
    isActive: true,
    createdBy: vpId,
    createdAt,
  });

  const offers: OfferRow[] = [
    def(
      'Loyalty Bonus',
      '1.000 € off for returning EuroDrive customers.',
      'AMOUNT',
      100_000,
      now - 60 * DAY,
      now + 90 * DAY,
      { customerType: 'RETURNING' },
    ),
    def(
      'Autumn Cashback',
      '750 € cashback on any new vehicle.',
      'AMOUNT',
      75_000,
      now - 20 * DAY,
      now + 40 * DAY,
      {
        customerType: 'ANY',
      },
    ),
    def(
      'Trade-in Boost',
      '1.500 € extra when you trade in your old car.',
      'AMOUNT',
      150_000,
      now - 90 * DAY,
      seasonEnd,
      {
        requiresTradeIn: true,
      },
    ),
    def(
      '0% APR Finance',
      'Zero-interest financing on the Luma EV and Aurora SUV.',
      'APR',
      0,
      now - 90 * DAY,
      seasonEnd,
      {
        requiresFinance: true,
        models: ['luma-ev', 'aurora-suv'],
      },
    ),
    def(
      'EV Switch Grant',
      '5% off the Luma EV in Germany, the Netherlands and France.',
      'PERCENT',
      5,
      now - 45 * DAY,
      seasonEnd,
      {
        models: ['luma-ev'],
        countries: ['DE', 'NL', 'FR'],
      },
    ),
    def(
      'Summer Sale',
      '500 € off any vehicle (ended).',
      'AMOUNT',
      50_000,
      now - 120 * DAY,
      now - 30 * DAY,
      {
        customerType: 'ANY',
      },
    ),
  ];

  const offerIds = Object.fromEntries(offers.map((o) => [o.title, o.id as string]));
  return { offers, offerIds };
}
