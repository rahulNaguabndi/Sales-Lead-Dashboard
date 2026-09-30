/** Opaque keyset cursor: base64url("<createdAt>:<id>"). */
export type ActivityCursor = { createdAt: number; id: string };

export function encodeCursor(c: ActivityCursor): string {
  return Buffer.from(`${c.createdAt}:${c.id}`, 'utf8').toString('base64url');
}

/** Returns null for anything that is not a cursor produced by encodeCursor. */
export function decodeCursor(raw: string): ActivityCursor | null {
  if (!/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  const text = Buffer.from(raw, 'base64url').toString('utf8');
  const m = /^(\d{1,16}):([0-9A-Za-z]{1,40})$/.exec(text);
  if (!m) return null;
  return { createdAt: Number(m[1]), id: m[2]! };
}
