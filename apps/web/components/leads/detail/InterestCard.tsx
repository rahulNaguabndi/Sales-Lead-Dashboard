import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CollapsibleText } from '@/components/timeline/TimelineEntry';
import { formatBudget, formatEUR } from './format';
import type { LeadDetail } from './types';

const yn = (v: boolean) => (v ? 'Yes' : 'No');

export function InterestCard({ lead }: { lead: LeadDetail['lead'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Interest</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="font-medium">
          {lead.vehicleName ?? 'No model selected'}
          {lead.vehiclePrice != null && (
            <span className="ml-2 font-normal text-muted-foreground">
              {formatEUR(lead.vehiclePrice)}
            </span>
          )}
        </p>
        <dl className="space-y-1.5">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Budget</dt>
            <dd>{formatBudget(lead.budgetMin, lead.budgetMax)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Trade-in</dt>
            <dd>{yn(lead.hasTradeIn)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Finance</dt>
            <dd>{yn(lead.wantsFinance)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Test drive requested</dt>
            <dd>{yn(lead.testDriveRequested)}</dd>
          </div>
        </dl>
        {lead.message && (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Customer message</p>
            <CollapsibleText text={lead.message} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
