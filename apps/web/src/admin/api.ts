/** Admin API client: same-origin cookie session + CSRF header for state-changing calls. */
import type { AdminMe } from '@blatkom/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

let csrfToken: string | null = null;
let onUnauthorized: () => void = () => {};

export function setSession(me: AdminMe | null): void {
  csrfToken = me?.csrfToken ?? null;
}

export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn;
}

export async function apiFetch<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? 'GET';
  const headers: Record<string, string> = { accept: 'application/json' };
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers['x-csrf-token'] = csrfToken;
  const res = await fetch(path, { method, headers, credentials: 'same-origin', body: init.body === undefined ? undefined : JSON.stringify(init.body) });
  let data: unknown = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
    if (res.status === 401 && path !== '/api/admin/login') onUnauthorized();
    throw new ApiError(res.status, err?.code ?? 'http_error', err?.message ?? `Ошибка ${res.status}`);
  }
  return data as T;
}

export function rangeQuery(r: { key: string; from?: string; to?: string }): string {
  const p = new URLSearchParams({ range: r.key });
  if (r.key === 'custom' && r.from && r.to) {
    p.set('from', r.from);
    p.set('to', r.to);
  }
  return p.toString();
}
