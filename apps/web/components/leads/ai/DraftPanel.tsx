'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { buildMailtoLink, buildSmsLink, buildWhatsAppLink } from '@leaddesk/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { CHANNEL_LABEL } from '@/components/leads/channels/channel-actions';
import { useOptionalComposer } from '@/components/leads/composer/useComposer';
import type { LeadSlotProps } from '@/components/leads/detail/types';
import { SourceBadge } from './SourceBadge';
import { FeedbackButtons } from './FeedbackButtons';
import { draftKey, fetchDraft, useRegenerate, type DraftChannel } from './use-ai';

const CHANNELS: DraftChannel[] = ['WHATSAPP', 'SMS', 'EMAIL'];

export function DraftPanel({ lead, customer, disabled }: Pick<LeadSlotProps, 'lead' | 'customer'> & { disabled: boolean }) {
  const composer = useOptionalComposer();
  const initial = (customer.preferredChannel === 'CALL' ? customer.secondaryChannel : customer.preferredChannel) ?? 'WHATSAPP';
  const [channel, setChannel] = useState<DraftChannel>(initial === 'CALL' ? 'WHATSAPP' : initial);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const key = draftKey(lead.id, channel, lead.version, lead.lastActivityAt);
  const regenerate = useRegenerate(lead.id);
  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchDraft(lead.id, channel),
    enabled: open && !disabled,
    staleTime: Infinity,
    retry: false,
  });
  const data = query.data;
  useEffect(() => {
    if (data) setText(data.draft.body);
  }, [data]);

  const useDraft = () => {
    if (!data) return;
    const subject = data.draft.subject ?? '';
    const link =
      channel === 'WHATSAPP' && customer.phone
        ? buildWhatsAppLink(customer.phone, text)
        : channel === 'SMS' && customer.phone
          ? buildSmsLink(customer.phone, text)
          : channel === 'EMAIL' && customer.email
            ? buildMailtoLink(customer.email, subject, text)
            : null;
    if (link) window.open(link, '_blank', 'noopener');
    composer?.prefill({ type: channel, note: text, aiAssisted: true });
  };

  if (!open)
    return (
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
        Draft message
      </Button>
    );

  return (
    <div className="space-y-2" data-testid="ai-draft">
      <div className="flex items-center gap-2">
        <label className="text-sm" htmlFor="ai-draft-channel">
          Channel
        </label>
        <select
          id="ai-draft-channel"
          className="rounded-md border bg-background px-2 py-1 text-sm"
          value={channel}
          onChange={(e) => setChannel(e.target.value as DraftChannel)}
        >
          {CHANNELS.map((c) => (
            <option key={c} value={c}>
              {CHANNEL_LABEL[c]}
            </option>
          ))}
        </select>
        {data && <SourceBadge source={data.source} />}
      </div>
      {query.isLoading && <Skeleton className="h-24 w-full" />}
      {query.isError && <p className="text-sm text-destructive">Could not load a draft. Try again.</p>}
      {data && (
        <>
          {data.templateLanguage && (
            <p className="text-xs text-muted-foreground">Template in English (customer language unsupported)</p>
          )}
          {data.draft.subject && <p className="text-sm font-medium">Subject: {data.draft.subject}</p>}
          <Textarea
            aria-label="Draft message"
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={useDraft} disabled={disabled || !text.trim()}>
                Use draft
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void regenerate(key, 'draft', channel)}
              >
                ↻ Regenerate
              </Button>
            </div>
            <FeedbackButtons leadId={lead.id} kind="draft" fingerprint={data.fingerprint} />
          </div>
        </>
      )}
    </div>
  );
}
