/** Error/message sanitizing: no credentials, e-mails, long identifiers or digit runs in storage. */
import { createHash } from 'node:crypto';

export function sanitizeMessage(input: string, max = 300): string {
  return String(input)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\b(bearer|token|hash|initdata|init_data|signature|password|secret|authorization|cookie)\b\s*[=:]?\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/https?:\/\/[^\s?#]+[?#][^\s]*/g, (m) => m.replace(/[?#].*$/, '?…'))
    .replace(/[A-Za-z0-9_-]{24,}/g, '[id]')
    .replace(/\d{6,}/g, '[num]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function sanitizeLabel(input: string, max = 40): string {
  const s = String(input).replace(/[^\p{L}\p{N}_.:\-/ ]/gu, '').trim().slice(0, max);
  return s || 'unknown';
}

/** Stable grouping key: same component/category and message shape → same fingerprint. */
export function errorFingerprint(source: string, component: string, category: string, message: string): string {
  const shape = message
    .toLowerCase()
    .replace(/\[(?:num|id|email|redacted)\]/g, '#')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .slice(0, 160);
  return createHash('sha1').update(`${source}|${component}|${category}|${shape}`).digest('hex').slice(0, 16);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function uuidOrNull(v: unknown): string | null {
  return typeof v === 'string' && UUID_RE.test(v) ? v : null;
}

/** Keeps props JSON-safe and small (server events are trusted but still bounded). */
export function boundedProps(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let n = 0;
  for (const [k, v] of Object.entries(props)) {
    if (++n > 24) break;
    const key = k.slice(0, 40);
    if (typeof v === 'string') out[key] = v.slice(0, 200);
    else if (typeof v === 'number') out[key] = Number.isFinite(v) ? v : null;
    else if (typeof v === 'boolean' || v === null) out[key] = v;
  }
  return out;
}
