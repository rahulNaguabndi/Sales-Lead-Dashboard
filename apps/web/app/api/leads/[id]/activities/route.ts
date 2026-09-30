import type { NextRequest } from 'next/server';
import { handleGet } from './handlers/get';
import { handlePost } from './handlers/post';

type Ctx = { params: { id: string } };

// Thin delegation so F05 (GET) and F06 (POST) each own exactly one handler file.
export const GET = (req: NextRequest, ctx: Ctx) => handleGet(req, ctx);
export const POST = (req: NextRequest, ctx: Ctx) => handlePost(req, ctx);
