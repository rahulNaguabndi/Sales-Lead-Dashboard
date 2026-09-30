import { ValidationError } from '@/server/http/errors';

/** Parses a JSON request body; malformed JSON is a 400 like any other validation failure. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ValidationError('Request body must be valid JSON');
  }
}
