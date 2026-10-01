import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { NavRail } from '@/components/layout/nav-rail';
import { TopBar } from '@/components/layout/top-bar';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { teams } from '@/server/db/schema';
import { LiveProvider } from '@/components/live/LiveProvider';
import { CurrentUserProvider } from '@/components/layout/current-user';
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
      <CurrentUserProvider
        user={{ id: user.id, name: user.name, role: user.role, teamId: user.teamId }}
      >
        <div className="flex h-screen overflow-hidden">
          {/* Below `sm` the rail becomes a bottom tab bar, so the page never scrolls sideways. */}
          <NavRail role={user.role} />
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar user={{ ...user, teamName }} />
            <main className="min-w-0 flex-1 overflow-auto pb-14 sm:pb-0">{children}</main>
          </div>
        </div>
      </CurrentUserProvider>
    </LiveProvider>
  );
}
