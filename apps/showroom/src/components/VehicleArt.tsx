import type { VehicleSlug } from '@leaddesk/shared';

const PALETTE: Record<VehicleSlug, [string, string]> = {
  'aurora-suv': ['#1f6f8b', '#99d5c9'],
  'metro-hatch': ['#d9534f', '#f7c59f'],
  'vento-sedan': ['#3d405b', '#b8b8d1'],
  'terra-4x4': ['#6b705c', '#cb997e'],
  'luma-ev': ['#2a9d8f', '#e9f5db'],
  'nova-van': ['#e9a23b', '#fff1d0'],
};

const BODY: Record<VehicleSlug, string> = {
  'aurora-suv': 'M30 120 L45 80 Q55 62 85 60 L170 60 Q200 62 215 85 L235 105 Q250 112 250 125 L250 135 L30 135 Z',
  'metro-hatch': 'M35 125 L55 85 Q65 68 90 66 L165 66 Q190 70 205 95 L235 108 Q248 113 248 125 L248 135 L35 135 Z',
  'vento-sedan': 'M25 125 L60 92 Q72 78 100 76 L160 76 Q185 78 200 98 L245 108 Q258 113 258 126 L258 135 L25 135 Z',
  'terra-4x4': 'M30 125 L38 78 Q42 60 70 58 L200 58 Q225 60 230 82 L250 100 Q256 108 256 122 L256 138 L30 138 Z',
  'luma-ev': 'M40 125 L62 88 Q75 68 100 66 L160 66 Q185 68 200 92 L232 106 Q246 112 246 126 L246 135 L40 135 Z',
  'nova-van': 'M28 128 L28 70 Q28 58 42 58 L175 58 Q195 58 205 78 L240 100 Q252 108 252 122 L252 136 L28 136 Z',
};

export function VehicleArt({ slug, label }: { slug: VehicleSlug; label: string }) {
  const [a, b] = PALETTE[slug];
  const id = `g-${slug}`;
  return (
    <svg
      viewBox="0 0 280 170"
      role="img"
      aria-label={`${label} illustration`}
      className="vehicle-art"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={b} />
          <stop offset="1" stopColor={a} stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <rect width="280" height="170" rx="12" fill={`url(#${id})`} />
      <path d={BODY[slug]} fill={a} />
      <path d="M70 95 L90 72 L160 72 L185 95 Z" fill="#ffffff" fillOpacity="0.65" />
      <circle cx="80" cy="138" r="17" fill="#22252b" />
      <circle cx="80" cy="138" r="7" fill="#c9ced6" />
      <circle cx="205" cy="138" r="17" fill="#22252b" />
      <circle cx="205" cy="138" r="7" fill="#c9ced6" />
    </svg>
  );
}
