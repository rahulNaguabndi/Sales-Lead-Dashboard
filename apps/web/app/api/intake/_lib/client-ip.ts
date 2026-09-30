/** First X-Forwarded-For entry, else X-Real-IP, else "unknown". */
export function clientIp(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return fwd || headers.get('x-real-ip')?.trim() || 'unknown';
}
