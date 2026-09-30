/**
 * Hand-computed expectations for fixture.ts (NOW = 2026-09-30 10:00Z; period = Sep 1–30 Brussels).
 *
 * Team DACH, current period created: D1..D10 + B1 (Aug 31 22:30Z = Sep 1 00:30 Brussels) = 11.
 *   previous period (Aug 2–31): P1..P4 + B2 (Aug 31 21:30Z = 23:30 Brussels) = 5.
 *   contact coverage: D2 D3 D4 D6 D8 D9 = 6/11 = 54.5 %   prev P1 P2 P3 = 3/5 = 60.0 %
 *   FRT minutes: (30+60+120+10+55+45)/6 = 53.3 → 53       prev (20+30+40)/3 = 30
 *   closed in Sep: D3 WON, D4 LOST, D12 LOST, D13 LOST → 1/4 = 25.0 %   prev P1 WON, P2 LOST → 50.0 %
 *   revenue: 3 890 000 cents (prev 1 000 000)
 *   overdue follow-ups (open leads, pending, due < now): D6, D7, D8 = 3 (felix 2)
 *   SLA breaches (NEW, no contact, past target): D1 D7 D10 B1 B2 P4 = 6
 *   pipeline value (open, deal_value ?? budget_max): D5 2 500 000 + D9 4 000 000 = 6 500 000
 *   going cold: atRisk = D9 (idle 60 h, open) = 1; cold = D11 = 1
 *
 * Leaderboard (name order): anna, felix, jonas, lea
 *   anna : open 5 (D1 D2 P4 B1 B2) new 4 (D1 D2 D3 B1) contacted 2 cov 50.0 frt 45 sla 4 overdue 0 won 1 rev 3 890 000
 *   felix: open 2 new 2 contacted 1 cov 50.0 frt 55 sla 1 overdue 2 won 0
 *   jonas: open 2 (D5 D6) new 3 contacted 2 cov 66.7 frt 65 sla 0 overdue 1 won 0
 *   lea  : open 2 (D9 P3) new 1 contacted 1 cov 100.0 frt 45 sla 0 overdue 0
 *
 * Funnel (created in period): reached NEW 11 CONTACTED 7 QUALIFIED 3 TEST_DRIVE 1 NEGOTIATION 1 WON 1
 *                              current NEW 4 CONTACTED 3 QUALIFIED 1 TEST_DRIVE 0 NEGOTIATION 1 WON 1
 *   (D5 moved QUALIFIED → CONTACTED → QUALIFIED and counts once per stage)
 */
export const DACH = {
  newLeads: { value: 11, prev: 5 },
  coveragePct: { value: 54.5, prev: 60 },
  avgFrtMinutes: { value: 53, prev: 30 },
  conversionPct: { value: 25, prev: 50 },
  revenueCents: { value: 3_890_000, prev: 1_000_000 },
  overdueFollowUps: { value: 3, prev: null },
  strip: { slaBreaches: 6, pipelineValueCents: 6_500_000, goingCold: { atRisk: 1, cold: 1 } },
};

export const LEADERBOARD = {
  anna: { open: 5, newInPeriod: 4, contacted: 2, coveragePct: 50, avgFrtMinutes: 45, slaBreaches: 4, overdue: 0, won: 1, revenueCents: 3_890_000 },
  felix: { open: 2, newInPeriod: 2, contacted: 1, coveragePct: 50, avgFrtMinutes: 55, slaBreaches: 1, overdue: 2, won: 0, revenueCents: 0 },
  jonas: { open: 2, newInPeriod: 3, contacted: 2, coveragePct: 66.7, avgFrtMinutes: 65, slaBreaches: 0, overdue: 1, won: 0, revenueCents: 0 },
  lea: { open: 2, newInPeriod: 1, contacted: 1, coveragePct: 100, avgFrtMinutes: 45, slaBreaches: 0, overdue: 0, won: 0, revenueCents: 0 },
} as const;

export const FUNNEL = {
  reached: { NEW: 11, CONTACTED: 7, QUALIFIED: 3, TEST_DRIVE: 1, NEGOTIATION: 1, WON: 1 },
  current: { NEW: 4, CONTACTED: 3, QUALIFIED: 1, TEST_DRIVE: 0, NEGOTIATION: 1, WON: 1 },
};
