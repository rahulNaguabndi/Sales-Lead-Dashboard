import { AppError } from '../http/errors';

/** 401 carrying the `UNAUTHENTICATED` code the auth spec requires (F01's UnauthorizedError uses UNAUTHORIZED). */
export class UnauthenticatedError extends AppError {
  readonly statusCode = 401;
  readonly code = 'UNAUTHENTICATED';
  constructor(message = 'Authentication required') {
    super(message);
  }
}
