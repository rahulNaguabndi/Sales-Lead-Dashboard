'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  DISCOUNT_TYPES,
  endOfDayBrussels,
  OfferInputSchema,
  startOfDayBrussels,
  type DiscountType,
  type OfferEligibilityRules,
} from '@leaddesk/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EligibilityBuilder } from './EligibilityBuilder';
import {
  ApiRequestError,
  createOfferRequest,
  patchOfferRequest,
  type OfferDTO,
} from './offers-api';
import { toDateInput } from './offer-format';

const TYPE_LABEL: Record<DiscountType, string> = {
  AMOUNT: 'Amount off (€)',
  PERCENT: 'Percent off (%)',
  APR: 'Finance rate (% APR)',
  GIFT: 'Gift / other',
};

type FormState = {
  title: string;
  description: string;
  discountType: DiscountType;
  value: string;
  validFrom: string;
  validTo: string;
  eligibility: OfferEligibilityRules;
  isActive: boolean;
};

/** Display value to stored value: cents for AMOUNT, whole percent, basis points for APR. */
export function valueToStored(type: DiscountType, raw: string): number | null {
  if (type === 'GIFT' || raw.trim() === '') return null;
  const n = Number(raw.replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return type === 'PERCENT' ? Math.round(n) : Math.round(n * 100);
}

export function storedToValue(type: DiscountType, stored: number | null): string {
  if (stored === null || type === 'GIFT') return '';
  return type === 'AMOUNT' || type === 'APR' ? String(stored / 100) : String(stored);
}

function initial(offer?: OfferDTO): FormState {
  if (!offer) {
    const today = toDateInput(Date.now());
    return {
      title: '',
      description: '',
      discountType: 'AMOUNT',
      value: '',
      validFrom: today,
      validTo: toDateInput(Date.now() + 30 * 86_400_000),
      eligibility: {},
      isActive: true,
    };
  }
  return {
    title: offer.title,
    description: offer.description,
    discountType: offer.discountType,
    value: storedToValue(offer.discountType, offer.value),
    validFrom: toDateInput(offer.validFrom),
    validTo: toDateInput(offer.validTo),
    eligibility: offer.eligibility as OfferEligibilityRules,
    isActive: offer.isActive,
  };
}

export function OfferForm({
  open,
  onOpenChange,
  offer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offer?: OfferDTO;
}) {
  const client = useQueryClient();
  const [state, setState] = useState<FormState>(() => initial(offer));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setState(initial(offer));
      setErrors({});
      setFormError(null);
    }
  }, [open, offer]);

  const set = (patch: Partial<FormState>) => setState((s) => ({ ...s, ...patch }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const candidate = {
      title: state.title,
      description: state.description,
      discountType: state.discountType,
      value: valueToStored(state.discountType, state.value),
      validFrom: state.validFrom ? startOfDayBrussels(state.validFrom) : NaN,
      validTo: state.validTo ? endOfDayBrussels(state.validTo) : NaN,
      eligibility: state.eligibility,
      isActive: state.isActive,
    };
    const parsed = OfferInputSchema.safeParse(candidate);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues)
        fields[String(issue.path[0] ?? '_')] ??= issue.message;
      setErrors(fields);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      if (offer) await patchOfferRequest(offer.id, parsed.data);
      else await createOfferRequest(parsed.data);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['offers'] }),
        client.invalidateQueries({ queryKey: ['lead'] }),
      ]);
      toast.success(offer ? 'Offer updated' : 'Offer created');
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiRequestError && err.fields) setErrors(err.fields);
      setFormError(err instanceof Error ? err.message : 'Could not save the offer');
    } finally {
      setSaving(false);
    }
  }

  const err = (k: string) =>
    errors[k] ? (
      <p role="alert" className="text-xs text-red-400">
        {errors[k]}
      </p>
    ) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{offer ? 'Edit offer' : 'New offer'}</DialogTitle>
          <DialogDescription>
            Validity ends at the end of the chosen day (Brussels time).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <div className="grid gap-1.5">
            <label htmlFor="offer-title" className="text-sm font-medium">
              Title
            </label>
            <Input
              id="offer-title"
              value={state.title}
              onChange={(e) => set({ title: e.target.value })}
            />
            {err('title')}
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="offer-desc" className="text-sm font-medium">
              Description
            </label>
            <Textarea
              id="offer-desc"
              rows={2}
              value={state.description}
              onChange={(e) => set({ description: e.target.value })}
            />
            {err('description')}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <label htmlFor="offer-type" className="text-sm font-medium">
                Discount type
              </label>
              <select
                id="offer-type"
                value={state.discountType}
                onChange={(e) => set({ discountType: e.target.value as DiscountType, value: '' })}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                {DISCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>
            {state.discountType !== 'GIFT' && (
              <div className="grid gap-1.5">
                <label htmlFor="offer-value" className="text-sm font-medium">
                  Value
                </label>
                <Input
                  id="offer-value"
                  inputMode="decimal"
                  value={state.value}
                  onChange={(e) => set({ value: e.target.value })}
                />
                {err('value')}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <label htmlFor="offer-from" className="text-sm font-medium">
                Valid from
              </label>
              <Input
                id="offer-from"
                type="date"
                value={state.validFrom}
                onChange={(e) => set({ validFrom: e.target.value })}
              />
              {err('validFrom')}
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="offer-to" className="text-sm font-medium">
                Valid until
              </label>
              <Input
                id="offer-to"
                type="date"
                value={state.validTo}
                onChange={(e) => set({ validTo: e.target.value })}
              />
              {err('validTo')}
            </div>
          </div>
          <EligibilityBuilder
            value={state.eligibility}
            onChange={(eligibility) => set({ eligibility })}
          />
          {err('eligibility')}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={state.isActive}
              onChange={(e) => set({ isActive: e.target.checked })}
            />
            Active
          </label>
          {formError && (
            <p role="alert" className="text-sm text-red-400">
              {formError}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : offer ? 'Save changes' : 'Create offer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
