import { Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

/** Always shows text, never colour alone: AI-generated vs rule-based. */
export function SourceBadge({ source }: { source: 'AI' | 'RULES' }) {
  if (source === 'AI')
    return (
      <Badge variant="secondary" data-testid="ai-source" className="gap-1">
        <Sparkles aria-hidden className="size-3" />
        AI-generated
      </Badge>
    );
  return (
    <Badge
      variant="outline"
      data-testid="ai-source"
      title="AI unavailable: showing rule-based suggestion"
    >
      Rule-based
    </Badge>
  );
}
