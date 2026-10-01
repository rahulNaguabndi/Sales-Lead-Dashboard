import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/server/auth/get-current-user';
import { roleHome } from '@/server/auth/next-path';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const user = await getCurrentUser();
  redirect(user ? roleHome(user.role) : '/login');
}
