import { useContext } from 'react';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';

/** `router.refresh()` when the App Router is mounted; a no-op elsewhere (e.g. server-render tests). */
export function useRefresh(): () => void {
  const router = useContext(AppRouterContext);
  return () => router?.refresh();
}
