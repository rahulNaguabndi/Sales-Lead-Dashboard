# Contract: Offers API

Auth: session cookie required on all routes. Errors use the shared error envelope `{ error: { code, message } }`.

| Method & path | Who | Notes |
|---|---|---|
| `GET /api/offers?status=active\|visible\|all` | any user for `active`/`visible`; `all` VP only (others 403) | `active` = currently active; `visible` = active and scheduled (used by the read-only `/offers` page for non-VP); `all` = every offer incl. expired and inactive. Response `{ offers: [{ id,title,description,discountType,value,validFrom,validTo,isActive,eligibility,status,appliedCount,wonRevenue }] }` |
| `POST /api/offers` | VP (`offer:manage`) | Body per `OfferInputSchema`. 201 `{ offer }`; 400 validation; 403 |
| `PATCH /api/offers/:id` | VP | Partial fields or `{ isActive }`. 200 `{ offer }`; 404 |
| `DELETE /api/offers/:id` | VP | 204; 409 `OFFER_IN_USE` if applied |
| `GET /api/leads/:id/offers` | `lead:read` on lead | `{ offers: [{ offer, reasons, endsSoon }] }`; 403/404 per policy |

Events: `offer.changed { offerId }` on POST/PATCH/DELETE.

Service contract for F07: `validateAppliedOffer(leadId, offerId, now?) → Offer` throws `OfferNotApplicableError` (422 `OFFER_NOT_APPLICABLE`).
