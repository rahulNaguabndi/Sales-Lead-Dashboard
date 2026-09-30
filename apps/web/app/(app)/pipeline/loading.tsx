import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="flex gap-3 p-4" aria-busy="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-80 w-[280px] shrink-0" />
      ))}
    </div>
  );
}
