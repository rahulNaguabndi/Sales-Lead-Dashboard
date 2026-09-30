'use client';

import { useEffect, useState } from 'react';
import { VEHICLES, formatEUR } from '@leaddesk/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api-client';
import { parseEurToCents } from './money';

export type WonData = { dealValue: number; vehicleModel: string; appliedOfferId: string | null };
type OfferOption = { id: string; title: string; value: number | null };

type Props = {
  open: boolean;
  leadId: string;
  defaultModel: string | null;
  /** Resolves with an error message to keep the dialog open, or null when the win was saved. */
  onConfirm: (data: WonData) => Promise<string | null>;
  onCancel: () => void;
};

/** Offers currently matching the lead (F15). Empty until the offers API exists. */
async function loadOffers(leadId: string): Promise<OfferOption[]> {
  try {
    const res = await apiFetch(`/api/offers?matchLead=${encodeURIComponent(leadId)}`);
    if (!res.ok) return [];
    const json = await res.json();
    const items: unknown[] = Array.isArray(json) ? json : (json.items ?? json.offers ?? []);
    return items.flatMap((o) => {
      const r = o as { id?: string; title?: string; value?: number | null };
      return r.id && r.title ? [{ id: r.id, title: r.title, value: r.value ?? null }] : [];
    });
  } catch {
    return [];
  }
}

export function WonDialog({ open, leadId, defaultModel, onConfirm, onCancel }: Props) {
  const [raw, setRaw] = useState('');
  const [touched, setTouched] = useState(false);
  const [model, setModel] = useState(defaultModel ?? VEHICLES[0]!.slug);
  const [offers, setOffers] = useState<OfferOption[]>([]);
  const [offerId, setOfferId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRaw('');
    setTouched(false);
    setOfferId(null);
    setServerError(null);
    setModel(defaultModel ?? VEHICLES[0]!.slug);
    void loadOffers(leadId).then(setOffers);
  }, [open, leadId, defaultModel]);

  const cents = parseEurToCents(raw);
  const invalid = cents === null;

  async function submit() {
    setTouched(true);
    if (cents === null) return;
    setBusy(true);
    const err = await onConfirm({ dealValue: cents, vehicleModel: model, appliedOfferId: offerId });
    setBusy(false);
    if (err) {
      setServerError(err);
      setOffers(await loadOffers(leadId));
      setOfferId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close as won</DialogTitle>
          <DialogDescription>Record the final deal value for this lead.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="won-value" className="text-sm font-medium">
              Deal value (€)
            </label>
            <Input
              id="won-value"
              inputMode="decimal"
              autoFocus
              className="h-12 text-xl"
              placeholder="36.500"
              value={raw}
              aria-invalid={touched && invalid}
              onChange={(e) => setRaw(e.target.value)}
              onBlur={() => setTouched(true)}
            />
            {touched && invalid && (
              <p role="alert" className="text-xs text-red-400">
                Enter a deal value greater than 0 (up to 1.000.000 €)
              </p>
            )}
            {cents !== null && (
              <p className="text-xs text-muted-foreground">{formatEUR(cents)}</p>
            )}
          </div>
          <div className="space-y-1">
            <label htmlFor="won-model" className="text-sm font-medium">
              Vehicle model
            </label>
            <select
              id="won-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {defaultModel && !VEHICLES.some((v) => v.slug === defaultModel) && (
                <option value={defaultModel}>{defaultModel}</option>
              )}
              {VEHICLES.map((v) => (
                <option key={v.slug} value={v.slug}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          {offers.length > 0 && (
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium">Apply offer (optional)</legend>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="won-offer"
                  checked={offerId === null}
                  onChange={() => setOfferId(null)}
                />
                No offer
              </label>
              {offers.map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="won-offer"
                    checked={offerId === o.id}
                    onChange={() => setOfferId(o.id)}
                  />
                  {o.title}
                  {o.value ? ` · ${formatEUR(o.value)}` : ''}
                </label>
              ))}
            </fieldset>
          )}
          {serverError && (
            <p role="alert" className="text-sm text-red-400">
              {serverError}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={invalid || busy}>
            Confirm win
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
