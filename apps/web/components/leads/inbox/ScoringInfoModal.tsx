'use client';

import { Info } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

const INTENT_ROWS = [
  { label: 'Test drive requested', pts: '+12' },
  { label: 'Wants finance', pts: '+5' },
  { label: 'Has a trade-in', pts: '+5' },
  { label: 'Budget given', pts: '+5' },
  { label: 'Specific model chosen', pts: '+4' },
  { label: 'Detailed message (30+ chars)', pts: '+4' },
];

const SOURCE_ROWS = [
  { label: 'Referral', pts: '15' },
  { label: 'Walk-in', pts: '14' },
  { label: 'Phone', pts: '12' },
  { label: 'Website', pts: '10' },
  { label: 'Google Ads', pts: '8' },
  { label: 'Portal', pts: '6' },
  { label: 'Facebook / Instagram', pts: '5' },
];

const FRESHNESS_ROWS = [
  { label: 'Less than 1 hour old', pts: '+20' },
  { label: 'Less than 24 hours old', pts: '+15' },
  { label: 'Less than 72 hours old', pts: '+10' },
  { label: 'Less than 1 week old', pts: '+5' },
  { label: 'Over 1 week old', pts: '+0' },
];

const ENGAGEMENT_ROWS = [
  { label: 'Last outcome: Interested', pts: '+15' },
  { label: 'Last outcome: Callback requested', pts: '+10' },
  { label: 'Last outcome: Connected', pts: '+6' },
  { label: 'Per unanswered call attempt', pts: '−3' },
];

function Table({ rows }: { rows: { label: string; pts: string }[] }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-b border-slate-800 last:border-0">
            <td className="py-1.5 text-slate-300">{r.label}</td>
            <td className="py-1.5 text-right font-mono text-slate-400">{r.pts}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Section({
  title,
  max,
  children,
}: {
  title: string;
  max: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {title}
        </span>
        <span className="text-xs text-slate-500">max {max} pts</span>
      </div>
      {children}
    </div>
  );
}

export function ScoringInfoModal() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          aria-label="Scoring & priority guide"
          className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-200"
        >
          <Info className="h-4 w-4" aria-hidden />
        </button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lead Scoring &amp; Priority Guide</DialogTitle>
        </DialogHeader>

        {/* Priority thresholds */}
        <div className="flex gap-3">
          {[
            { label: 'HOT', color: 'bg-red-500', threshold: '≥ 70' },
            { label: 'WARM', color: 'bg-amber-400', threshold: '≥ 40' },
            { label: 'COOL', color: 'bg-sky-400', threshold: '< 40' },
          ].map((p) => (
            <div
              key={p.label}
              className="flex flex-1 flex-col items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 py-2"
            >
              <span className={`h-3 w-3 rounded-full ${p.color}`} aria-hidden />
              <span className="text-xs font-semibold text-slate-200">{p.label}</span>
              <span className="text-xs text-slate-500">score {p.threshold}</span>
            </div>
          ))}
        </div>

        <p className="text-xs text-slate-500">
          Score is the sum of five factors, capped at 100. Priority is re-evaluated whenever a
          relevant activity is logged.
        </p>

        <div className="space-y-4">
          <Section title="Intent signals" max="35">
            <Table rows={INTENT_ROWS} />
          </Section>

          <Section title="Source" max="15">
            <Table rows={SOURCE_ROWS} />
          </Section>

          <Section title="Customer history" max="15">
            <Table
              rows={[
                { label: 'Returning customer', pts: '+10' },
                { label: 'Purchase in the last 5 years', pts: '+5' },
              ]}
            />
          </Section>

          <Section title="Freshness" max="20">
            <Table rows={FRESHNESS_ROWS} />
          </Section>

          <Section title="Engagement" max="15">
            <Table rows={ENGAGEMENT_ROWS} />
          </Section>
        </div>

        {/* Cold stage */}
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            COLD stage
          </p>
          <p className="text-sm text-slate-300">
            Separate from priority. A background job moves an open lead to{' '}
            <span className="rounded-full bg-slate-500/15 px-1.5 text-slate-400">COLD</span> when
            there has been no contact for <span className="font-medium text-slate-200">7 days</span>{' '}
            (configurable via{' '}
            <code className="rounded bg-slate-800 px-1 text-xs">COLD_AFTER_DAYS</code>).
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
