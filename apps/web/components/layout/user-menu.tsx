'use client';

import { useRouter } from 'next/navigation';
import type { Role } from '@leaddesk/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function UserMenu({
  user,
}: {
  user: { name: string; role: Role; teamName?: string | null };
}) {
  const router = useRouter();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-col items-end leading-tight">
        <span className="text-sm text-slate-200">{user.name}</span>
        {user.teamName ? <span className="text-xs text-slate-500">{user.teamName}</span> : null}
      </div>
      <Badge variant="secondary">{user.role}</Badge>
      <Button variant="ghost" size="sm" onClick={logout}>
        Logout
      </Button>
    </div>
  );
}
