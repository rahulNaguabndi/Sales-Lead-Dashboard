import type { OfferDTO, LeadOfferDTO } from '@/server/services/offer-matcher';
import { apiFetch } from '@/lib/api-client';

export type { OfferDTO, LeadOfferDTO };

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

async function unwrap<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = (
      body as { error?: { code?: string; message?: string; fields?: Record<string, string> } }
    ).error;
    throw new ApiRequestError(e?.message ?? `HTTP ${res.status}`, res.status, e?.code, e?.fields);
  }
  return body as T;
}

export const offersKey = (status: string) => ['offers', status] as const;
export const leadOffersKey = (leadId: string) => ['lead', leadId, 'offers'] as const;

export async function fetchOffers(status: 'active' | 'visible' | 'all'): Promise<OfferDTO[]> {
  const body = await unwrap<{ offers: OfferDTO[] }>(await apiFetch(`/api/offers?status=${status}`));
  return body.offers;
}

export async function fetchLeadOffers(leadId: string): Promise<LeadOfferDTO[]> {
  const body = await unwrap<{ offers: LeadOfferDTO[] }>(
    await apiFetch(`/api/leads/${leadId}/offers`),
  );
  return body.offers;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export async function createOfferRequest(input: unknown): Promise<OfferDTO> {
  return (await unwrap<{ offer: OfferDTO }>(await apiFetch('/api/offers', json('POST', input))))
    .offer;
}

export async function patchOfferRequest(id: string, patch: unknown): Promise<OfferDTO> {
  return (
    await unwrap<{ offer: OfferDTO }>(await apiFetch(`/api/offers/${id}`, json('PATCH', patch)))
  ).offer;
}

export async function deleteOfferRequest(id: string): Promise<void> {
  await unwrap<void>(await apiFetch(`/api/offers/${id}`, { method: 'DELETE' }));
}
