/** Static file serving for the built web client (apps/web/dist) with safe path resolution. */
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { Ctx } from './router.js';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

export function securityHeaders(isHtml: boolean): Record<string, string> {
  const h: Record<string, string> = {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'cross-origin-opener-policy': 'same-origin-allow-popups',
  };
  if (isHtml) {
    h['content-security-policy'] = [
      "default-src 'self'",
      "script-src 'self' https://telegram.org",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self' ws: wss:",
      "media-src 'self' blob:",
      "worker-src 'self' blob:",
      "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ');
  }
  return h;
}

export function serveStatic(root: string) {
  const base = resolve(root);
  return (ctx: Ctx): boolean => {
    if (ctx.method !== 'GET' && ctx.method !== 'HEAD') return false;
    let rel = decodeURIComponent(ctx.path);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = normalize(join(base, rel));
    if (!file.startsWith(base + sep) && file !== base) return false;
    let target = file;
    let st;
    try {
      st = statSync(target);
      if (st.isDirectory()) {
        target = join(target, 'index.html');
        st = statSync(target);
      }
    } catch {
      // SPA fallback for client routes (not for missing assets)
      if (extname(rel)) return false;
      target = join(base, rel.startsWith('/admin') ? 'admin.html' : 'index.html');
      try {
        st = statSync(target);
      } catch {
        return false;
      }
    }
    const ext = extname(target).toLowerCase();
    const type = TYPES[ext] ?? 'application/octet-stream';
    const hashed = /\.[0-9a-f]{8,}\.(js|css|png|woff2?)$/.test(target) || target.includes(`${sep}assets${sep}`);
    const headers: Record<string, string> = {
      'content-type': type,
      'content-length': String(st.size),
      'cache-control': ext === '.html' ? 'no-cache' : hashed ? 'public, max-age=604800' : 'public, max-age=3600',
      ...securityHeaders(ext === '.html'),
    };
    ctx.res.writeHead(200, headers);
    if (ctx.method === 'HEAD') {
      ctx.res.end();
      return true;
    }
    createReadStream(target).pipe(ctx.res);
    return true;
  };
}
