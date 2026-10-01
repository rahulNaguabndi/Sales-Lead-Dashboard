import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScoreBadge, ScoreBreakdownList } from '@/components/leads/score';
import type { LeadDetail } from './types';

/** Score summary with the five-factor breakdown shown inline (Intent x/35 … Engagement x/15). */
export function ScoreCard({ lead }: { lead: LeadDetail['lead'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Lead score</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <ScoreBadge
            score={lead.score}
            priority={lead.priority}
            breakdown={lead.scoreBreakdown}
            updatedAt={lead.updatedAt}
          />
          <span className="text-xs text-muted-foreground">out of 100</span>
        </div>
        <ScoreBreakdownList breakdown={lead.scoreBreakdown} />
      </CardContent>
    </Card>
  );
}
