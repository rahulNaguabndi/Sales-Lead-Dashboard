'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { BEST_TIMES, CHANNELS, LANGUAGES, type BestTime, type Channel } from '@leaddesk/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { apiFetch } from '@/lib/api-client';
import type { LeadSlotProps } from '@/components/leads/detail/types';
import { CHANNEL_LABEL } from '@/components/leads/channels/channel-actions';

const nice = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const selectCls =
  'w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground';

export function EditPreferencesDialog({
  leadId,
  customer,
  onSaved,
}: {
  leadId: string;
  customer: LeadSlotProps['customer'];
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [preferred, setPreferred] = useState<Channel>(customer.preferredChannel);
  const [secondary, setSecondary] = useState<Channel | ''>(customer.secondaryChannel ?? '');
  const [bestTime, setBestTime] = useState<BestTime>(customer.bestTime as BestTime);
  const [language, setLanguage] = useState(customer.language);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/customers/${customer.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          leadId,
          preferredChannel: preferred,
          secondaryChannel: secondary === '' ? null : secondary,
          bestTime,
          language,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(body?.error?.message ?? 'Could not save preferences');
        return;
      }
      toast.success('Preferences updated');
      setOpen(false);
      onSaved?.();
      window.location.reload(); // re-renders the card, timeline note and templates
    } catch {
      setError('Could not save preferences');
    } finally {
      setSaving(false);
    }
  }

  const sameChannel = secondary !== '' && secondary === preferred;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Edit preferences
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Contact preferences</DialogTitle>
          <DialogDescription>Changes are audited and added to the lead timeline.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <label className="block space-y-1">
            <span>Preferred channel</span>
            <select
              className={selectCls}
              value={preferred}
              onChange={(e) => setPreferred(e.target.value as Channel)}
            >
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {CHANNEL_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span>Also OK</span>
            <select
              className={selectCls}
              value={secondary}
              onChange={(e) => setSecondary(e.target.value as Channel | '')}
            >
              <option value="">None</option>
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {CHANNEL_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
          {sameChannel && (
            <p className="text-xs text-destructive" role="alert">
              Secondary channel must differ from the preferred channel
            </p>
          )}
          <label className="block space-y-1">
            <span>Best time</span>
            <select
              className={selectCls}
              value={bestTime}
              onChange={(e) => setBestTime(e.target.value as BestTime)}
            >
              {BEST_TIMES.map((t) => (
                <option key={t} value={t}>
                  {nice(t)}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span>Language</span>
            <select
              className={selectCls}
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving || sameChannel}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
