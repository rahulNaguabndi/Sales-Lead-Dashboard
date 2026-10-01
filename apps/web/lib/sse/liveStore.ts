/** `connecting` is the first attempt after a page load; only a lost connection is `reconnecting`. */
export type LiveStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';

export const HIGHLIGHT_TTL_MS = 5000;
export const OFFLINE_POLL_AFTER_MS = 60_000;

export type LiveState = {
  status: LiveStatus;
  offlineSince: number | null;
  highlighted: ReadonlyMap<string, number>;
  lastUpdatedBy: ReadonlyMap<string, { name: string; at: number }>;
  version: number;
};

/** Minimal external store (useSyncExternalStore-compatible) holding client-side live state. */
export function createLiveStore(now: () => number = Date.now) {
  let state: LiveState = {
    status: 'connecting',
    offlineSince: now(),
    highlighted: new Map(),
    lastUpdatedBy: new Map(),
    version: 0,
  };
  const listeners = new Set<() => void>();
  const set = (patch: Partial<LiveState>) => {
    state = { ...state, ...patch, version: state.version + 1 };
    listeners.forEach((l) => l());
  };

  return {
    getState: () => state,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    setStatus(status: LiveStatus) {
      if (status === state.status) return;
      set({ status, offlineSince: status === 'live' ? null : (state.offlineSince ?? now()) });
    },
    /** Connecting or reconnecting for more than 60 s counts as offline. */
    tick() {
      if (
        (state.status === 'reconnecting' || state.status === 'connecting') &&
        state.offlineSince !== null &&
        now() - state.offlineSince > OFFLINE_POLL_AFTER_MS
      )
        set({ status: 'offline' });
    },
    shouldPoll: () => state.status === 'offline',
    highlight(leadId: string) {
      const next = new Map(state.highlighted);
      next.set(leadId, now() + HIGHLIGHT_TTL_MS);
      set({ highlighted: next });
    },
    /** Removes expired highlights; returns whether anything changed. */
    expire() {
      const t = now();
      const next = new Map([...state.highlighted].filter(([, exp]) => exp > t));
      if (next.size === state.highlighted.size) return false;
      set({ highlighted: next });
      return true;
    },
    highlightedIds(): ReadonlySet<string> {
      const t = now();
      return new Set([...state.highlighted].filter(([, exp]) => exp > t).map(([id]) => id));
    },
    noteUpdatedBy(leadId: string, name: string) {
      const next = new Map(state.lastUpdatedBy);
      next.set(leadId, { name, at: now() });
      set({ lastUpdatedBy: next });
    },
  };
}

export type LiveStore = ReturnType<typeof createLiveStore>;

const g = globalThis as unknown as { __ldLiveStore?: LiveStore };
/** Browser-side singleton. */
export const liveStore: LiveStore = (g.__ldLiveStore ??= createLiveStore());
