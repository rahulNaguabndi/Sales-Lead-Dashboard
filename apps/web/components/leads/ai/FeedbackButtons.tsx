'use client';

import { useState } from 'react';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { sendFeedback } from './use-ai';

export function FeedbackButtons({
  leadId,
  kind,
  fingerprint,
}: {
  leadId: string;
  kind: 'suggest' | 'draft';
  fingerprint: string;
}) {
  const [vote, setVote] = useState<'up' | 'down' | null>(null);
  const send = (v: 'up' | 'down') => {
    setVote(v);
    void sendFeedback(leadId, kind, fingerprint, v);
  };
  return (
    <span className="inline-flex" role="group" aria-label="Was this helpful?">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Helpful"
        aria-pressed={vote === 'up'}
        disabled={vote !== null}
        onClick={() => send('up')}
      >
        <ThumbsUp aria-hidden />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Not helpful"
        aria-pressed={vote === 'down'}
        disabled={vote !== null}
        onClick={() => send('down')}
      >
        <ThumbsDown aria-hidden />
      </Button>
    </span>
  );
}
