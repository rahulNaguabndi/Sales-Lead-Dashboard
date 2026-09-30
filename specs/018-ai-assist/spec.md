# Feature Specification: F18 AI Assist: Summary, Next Best Action, Draft Message

**Feature Branch**: `018-ai-assist`

**Created**: 2026-09-30

**Status**: Draft

**Input**: User description: "F18 AI Assist: Summary, Next Best Action, Draft Message. Authoritative source: docs/features/F18-ai-assist.md"

## Overview

An "AI Assist" card on the lead detail page gives the rep three things: a short **summary** of who the customer is and what has happened, a **next best action** (what to do, on which channel, when, and why), and on request a **draft message** in the customer's language, suited to their preferred channel, that mentions an applicable offer. Customer contact details are never shared with the AI. Nothing is ever sent automatically. A clearly labelled **rule-based fallback** means the feature always works, even when the AI is unavailable.

**Personas**: Rep (primary), Manager and VP (read access on leads in their scope).
**Depends on**: lead detail page and its AI slot (F05), customer preferences, channel actions and message templates (F14), offer matching (F15), and the activity logging contract's AI-assisted flag (F06).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Lead summary (Priority: P1)

As a rep picking up a reassigned lead, I want a 3–4 line summary so that I understand the customer in seconds.

**Why this priority**: The summary is the most immediate value on every lead open, and it needs no extra clicks.

**Independent Test**: Open any seeded lead with at least 3 activities. The summary appears within 8 seconds and mentions the model of interest, the latest outcome and the stage, in English (the UI language).

**Acceptance Scenarios**:

1. **Given** a lead with activities, **When** the rep opens the detail page, **Then** the AI card shows a loading skeleton, then a summary of at most 600 characters covering: who (first name, age band, city, returning or not), what (model, budget band, trade-in/finance, test drive), history (touch count, last touch and outcome), and current stage and priority.
2. **Given** the same lead with no changes, **When** the rep reopens it, **Then** the previously generated summary shows instantly (under 200 ms) with a "Generated 5 min ago" style label.
3. **Given** a new activity is logged, **When** the card next renders, **Then** the summary regenerates because the lead's state changed.

---

### User Story 2 - Next best action with reason (Priority: P1)

As a rep, I want a concrete recommended next step with its reason so that I act on the right thing.

**Why this priority**: Turns the history into a decision, which is the core differentiator of the feature.

**Independent Test**: For a lead with a preferred channel, an unanswered-call history and a matching offer, the suggestion names an action, channel, timing, reason and the offer.

**Acceptance Scenarios**:

1. **Given** Giulia (preferred channel WhatsApp, evenings, wants finance, a 0 % APR offer matched, last call unanswered twice), **When** the suggestion is generated, **Then** the next best action is like: action `SEND_OFFER`, channel `WHATSAPP`, timing "Today after 18:00", reason "Two unanswered calls; prefers WhatsApp in the evening; asked about financing: 0 % APR Autumn offer applies".
2. **Given** the suggestion references an offer, **When** it is displayed, **Then** the offer title links to the offer shown in the offers panel, and the referenced offer is guaranteed to be one of the lead's matched offers.
3. **Given** the next best action has a channel, **When** the rep clicks "Do it", **Then** the channel action for that channel opens (deep link) and the composer is pre-filled.

---

### User Story 3 - Draft message in the customer's language (Priority: P1)

As a rep, I want a ready-to-send message in the customer's language and channel style so that I contact them faster and more personally.

**Why this priority**: Shortens time to first contact and personalizes outreach.

**Independent Test**: For an Italian-speaking customer who prefers WhatsApp, clicking "Draft message" yields a short Italian message using their first name.

**Acceptance Scenarios**:

1. **Given** a customer whose language is `it` and whose preferred channel is WhatsApp, **When** the rep clicks "Draft message", **Then** a draft appears in Italian, short and conversational (at most 600 characters, no subject), addressing them by first name and mentioning the applicable offer if any.
2. **Given** the rep picks channel Email instead, **When** the draft regenerates, **Then** it includes a subject line and a more formal tone (at most 1000 characters).
3. **Given** the draft is shown, **When** the rep clicks "Use draft", **Then** the channel deep link opens with the text (WhatsApp/SMS/email body), the activity composer is pre-filled with type = channel and note = the draft, and the activity is saved marked as AI-assisted on submit.
4. **Given** the rep edits the draft before using it, **When** it is saved, **Then** the activity is still marked AI-assisted (AI-assisted, human-edited).

---

### User Story 4 - Always works: rule-based fallback (Priority: P1)

As a presenter, I want the feature to never break the demo.

**Why this priority**: The demo must never hard-fail because of an external service (constitution principle VII).

**Independent Test**: With no AI credential configured, every lead's card renders a rule-based summary, next best action and template draft with a visible "Rule-based" badge.

**Acceptance Scenarios**:

1. **Given** no AI credential is configured, **When** the card loads, **Then** it shows a rule-based summary, next best action and template draft, with a visible "Rule-based" badge and a tooltip ("AI unavailable: showing rule-based suggestion").
2. **Given** the AI times out (over 15 s), errors, refuses, or returns output that fails validation, **When** the request completes, **Then** the rule-based result is returned, marked as rule-based with a fallback reason, and the error is recorded without any prompt content.

---

### User Story 5 - Transparency & control (Priority: P2)

**Why this priority**: Builds trust and gives a feedback signal, but the feature works without it.

**Independent Test**: Any AI output carries the AI-generated label, a regenerate control and feedback buttons.

**Acceptance Scenarios**:

1. **Given** any AI output, **When** displayed, **Then** it is labelled "AI-generated · check before sending" with a ↻ Regenerate button (rate-limited) and 👍/👎 feedback (recorded).
2. **Given** a timeline entry created from a draft, **When** viewed, **Then** it shows a "✨ AI-assisted" chip.

---

### Edge Cases

- **Brand-new lead with no activities:** the summary is based on the enquiry only, and the next best action is usually "Contact now via preferred channel" (SLA).
- **WON/LOST leads:** the card shows the summary only. The next best action is "No action: closed" (rule-based, no AI call). The draft is disabled.
- **COLD lead:** the next best action focuses on revival (best offer, preferred channel).
- **Customer language without a built-in template** (for example Polish): the AI drafts in that language. The fallback template uses English, and the UI shows "Template in English".
- **No matched offers:** the draft doesn't mention offers, and no offer is referenced.
- **AI refusal:** the result falls back to rule-based with reason "refusal".
- **Two tabs regenerating simultaneously:** only one generation runs per lead state. The second request waits for and shares the first result.
- **Lead changes during generation:** the result is stored against the old lead state. The UI detects the mismatch and shows "Lead changed · Regenerate".
- **Rate limit hit:** the rule-based result is shown with the notice "AI limit reached, try again in N min".
- **Very long histories:** only the last 15 activities are used, with notes truncated. Nothing else is silently dropped.
- **Lead outside the user's scope / nonexistent:** the request is rejected (out of scope / not found) and nothing is generated.
- **Buyer message or notes containing instructions** (prompt injection): treated as data only, never as instructions.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST offer two operations per lead: *suggest* (summary + next best action) and *draft* (message for a chosen channel). Both MUST require permission to read the lead, per the organization's scope and role policy.
- **FR-002**: The system MUST build the context shared with the AI from only: customer first name, age band, city, country, language, preferred/secondary channel, best time, returning flag, past purchase models and years; lead stage, priority, score breakdown, source, vehicle model, budget band (rounded to €5k), trade-in/finance/test-drive flags, lead age, attempt count; the last 15 activities (type, outcome, note truncated to 300 characters, relative time, actor role); open follow-ups (relative due time); and matched offers (id, title, description, validity end).
- **FR-003 (PII minimization)**: The shared context MUST NOT include email, phone, last name, customer ID, internal user names or IP addresses. Free-text fields (activity notes, buyer message) MUST have email-, phone-, and IBAN-like patterns replaced with `[redacted]`. A test MUST assert that no seeded email or phone value appears in any built context.
- **FR-004 (prompt-injection hygiene)**: Buyer messages and notes MUST be clearly separated as data, and the AI MUST be instructed to treat them as data, not instructions. Output is displayed as plain text and is **never auto-sent**. The human always confirms.
- **FR-005 (structured output)**: AI responses MUST be obtained in a fixed, machine-validated structure. A missing or non-conforming response triggers the fallback (FR-009).
- **FR-006 (post-validation)**: A referenced offer MUST be one of the lead's matched offers (otherwise none is referenced). The draft language MUST equal the customer's language (otherwise the template draft is used). Draft body length limits: WhatsApp/SMS at most 600 characters, Email at most 1000.
- **FR-007 (reuse of results)**: Results MUST be reused while the lead's state is unchanged (lead version, last activity time, matched offers, prompt revision, channel for drafts), for 24 hours. Reuse MUST NOT trigger a new AI call. Reuse continues to work when the shared cache store is unavailable.
- **FR-008 (budgets)**: An AI call MUST time out at 15 seconds with at most one retry, and be bounded in output size. Each user MUST be limited to 30 generations per hour. Regenerate bypasses reuse but counts against the limit.
- **FR-009 (fallback)**: The system MUST return a deterministic rule-based result when: no AI credential is configured, timeout, API error, refusal, output truncated, validation failure, or rate limit exceeded. The response MUST carry a rule-based source marker and a fallback reason.
- **FR-010**: Every response MUST state its source (AI or rule-based), generation time, whether it was reused, and for AI the model used.
- **FR-011**: The UI MUST label AI output ("AI-generated") and rule output ("Rule-based") distinctly.
- **FR-012 (AI-assisted flag)**: When a draft is used, the composer MUST mark the logged activity as AI-assisted. The timeline MUST show an "AI-assisted" chip for such activities.
- **FR-013 (observability)**: Each call MUST be recorded with: lead, kind, model, latency, token usage, reuse hit, source and fallback reason. Prompt and completion text MUST NEVER be recorded. Feedback (👍/👎) is recorded with lead, kind and the lead-state fingerprint.
- **FR-014**: The AI model and its reasoning effort MUST be configurable by the operator without code changes, with sensible defaults favoring UI latency.
- **FR-015**: The summary MUST be written in the UI language (English). The draft MUST be in the customer's language.

### Key Entities

- **Lead AI context**: the minimized, scrubbed view of a lead (customer attributes, lead attributes, recent activities, open follow-ups, matched offers) that is the only input the AI sees.
- **Suggestion**: summary text, a next best action (action kind, optional channel, timing, reason, optional offer reference) and a confidence level, plus source metadata.
- **Draft**: channel, language, optional subject, body, optional offer reference, plus source metadata.
- **Lead-state fingerprint**: identifies the exact lead state a result was generated for; used to reuse results and detect staleness.
- **Feedback event**: a 👍/👎 signal tied to lead, kind and fingerprint (recorded, not stored in the database).

Reads leads, customers, activities, follow-ups, purchases and offers. Writes nothing directly. The AI-assisted flag on activities is written by activity logging (F06). No schema changes. Results are kept only in a temporary store, never in the database.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Median time to a new (non-reused) suggestion is at most 4 s and the 95th percentile at most 8 s. A reused result appears in at most 200 ms.
- **SC-002**: 100 % of AI responses on a 10-lead golden set pass structure validation, language match and offer validity.
- **SC-003**: 0 occurrences of seeded emails or phone numbers in the context built for any seeded lead.
- **SC-004**: With no AI credential configured, the card renders rule-based output for 100 % of leads with no errors.
- **SC-005**: Average cost is at most €0.02 per new generation, with at most one generation per lead state thanks to reuse.
- **SC-006**: A rep can go from opening a lead to sending an AI-drafted WhatsApp message in at most 3 clicks.

## Assumptions

- Dependencies F05 (lead detail AI slot), F14 (channel actions, templates, preferences), F15 (offer matching) and F06 (AI-assisted flag on activity creation) are available at build time; where not yet merged, their interfaces are stubbed.
- The feature adds no schema changes. The 👍/👎 feedback is recorded in logs only.
- The default reasoning effort is the lowest acceptable, favoring latency. Comparing with a higher effort on the golden set is a planning-time task.
- Rule-based draft templates exist for English, German, French, Italian, Spanish, Dutch and Portuguese across WhatsApp, SMS and Email.
- The UI language is English.

## Out of Scope

- Auto-sending messages; chat agents that converse with customers.
- ML lead scoring (scoring stays rule-based).
- AI in dashboards or narratives.
- Storing AI outputs in the database (temporary store only).
- Multi-turn chat with the AI about a lead.
- Team-level "AI digest" for managers (default: out of scope).
