import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/server/auth/get-current-user';
import { sanitizeNext } from '@/server/auth/next-path';
import { LoginForm } from './login-form';
import { DemoPersonas } from './demo-personas';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; expired?: string };
}) {
  const user = await getCurrentUser();
  if (user) redirect(sanitizeNext(searchParams.next, user.role));

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">EuroDrive Lead Desk</h1>
        <p className="text-slate-400">Sign in to continue</p>
      </div>
      <LoginForm next={searchParams.next} expired={searchParams.expired === '1'} />
      {process.env.NODE_ENV !== 'production' ? <DemoPersonas next={searchParams.next} /> : null}
    </main>
  );
}
