'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { LeadSlotProps } from '@/components/leads/detail/types';
import { DraftPanel } from './DraftPanel';
import { FeedbackButtons } from './FeedbackButtons';
import { NextBestAction } from './NextBestAction';
import { SourceBadge } from './SourceBadge';
import { minutesAgo, suggestKey, useRegenerate, useSuggest } from './use-ai';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <Card aria-label="AI assist">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles aria-hidden className="size-4" />
          AI assist
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">{children}</CardContent>
    </Card>
  );
}

/** Client-only shell: the data hook mounts after hydration (same pattern as the offers panel). */
export function AiAssistCard(props: LeadSlotProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted)
    return (
      <Shell>
        <Skeleton className="h-16 w-full" />
      </Shell>
    );
  return <AiAssistContent {...props} />;
}

function AiAssistContent({ lead, customer, permissions }: LeadSlotProps) {
  const closed = lead.stage === 'WON' || lead.stage === 'LOST';
  const qc = useQueryClient();
  const key = suggestKey(lead.id, lead.version, lead.lastActivityAt);
  // On demand: most visits never open this panel, so don't pay for a model call on every lead
  // open. A suggestion already cached for this lead state is shown straight away.
  const [requested, setRequested] = useState(() => qc.getQueryData(key) !== undefined);
  const query = useSuggest(
    lead.id,
    lead.version,
    lead.lastActivityAt,
    permissions.canRead && requested,
  );
  const regenerate = useRegenerate(lead.id);
  const data = query.data;

  return (
    <Shell>
      {!requested && permissions.canRead && (
        <div className="space-y-2">
          <p className="text-muted-foreground">
            Get a short summary of this lead and a suggested next step.
          </p>
          <Button type="button" size="sm" variant="outline" onClick={() => setRequested(true)}>
            <Sparkles aria-hidden className="size-4" />
            Suggest next step
          </Button>
        </div>
      )}
      {query.isLoading && <Skeleton className="h-20 w-full" />}
      {query.isError && (
        <p className="text-muted-foreground">
          AI assist is unavailable right now. Use the contact buttons above.
        </p>
      )}
      {data && (
        <>
          <div className="flex items-center justify-between gap-2">
            <SourceBadge source={data.source} />
            <span className="text-xs text-muted-foreground">
              Generated {minutesAgo(data.generatedAt)} min ago
            </span>
          </div>
          <p data-testid="ai-summary">{data.summary}</p>
          {data.fallbackReason === 'RATE_LIMITED' && (
            <p role="status" className="text-xs text-muted-foreground">
              AI limit reached, try again in {data.retryAfterMinutes ?? 1} min
            </p>
          )}
          <NextBestAction
            action={data.nextBestAction}
            offerTitle={undefined}
            phone={customer.phone}
            disabled={closed}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {data.source === 'AI'
                ? 'AI-generated · check before sending'
                : 'Rule-based · check before sending'}
            </span>
            <span className="inline-flex items-center">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={closed}
                onClick={() => void regenerate(key, 'suggest')}
              >
                <RotateCcw aria-hidden className="size-3.5" />
                Regenerate
              </Button>
              <FeedbackButtons leadId={lead.id} kind="suggest" fingerprint={data.fingerprint} />
            </span>
          </div>
        </>
      )}
      <DraftPanel lead={lead} customer={customer} disabled={closed || !permissions.canRead} />
      {closed && <p className="text-xs text-muted-foreground">Lead closed: drafts are disabled.</p>}
    </Shell>
  );
}
