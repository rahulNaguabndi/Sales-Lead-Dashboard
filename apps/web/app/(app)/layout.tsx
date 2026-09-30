import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { NavRail } from '@/components/layout/nav-rail';
import { TopBar } from '@/components/layout/top-bar';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { teams } from '@/server/db/schema';
import { LiveProvider } from '@/components/live/LiveProvider';
import { getCurrentUser } from '@/server/auth/get-current-user';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const teamName = user.teamId
    ? (db.select().from(teams).where(eq(teams.id, user.teamId)).get()?.name ?? null)
    : null;

  return (
    <LiveProvider userId={user.id}>
      <div className="flex h-screen">
        <NavRail role={user.role} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar user={{ ...user, teamName }} />
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </LiveProvider>
  );
}
