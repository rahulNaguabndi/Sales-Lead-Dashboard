import Link from 'next/link';

/** The one access-denied screen: same copy and layout for every leader-only page. */
export function Forbidden({
  message = 'This page is available to managers and VPs.',
}: {
  message?: string;
}) {
  return (
    <div className="mx-auto max-w-xl space-y-3 p-10 text-center" role="alert">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">403</p>
      <h1 className="text-xl font-semibold">You don&apos;t have access to this page</h1>
      <p className="text-sm text-slate-400">{message}</p>
      <Link href="/" className="inline-block text-sm text-blue-400 hover:underline">
        Back to your home page
      </Link>
    </div>
  );
}
