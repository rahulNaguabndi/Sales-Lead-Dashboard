import { QueryClient } from '@tanstack/react-query';

const g = globalThis as unknown as { __ldQueryClient?: QueryClient };

/** One browser-side QueryClient shared by the live-update provider and the inbox. */
export function getSharedQueryClient(): QueryClient {
  return (g.__ldQueryClient ??= new QueryClient({ defaultOptions: { queries: { retry: 1 } } }));
}
