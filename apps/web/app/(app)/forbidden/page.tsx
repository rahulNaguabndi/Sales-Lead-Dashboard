import { Forbidden } from '@/components/layout/forbidden';

// Middleware rewrites leader-only pages here with HTTP 403 for REPs.
export const metadata = { title: 'Not allowed' };

export default function ForbiddenPage() {
  return <Forbidden />;
}
