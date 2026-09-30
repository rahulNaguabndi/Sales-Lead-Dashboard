/** Posts credentials; on success navigates to the sanitized target and returns null, else returns an error message. */
export async function signIn(
  email: string,
  password: string,
  next?: string,
): Promise<string | null> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (res.ok) {
    const { user } = (await res.json()) as { user: { home: string } };
    const safe =
      next &&
      next.startsWith('/') &&
      !next.startsWith('//') &&
      !next.includes(String.fromCharCode(92))
        ? next
        : user.home;
    window.location.assign(safe);
    return null;
  }
  if (res.status === 429) {
    return `Too many attempts. Try again in ${res.headers.get('Retry-After') ?? 'a few'} seconds.`;
  }
  if (res.status === 403) return 'This account is disabled.';
  return 'Invalid email or password.';
}
