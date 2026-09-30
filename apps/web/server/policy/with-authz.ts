import { getCurrentUser } from '../auth/get-current-user';
import { NotFoundError, UnauthorizedError, toErrorResponse } from '../http/errors';
import { authorize } from './authorize';
import type { Action } from './actions';
import { getScope } from './scope';
import type { CurrentUser, Resource, Scope } from './types';

export type AuthzContext<P> = {
  user: CurrentUser;
  scope: Scope;
  resource?: Resource;
  req: Request;
  params: P;
};

export type RouteHandler<P> = (req: Request, ctx: { params: P }) => Promise<Response>;

export type WithAuthzOptions<P> = {
  action: Action;
  loadResource?: (params: P, user: CurrentUser) => Promise<Resource | undefined>;
  /** Defaults to the signed-in user from F02's session (getCurrentUser); injectable for tests. */
  resolveUser?: (req: Request) => Promise<CurrentUser>;
};

async function defaultResolveUser(req: Request): Promise<CurrentUser> {
  const user = await getCurrentUser(req);
  if (!user) throw new UnauthorizedError();
  return user;
}

/** Route wrapper: resolve user -> load resource -> authorize -> handler; AppErrors become JSON responses. */
export function withAuthz<P = Record<string, string>>(
  handler: (ctx: AuthzContext<P>) => Promise<Response>,
  opts: WithAuthzOptions<P>,
): RouteHandler<P> {
  return async (req, ctx) => {
    try {
      const user = await (opts.resolveUser ?? defaultResolveUser)(req);
      const params = ctx?.params as P;
      let resource: Resource | undefined;
      if (opts.loadResource) {
        resource = await opts.loadResource(params, user);
        if (!resource) throw new NotFoundError('resource');
      }
      const scope = await getScope(user.id);
      await authorize(user, opts.action, resource, { scope });
      return await handler({ user, scope, resource, req, params });
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      return Response.json(body, { status });
    }
  };
}
