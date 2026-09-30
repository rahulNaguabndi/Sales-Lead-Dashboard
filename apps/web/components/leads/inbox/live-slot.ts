// F12 replaces ONLY the body of this hook (documented ownership exception).
import { useLiveState } from '@/lib/sse/useLiveEvents';

export function useInboxLive(): { highlightedIds: ReadonlySet<string> } {
  const { highlighted } = useLiveState();
  const now = Date.now();
  return {
    highlightedIds: new Set([...highlighted].filter(([, exp]) => exp > now).map(([id]) => id)),
  };
}
