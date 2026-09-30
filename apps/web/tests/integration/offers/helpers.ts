import { cookieFrom, PASSWORD, req, setupAuthEnv } from '../auth/helpers';

export { req, setupAuthEnv };

export const EMAILS = {
  REP: 'sofia.rossi@eurodrive.test', // Team South
  MANAGER: 'marco.bianchi@eurodrive.test', // Team South manager
  OTHER_MANAGER: 'lukas.becker@eurodrive.test', // Team DACH manager
  VP: 'isabelle.laurent@eurodrive.test',
} as const;

let ip = 10;

/** Signs in through the real login route and returns the session cookie. */
export async function loginAs(email: string): Promise<string> {
  const { POST } = await import('@/app/api/auth/login/route');
  const res = await POST(
    req('/api/auth/login', {
      method: 'POST',
      body: { email, password: PASSWORD },
      headers: { 'x-forwarded-for': `9.9.9.${ip++}` },
    }),
  );
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status}`);
  return cookieFrom(res);
}

export const validOffer = (over: Record<string, unknown> = {}) => ({
  title: 'Autumn Finance 0,9 %',
  description: 'Low rate finance',
  discountType: 'APR',
  value: 90,
  validFrom: Date.now() - 86_400_000,
  validTo: Date.now() + 30 * 86_400_000,
  eligibility: { requiresFinance: true, countries: ['DE', 'AT'] },
  ...over,
});
