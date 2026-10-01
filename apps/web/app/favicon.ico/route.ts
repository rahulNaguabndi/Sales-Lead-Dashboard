// Browsers request /favicon.ico regardless of <link rel="icon">; serve the app icon instead of a 404.
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#2563eb"/><path d="M9 9h12v3H12.5v2.5H20v3h-7.5V20H21v3H9z" fill="#fff"/></svg>';

export const dynamic = 'force-static';

export function GET() {
  return new Response(SVG, {
    headers: { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=86400' },
  });
}
