// Chart palette for F17. One blue hue for ordinal data, fixed slots per channel, and a sequential ramp.
export const CHANNEL_COLORS = {
  CALL: { light: '#2563eb', dark: '#60a5fa' },
  WHATSAPP: { light: '#c2410c', dark: '#fb923c' },
  SMS: { light: '#0e7490', dark: '#22d3ee' },
  EMAIL: { light: '#a16207', dark: '#facc15' },
} as const;

/** Sequential blue ramp, steps 100 to 700 (low share to high share). */
export const RAMP = ['#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#1d4ed8', '#1e3a8a'] as const;
export const SURFACE = { light: '#ffffff', dark: '#0f172a' } as const;
export const INK = { primary: '#0f172a', inverse: '#ffffff' } as const;
export const BAR_COLOR = { light: '#2563eb', dark: '#60a5fa' } as const;

function lin(c: number) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Ramp step for a share (0-100), scaled against the row maximum. */
export function rampStep(sharePct: number, maxPct: number): number {
  if (maxPct <= 0) return 0;
  return Math.min(RAMP.length - 1, Math.floor((sharePct / maxPct) * (RAMP.length - 0.001)));
}

/** Text color with the better contrast on a ramp cell. */
export function inkOn(fill: string): string {
  return contrast(fill, INK.primary) >= contrast(fill, INK.inverse) ? INK.primary : INK.inverse;
}
