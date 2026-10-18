/** Bearer-token middleware for player endpoints. */
import { HttpError } from './router.js';
import type { Ctx, Handler } from './router.js';
import type { AuthedUser, SessionVerifier } from '../services/contracts.js';

export function bearerToken(ctx: Ctx): string | null {
  const h = String(ctx.req.headers.authorization ?? '');
  const m = /^Bearer ([A-Za-z0-9_\-.~+/=]{16,256})$/.exec(h);
  return m ? m[1]! : null;
}

export function requireUser(sessions: SessionVerifier): Handler {
  return async (ctx) => {
    const token = bearerToken(ctx);
    if (!token) throw new HttpError(401, 'unauthorized', 'Authentication required');
    const user = await sessions.verify(token);
    if (!user) throw new HttpError(401, 'unauthorized', 'Session expired or invalid');
    ctx.state.user = user;
  };
}

export function currentUser(ctx: Ctx): AuthedUser {
  const u = ctx.state.user as AuthedUser | undefined;
  if (!u) throw new HttpError(401, 'unauthorized', 'Authentication required');
  return u;
}
