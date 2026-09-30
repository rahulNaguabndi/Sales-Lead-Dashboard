import type { Role } from '@leaddesk/shared';

const ROLE_HOME: Partial<Record<Role, string>> = { REP: '/inbox' };

export function roleHome(role: Role): string {
  return ROLE_HOME[role] ?? '/dashboard';
}

/** Returns `next` only if it is a same-origin absolute path; otherwise the role home. */
export function sanitizeNext(next: string | null | undefined, role: Role): string {
  if (
    next &&
    next.startsWith('/') &&
    !next.startsWith('//') &&
    !next.includes(String.fromCharCode(92)) &&
    // eslint-disable-next-line no-control-regex
    !/[\u0000-\u001f]/.test(next)
  ) {
    return next;
  }
  return roleHome(role);
}
