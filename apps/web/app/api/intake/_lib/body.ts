export const MAX_BODY_BYTES = 10_240;

export function isJson(contentType: string | null): boolean {
  return /^application\/json\b/i.test(contentType ?? '');
}

/** Content-Length is only a hint; the actual byte length is enforced after reading. */
export function tooLarge(contentLength: string | null): boolean {
  return contentLength !== null && Number(contentLength) > MAX_BODY_BYTES;
}

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}
