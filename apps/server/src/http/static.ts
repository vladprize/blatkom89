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
    // esbuild output carries a content hash in the name; game assets are requested with ?v=<content hash>
    const immutable = /-[A-Z0-9]{8}\.(js|css|woff2?|png)$/.test(target) || /[?&]v=[0-9a-f]{6,}/.test(ctx.req.url ?? '');
    const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    const isAdmin = target.endsWith(`${sep}admin.html`);
    const headers: Record<string, string> = {
      'content-type': type,
      'cache-control': ext === '.html' ? (isAdmin ? 'no-store' : 'no-cache') : immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=300, must-revalidate',
      etag,
      ...securityHeaders(ext === '.html'),
    };
    if (isAdmin) {
      // the dashboard is never embedded anywhere (clickjacking)
      headers['content-security-policy'] = headers['content-security-policy']!.replace(/frame-ancestors [^;]+/, "frame-ancestors 'none'");
      headers['x-frame-options'] = 'DENY';
    }
    if (ctx.req.headers['if-none-match'] === etag) {
      ctx.res.writeHead(304, headers);
      ctx.res.end();
      return true;
    }
    headers['content-length'] = String(st.size);
    ctx.res.writeHead(200, headers);
    if (ctx.method === 'HEAD') {
      ctx.res.end();
      return true;
    }
    createReadStream(target).pipe(ctx.res);
    return true;
  };
}
