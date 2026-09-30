const DEFAULT_ORIGIN = 'http://localhost:3001';

export function allowedOrigin(): string {
  return process.env.SHOWROOM_ORIGIN?.trim() || DEFAULT_ORIGIN;
}

/** CORS headers only for the showroom origin; nothing for anyone else. */
export function corsHeaders(origin: string | null, preflight = false): Record<string, string> {
  if (!origin || origin !== allowedOrigin()) return {};
  const h: Record<string, string> = { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
  if (preflight) {
    h['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Content-Type, X-API-Key, Idempotency-Key';
    h['Access-Control-Max-Age'] = '600';
  }
  return h;
}
