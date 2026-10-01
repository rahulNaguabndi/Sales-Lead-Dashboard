'use client';

import { useRouter } from 'next/navigation';
import { roleLabel, type Role } from '@leaddesk/shared';
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
      <div className="hidden flex-col items-end leading-tight sm:flex">
        <span className="whitespace-nowrap text-sm text-slate-200">{user.name}</span>
        {user.teamName ? (
          <span className="whitespace-nowrap text-xs text-slate-500">{user.teamName}</span>
        ) : null}
      </div>
      <Badge variant="secondary" title={user.name}>
        {roleLabel(user.role)}
      </Badge>
      <Button variant="ghost" size="sm" onClick={logout}>
        Logout
      </Button>
    </div>
  );
}
