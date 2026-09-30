'use client';

import { Button } from '@/components/ui/button';

export default function InboxError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div
      role="alert"
      className="m-4 flex items-center justify-between rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-red-300"
    >
      <span>Could not load the inbox.</span>
      <Button size="sm" variant="outline" onClick={reset}>
        Retry
      </Button>
    </div>
  );
}
