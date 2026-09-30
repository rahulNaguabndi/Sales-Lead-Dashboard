// F12 replaces ONLY the body of this hook (documented ownership exception).
const NONE: ReadonlySet<string> = new Set<string>();

export function useInboxLive(): { highlightedIds: ReadonlySet<string> } {
  return { highlightedIds: NONE };
}
