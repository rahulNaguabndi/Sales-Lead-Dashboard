import { Skeleton } from '@/components/ui/skeleton';

export default function LeadDetailLoading() {
  return (
    <div className="space-y-4 p-6" aria-busy="true">
      <Skeleton className="h-10 w-1/2" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}
