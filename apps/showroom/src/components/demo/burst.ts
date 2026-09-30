import type { IntakeLead } from '@leaddesk/shared';
import type { IntakeResult } from '../../lib/intake-client';

export const BURST_COUNT = 5;
export const BURST_GAP_MS = 1500;

export interface BurstEntry {
  index: number;
  label: string;
  reference?: string;
  error?: string;
}

/** Submit `count` generated leads, `gapMs` apart, reporting each result through `onEntry`. */
export async function runBurst(opts: {
  generate: (i: number) => Promise<IntakeLead>;
  submit: (payload: IntakeLead, key: string) => Promise<IntakeResult>;
  onEntry: (e: BurstEntry) => void;
  count?: number;
  gapMs?: number;
}): Promise<BurstEntry[]> {
  const { count = BURST_COUNT, gapMs = BURST_GAP_MS } = opts;
  const log: BurstEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, gapMs));
    const payload = await opts.generate(i);
    const label = `${payload.firstName} ${payload.lastName}`;
    const res = await opts.submit(payload, crypto.randomUUID());
    const entry: BurstEntry = res.ok
      ? { index: i + 1, label, reference: 'reference' in res.data ? res.data.reference : 'accepted' }
      : { index: i + 1, label, error: res.error.kind };
    log.push(entry);
    opts.onEntry(entry);
  }
  return log;
}
