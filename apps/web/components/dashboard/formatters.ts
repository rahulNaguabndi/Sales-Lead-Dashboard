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
  direction: 'up' | 'down' | 'flat' | 'new' | 'none';
  good: boolean | null;
};

/** Delta chip content. `lowerIsBetter` flips which direction counts as good. */
export function describeDelta(
  value: number | null,
  prev: number | null,
  lowerIsBetter = false,
  unit: 'pct-points' | 'relative' = 'relative',
): Delta {
  if (value === null) return { text: '—', direction: 'none', good: null };
  if (prev === null) return { text: 'New', direction: 'new', good: null };
  const diff = value - prev;
  if (diff === 0) return { text: '0', direction: 'flat', good: null };
  const up = diff > 0;
  const good = lowerIsBetter ? !up : up;
  const mag =
    unit === 'pct-points' || prev === 0
      ? `${Math.abs(diff).toFixed(1)}${unit === 'pct-points' ? ' pp' : ''}`
      : `${Math.abs((diff / prev) * 100).toFixed(1)}%`;
  return { text: `${up ? '+' : '−'}${mag}`, direction: up ? 'up' : 'down', good };
}
