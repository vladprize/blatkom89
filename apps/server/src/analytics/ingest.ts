/** Client analytics ingestion (POST /api/events): validation, clamping, de-duplication. */
import { parseClientEventProps } from '@blatkom/shared';
import type { ClientEventEnvelope } from '@blatkom/shared';
import type { Sql } from '../database/db.js';
import type { AuthedUser } from '../services/contracts.js';
import { errorRow, insertErrors, insertEvents } from './writer.js';
import { sanitizeMessage } from './sanitize.js';

export const CLOCK_SKEW_MS = 24 * 3600_000;

export interface IngestResult {
  accepted: number;
  duplicates: number;
  rejected: number;
}

export async function ingestClientEvents(sql: Sql, user: AuthedUser, events: ClientEventEnvelope[], now = Date.now()): Promise<IngestResult> {
  let rejected = 0;
  const seen = new Set<string>();
  const rows: Parameters<typeof insertEvents>[1] = [];
  for (const e of events) {
    const id = e.id.toLowerCase();
    if (seen.has(id)) continue; // duplicate inside the same batch
    seen.add(id);
    const props = parseClientEventProps(e.name, e.props);
    if (!props) {
      rejected++;
      continue;
    }
    if (e.name === 'client_error') props.message = sanitizeMessage(String(props.message ?? ''));
    const ts = Math.min(now + CLOCK_SKEW_MS, Math.max(now - CLOCK_SKEW_MS, e.ts));
    rows.push({
      id,
      name: e.name,
      source: 'client',
      user_id: user.userId,
      session_id: user.sessionId,
      occurred_at: new Date(ts).toISOString(),
      platform: user.platform,
      props,
    });
  }
  const inserted = new Set(await insertEvents(sql, rows));
  const errors = rows
    .filter((r) => r.name === 'client_error' && inserted.has(r.id))
    .map((r) =>
      errorRow({
        source: 'client',
        component: String(r.props.component ?? 'client'),
        category: String(r.props.category ?? 'error'),
        message: String(r.props.message ?? ''),
        clientVersion: typeof r.props.clientVersion === 'string' ? r.props.clientVersion : null,
        sessionId: user.sessionId,
        userId: user.userId,
        at: new Date(r.occurred_at),
      }),
    );
  await insertErrors(sql, errors);
  return { accepted: inserted.size, duplicates: rows.length - inserted.size + (events.length - seen.size), rejected };
}
