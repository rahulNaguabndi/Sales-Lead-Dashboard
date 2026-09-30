import Link from 'next/link';

export default function LeadNotFound() {
  return (
    <div className="space-y-3 p-6">
      <h1 className="text-lg font-semibold">Lead not found</h1>
      <p className="text-sm text-muted-foreground">
        Lead not found. It may not exist or you may not have access.
      </p>
      <Link href="/" className="text-sm text-blue-400 hover:underline">
        Back to inbox
      </Link>
    </div>
  );
}
