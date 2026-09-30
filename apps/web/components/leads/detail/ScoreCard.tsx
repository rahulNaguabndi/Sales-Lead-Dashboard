import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScoreBadge } from '@/components/leads/score';
import type { LeadDetail } from './types';

/** Score summary; the badge opens the five-factor breakdown popover (Intent x/35 … Engagement x/15). */
export function ScoreCard({ lead }: { lead: LeadDetail['lead'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Lead score</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center gap-3 text-sm">
        <ScoreBadge
          score={lead.score}
          priority={lead.priority}
          breakdown={lead.scoreBreakdown}
          updatedAt={lead.updatedAt}
        />
        <span className="text-muted-foreground">Select the badge for the breakdown</span>
      </CardContent>
    </Card>
  );
}
