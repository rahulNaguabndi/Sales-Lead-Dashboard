import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import type { ApiError } from '@leaddesk/shared';

export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: string;
  readonly fields?: Record<string, string>;

  constructor(message: string, options?: { fields?: Record<string, string> }) {
    super(message);
    this.name = new.target.name;
    this.fields = options?.fields;
  }
}

export class ValidationError extends AppError {
  readonly statusCode = 400;
  readonly code = 'VALIDATION_ERROR';
}
export class UnauthorizedError extends AppError {
  readonly statusCode = 401;
  readonly code = 'UNAUTHORIZED';
  constructor(message = 'Authentication required') {
    super(message);
  }
}
export class ForbiddenError extends AppError {
  readonly statusCode = 403;
  readonly code = 'FORBIDDEN';
  constructor(message = 'You do not have access to this resource') {
    super(message);
  }
}
export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly code = 'NOT_FOUND';
  constructor(entity = 'resource') {
    super(`${entity} not found`);
  }
}
export class ConflictError extends AppError {
  readonly statusCode = 409;
  readonly code = 'CONFLICT';
}
export class RateLimitError extends AppError {
  readonly statusCode = 429;
  readonly code = 'RATE_LIMITED';
}

/** Maps any thrown value to an HTTP status and the shared ApiError body. Never leaks stacks. */
export function toErrorResponse(
  err: unknown,
  requestId: string = randomUUID(),
): { status: number; body: ApiError } {
  if (err instanceof AppError) {
    const error: ApiError['error'] = { code: err.code, message: err.message };
    if (err.fields) error.fields = err.fields;
    return { status: err.statusCode, body: { error } };
  }
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || '_';
      fields[key] ??= issue.message;
    }
    return {
      status: 400,
      body: { error: { code: 'VALIDATION_ERROR', message: 'Request is invalid', fields } },
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  console.error(JSON.stringify({ level: 'error', requestId, message }));
  return {
    status: 500,
    body: {
      error: { code: 'INTERNAL_ERROR', message: `Internal server error (ref ${requestId})` },
    },
  };
}
