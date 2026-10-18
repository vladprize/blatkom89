/** Minimal HTTP router on node:http with JSON helpers, typed errors and middleware chains. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ZodType, ZodTypeDef } from 'zod';
import type { Logger } from '../logging/logger.js';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
  }
}

export interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  method: string;
  path: string;
  query: URLSearchParams;
  params: Record<string, string>;
  ip: string;
  cookies: Record<string, string>;
  /** Free-form per-request state set by middleware (auth results etc.). */
  state: Record<string, unknown>;
  requestId: string;
  body<T>(schema: ZodType<T, ZodTypeDef, unknown>, limitBytes?: number): Promise<T>;
  json(status: number, data: unknown, headers?: Record<string, string>): void;
  send(status: number, body: string | Buffer, contentType: string, headers?: Record<string, string>): void;
}

export type Handler = (ctx: Ctx) => unknown | Promise<unknown>;

interface Route {
  method: string;
  parts: string[];
  handlers: Handler[];
}

export class Router {
  private readonly routes: Route[] = [];

  add(method: string, path: string, ...handlers: Handler[]): this {
    this.routes.push({ method, parts: path.split('/').filter(Boolean), handlers });
    return this;
  }
  get(path: string, ...h: Handler[]) {
    return this.add('GET', path, ...h);
  }
  post(path: string, ...h: Handler[]) {
    return this.add('POST', path, ...h);
  }
  patch(path: string, ...h: Handler[]) {
    return this.add('PATCH', path, ...h);
  }
  delete(path: string, ...h: Handler[]) {
    return this.add('DELETE', path, ...h);
  }

  match(method: string, path: string): { route: Route; params: Record<string, string> } | null {
    const segs = path.split('/').filter(Boolean);
    let methodMismatch = false;
    for (const r of this.routes) {
      if (r.parts.length !== segs.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < segs.length; i++) {
        const p = r.parts[i]!;
        if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(segs[i]!);
        else if (p !== segs[i]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      if (r.method !== method && !(method === 'HEAD' && r.method === 'GET')) {
        methodMismatch = true;
        continue;
      }
      return { route: r, params };
    }
    if (methodMismatch) throw new HttpError(405, 'method_not_allowed', 'Method not allowed');
    return null;
  }

  /** Returns true when a route handled the request. */
  async handle(ctx: Ctx): Promise<boolean> {
    const m = this.match(ctx.method, ctx.path);
    if (!m) return false;
    ctx.params = m.params;
    for (const h of m.route.handlers) {
      await h(ctx);
      if (ctx.res.writableEnded) break;
    }
    if (!ctx.res.writableEnded) ctx.json(204, null);
    return true;
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) {
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  }
  return out;
}

export function serializeCookie(name: string, value: string, opts: { maxAge?: number; httpOnly?: boolean; secure?: boolean; sameSite?: 'Strict' | 'Lax' | 'None'; path?: string }): string {
  let s = `${name}=${encodeURIComponent(value)}; Path=${opts.path ?? '/'}`;
  if (opts.maxAge !== undefined) s += `; Max-Age=${Math.floor(opts.maxAge)}`;
  if (opts.httpOnly !== false) s += '; HttpOnly';
  if (opts.secure) s += '; Secure';
  s += `; SameSite=${opts.sameSite ?? 'Strict'}`;
  return s;
}

export async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const declared = Number(req.headers['content-length'] ?? '0');
  if (declared > limit) throw new HttpError(413, 'payload_too_large', 'Payload too large');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new HttpError(413, 'payload_too_large', 'Payload too large');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

export function createCtx(req: IncomingMessage, res: ServerResponse, opts: { trustProxy: boolean; requestId: string; log: Logger }): Ctx {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const fwd = opts.trustProxy ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim() : '';
  const ip = fwd || req.socket.remoteAddress || 'unknown';
  const ctx: Ctx = {
    req,
    res,
    method: (req.method ?? 'GET').toUpperCase(),
    path: url.pathname,
    query: url.searchParams,
    params: {},
    ip,
    cookies: parseCookies(req.headers.cookie),
    state: {},
    requestId: opts.requestId,
    async body(schema, limitBytes = 64 * 1024) {
      const ct = String(req.headers['content-type'] ?? '');
      if (!ct.includes('application/json')) throw new HttpError(415, 'unsupported_media_type', 'Expected application/json');
      const raw = await readBody(req, limitBytes);
      let data: unknown;
      try {
        data = raw.length ? JSON.parse(raw.toString('utf8')) : {};
      } catch {
        throw new HttpError(400, 'bad_json', 'Malformed JSON');
      }
      const parsed = schema.safeParse(data);
      if (!parsed.success) {
        const msg = parsed.error.issues
          .slice(0, 5)
          .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
          .join('; ');
        throw new HttpError(400, 'validation_error', msg);
      }
      return parsed.data;
    },
    json(status, data, headers = {}) {
      if (res.writableEnded) return;
      const body = status === 204 ? '' : JSON.stringify(data);
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
      res.end(body);
    },
    send(status, body, contentType, headers = {}) {
      if (res.writableEnded) return;
      res.writeHead(status, { 'content-type': contentType, ...headers });
      res.end(body);
    },
  };
  return ctx;
}
