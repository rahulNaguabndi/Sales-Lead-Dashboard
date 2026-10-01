import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Two-letter initials everywhere ("Sofia Rossi" → "SR", "Sofia" → "SO"). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Relative luminance of a #rrggbb colour (WCAG 2.1). */
function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const n = parseInt(m[1]!, 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

const DARK_TEXT = '#0f172a';
const DARK_L = luminance(DARK_TEXT);

/**
 * Avatar colours are per user; pick whichever text colour contrasts more so light backgrounds
 * (cyan, pink) never get white initials.
 */
export function avatarStyle(background: string): { backgroundColor: string; color: string } {
  const l = luminance(background);
  const onWhite = 1.05 / (l + 0.05);
  const onDark = (l + 0.05) / (DARK_L + 0.05);
  return { backgroundColor: background, color: onWhite >= onDark ? '#ffffff' : DARK_TEXT };
}
