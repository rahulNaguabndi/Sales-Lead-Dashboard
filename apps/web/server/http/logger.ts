/**
 * Structured request logging. The schema is deliberately minimal and must never contain PII:
 * no email, phone, name, password or passwordHash fields.
 */
export type RequestLogEntry = {
  route: string;
  userId: string | null;
  status: number;
  ms: number;
  requestId: string;
};

export function logRequest({ route, userId, status, ms, requestId }: RequestLogEntry): void {
  // Destructured on purpose: extra properties on the argument are dropped, never logged.
  process.stdout.write(
    `${JSON.stringify({ level: 'info', route, userId, status, ms, requestId })}\n`,
  );
}
