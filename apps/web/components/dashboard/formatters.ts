const eur = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

export const formatEur = (cents: number | null): string =>
  cents === null ? '—' : eur.format(cents / 100);

export const formatPct = (v: number | null): string => (v === null ? '—' : `${v.toFixed(1)}%`);

export const formatInt = (v: number | null): string => (v === null ? '—' : String(Math.round(v)));

/** Minutes → "42 min", "3 h 5 min", "2 d 4 h". */
export function formatDuration(minutes: number | null): string {
  if (minutes === null) return '—';
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
  const h = Math.round((m % 1440) / 60);
  return `${Math.floor(m / 1440)} d${h ? ` ${h} h` : ''}`;
}

export type Delta = {
  text: string;
  direction: 'up' | 'down' | 'flat' | 'none';
  good: boolean | null;
  /** The previous value was too small for a percentage change to mean much. */
  lowBase?: boolean;
};

/** Relative changes beyond this are shown as "> +300%" with a low-base note, not "+1064.5%". */
export const MAX_RELATIVE_DELTA_PCT = 300;

/** Delta chip content. `lowerIsBetter` flips which direction counts as good. */
export function describeDelta(
  value: number | null,
  prev: number | null,
  lowerIsBetter = false,
  unit: 'pct-points' | 'relative' = 'relative',
): Delta {
  // No comparison available: say nothing rather than "New", which reads as "something is new".
  if (value === null || prev === null) return { text: '—', direction: 'none', good: null };
  const diff = value - prev;
  if (diff === 0) return { text: '0', direction: 'flat', good: null };
  const up = diff > 0;
  const good = lowerIsBetter ? !up : up;
  const sign = up ? '+' : '−';
  if (unit === 'pct-points' || prev === 0) {
    const mag = `${Math.abs(diff).toFixed(1)}${unit === 'pct-points' ? ' pp' : ''}`;
    return { text: `${sign}${mag}`, direction: up ? 'up' : 'down', good, lowBase: prev === 0 };
  }
  const pct = Math.abs((diff / prev) * 100);
  if (pct > MAX_RELATIVE_DELTA_PCT) {
    return {
      text: `${sign}>${MAX_RELATIVE_DELTA_PCT}%`,
      direction: up ? 'up' : 'down',
      good,
      lowBase: true,
    };
  }
  return { text: `${sign}${pct.toFixed(1)}%`, direction: up ? 'up' : 'down', good };
}
