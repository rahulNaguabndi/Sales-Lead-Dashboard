import { NextResponse } from 'next/server';

export function errorJson(
  status: number,
  code: string,
  message: string,
  headers: Record<string, string> = {},
  fields?: Record<string, string>,
): NextResponse {
  return NextResponse.json(
    { error: { code, message, ...(fields ? { fields } : {}) } },
    { status, headers },
  );
}
