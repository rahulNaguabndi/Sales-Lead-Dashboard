'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { Role } from '@leaddesk/shared';

export type ClientUser = { id: string; name: string; role: Role; teamId: string | null };

const Ctx = createContext<ClientUser | null>(null);

/** The signed-in user for client components (optimistic updates); never used for authorization. */
export function CurrentUserProvider({ user, children }: { user: ClientUser; children: ReactNode }) {
  return <Ctx.Provider value={user}>{children}</Ctx.Provider>;
}

export const useCurrentUser = (): ClientUser | null => useContext(Ctx);
