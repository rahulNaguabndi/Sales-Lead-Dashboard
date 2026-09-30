import { count } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { leads } from '@/server/db/schema';
import { getCurrentUser } from '@/server/auth/get-current-user';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const user = await getCurrentUser();
  let leadCount: number | null = null;
  try {
    leadCount = db.select({ n: count() }).from(leads).get()?.n ?? 0;
  } catch {
    leadCount = null;
  }

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold">EuroDrive Lead Desk</h2>
      <p className="mt-2 text-slate-400">
        Signed in as {user?.name} ({user?.role}).{' '}
        {leadCount === null
          ? 'Database not found - run `npm run db:reset`.'
          : `${leadCount} leads loaded.`}
      </p>
    </div>
  );
}
