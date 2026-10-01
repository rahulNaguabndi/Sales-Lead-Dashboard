import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { stageLabel, vehicleName } from '@leaddesk/shared';
import { formatDate, formatEUR } from '@/lib/format';
import type { LeadDetail } from './types';

export function HistoryCard({ history }: { history: LeadDetail['history'] }) {
  const { previousLeads, purchases } = history;
  const empty = previousLeads.length === 0 && purchases.length === 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">History</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {empty && <p className="text-muted-foreground">First enquiry</p>}
        {previousLeads.length > 0 && (
          <ul className="space-y-1">
            {previousLeads.map((p) => (
              <li key={p.id} className="flex justify-between gap-2">
                {p.canView ? (
                  <Link href={`/leads/${p.id}`} className="text-blue-400 hover:underline">
                    {p.reference}
                  </Link>
                ) : (
                  <span>{p.reference}</span>
                )}
                <span className="text-muted-foreground">
                  {vehicleName(p.vehicleModel)} · {stageLabel(p.stage)} · {formatDate(p.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {purchases.length > 0 && (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Purchases</p>
            <ul className="space-y-1">
              {purchases.map((p, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span>{vehicleName(p.vehicleModel)}</span>
                  <span className="text-muted-foreground">
                    {formatEUR(p.amount)} · {formatDate(p.purchasedAt)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
