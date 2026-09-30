import { createHash, timingSafeEqual } from 'node:crypto';

const DEV_DEFAULT = 'showroom:showroom-dev-key';

type KeyEntry = { name: string; hash: Buffer };

const sha = (s: string) => createHash('sha256').update(s).digest();

/** Parses `name:key,other:key2,barekey` (bare key → name "default"). */
export function parseApiKeys(raw: string | undefined): KeyEntry[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const i = entry.indexOf(':');
      const name = i > 0 ? entry.slice(0, i) : 'default';
      const key = i > 0 ? entry.slice(i + 1) : entry;
      return { name, hash: sha(key) };
    });
}

/** Configured keys; the dev key is only a fallback outside production. */
export function configuredKeys(): KeyEntry[] {
  const raw = process.env.INTAKE_API_KEYS;
  if (raw?.trim()) return parseApiKeys(raw);
  return process.env.NODE_ENV === 'production' ? [] : parseApiKeys(DEV_DEFAULT);
}

/** Constant-time check of every configured key (no early exit). Returns the key name or null. */
export function matchApiKey(presented: string | null, keys = configuredKeys()): string | null {
  const h = sha(presented ?? '');
  let found: string | null = null;
  for (const k of keys) {
    if (timingSafeEqual(h, k.hash) && presented) found ??= k.name;
  }
  return found;
}
