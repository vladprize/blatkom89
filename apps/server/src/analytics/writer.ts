/**
 * Server-side analytics + technical error recording. Fire-and-forget: calls never throw and never
 * block gameplay; rows are buffered and flushed in batches (FK-safe via LEFT JOINs).
 */
import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import type { Sql } from '../database/db.js';
import type { Logger } from '../logging/logger.js';
import type { Analytics, EventContext, ServerEventName } from '../services/contracts.js';
import { boundedProps, errorFingerprint, sanitizeLabel, sanitizeMessage, uuidOrNull } from './sanitize.js';

interface EventRow {
  id: string;
  name: string;
  source: 'client' | 'server';
  user_id: string | null;
  session_id: string | null;
  occurred_at: string;
  platform: string | null;
  props: Record<string, unknown>;
}

export interface ErrorRow {
  occurred_at: string;
  source: 'client' | 'server';
  component: string;
  category: string;
  message: string;
  fingerprint: string;
  client_version: string | null;
  server_version: string | null;
  session_id: string | null;
  user_id: string | null;
}

export async function insertEvents(sql: Sql, rows: EventRow[]): Promise<string[]> {
  if (rows.length === 0) return [];
  const inserted = await sql<Array<{ id: string }>>`
    INSERT INTO analytics_events (id, name, source, user_id, session_id, occurred_at, platform, props)
    SELECT r.id, r.name, r.source, u.id, s.id, r.occurred_at, r.platform, COALESCE(r.props, '{}'::jsonb)
    FROM jsonb_to_recordset(${sql.json(rows as unknown as postgres.JSONValue)})
      AS r(id uuid, name text, source text, user_id uuid, session_id uuid, occurred_at timestamptz, platform text, props jsonb)
    LEFT JOIN users u ON u.id = r.user_id
    LEFT JOIN sessions s ON s.id = r.session_id
    ON CONFLICT (id) DO NOTHING
    RETURNING id`;
  return inserted.map((r) => r.id);
}

export async function insertErrors(sql: Sql, rows: ErrorRow[]): Promise<void> {
  if (rows.length === 0) return;
  await sql`
    INSERT INTO app_errors (occurred_at, source, component, category, message, fingerprint, client_version, server_version, session_id, user_id)
    SELECT r.occurred_at, r.source, r.component, r.category, r.message, r.fingerprint, r.client_version, r.server_version, r.session_id, u.id
    FROM jsonb_to_recordset(${sql.json(rows as unknown as postgres.JSONValue)})
      AS r(occurred_at timestamptz, source text, component text, category text, message text, fingerprint text,
           client_version text, server_version text, session_id uuid, user_id uuid)
    LEFT JOIN users u ON u.id = r.user_id`;
}

export function errorRow(e: { source: 'client' | 'server'; component: string; category: string; message: string; clientVersion?: string | null; serverVersion?: string | null; sessionId?: string | null; userId?: string | null; at?: Date }): ErrorRow {
  const component = sanitizeLabel(e.component);
  const category = sanitizeLabel(e.category);
  const message = sanitizeMessage(e.message) || 'unknown';
  return {
    occurred_at: (e.at ?? new Date()).toISOString(),
    source: e.source,
    component,
    category,
    message,
    fingerprint: errorFingerprint(e.source, component, category, message),
    client_version: e.clientVersion ? sanitizeLabel(e.clientVersion, 32) : null,
    server_version: e.serverVersion ? sanitizeLabel(e.serverVersion, 32) : null,
    session_id: uuidOrNull(e.sessionId),
    user_id: uuidOrNull(e.userId),
  };
}

export class PgAnalytics implements Analytics {
  private events: EventRow[] = [];
  private errors: ErrorRow[] = [];
  private readonly timer: NodeJS.Timeout;
  private flushing: Promise<void> | null = null;

  constructor(
    private readonly sql: Sql,
    private readonly log: Logger,
    private readonly serverVersion: string,
    flushMs = 1000,
  ) {
    this.timer = setInterval(() => void this.flush(), flushMs);
    this.timer.unref?.();
  }

  server(name: ServerEventName, props: Record<string, unknown>, ctx: EventContext = {}): void {
    try {
      this.events.push({
        id: randomUUID(),
        name,
        source: 'server',
        user_id: uuidOrNull(ctx.userId),
        session_id: uuidOrNull(ctx.sessionId),
        occurred_at: new Date().toISOString(),
        platform: ctx.platform ? sanitizeLabel(ctx.platform, 32) : null,
        props: boundedProps(props),
      });
      if (this.events.length > 2000) this.events.splice(0, this.events.length - 2000);
      if (this.events.length >= 100) void this.flush();
    } catch (e) {
      this.log.warn('analytics enqueue failed', { err: e as Error });
    }
  }

  error(e: Parameters<Analytics['error']>[0]): void {
    try {
      this.errors.push(errorRow({ ...e, serverVersion: this.serverVersion }));
      if (this.errors.length > 1000) this.errors.splice(0, this.errors.length - 1000);
      if (this.errors.length >= 50) void this.flush();
    } catch (err) {
      this.log.warn('error enqueue failed', { err: err as Error });
    }
  }

  /** Writes buffered rows; failures are logged and the batch is dropped (never retried forever). */
  flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    const ev = this.events;
    const er = this.errors;
    if (ev.length === 0 && er.length === 0) return Promise.resolve();
    this.events = [];
    this.errors = [];
    this.flushing = (async () => {
      try {
        await insertEvents(this.sql, ev);
      } catch (e) {
        this.log.warn('analytics flush failed', { err: e as Error, dropped: ev.length });
      }
      try {
        await insertErrors(this.sql, er);
      } catch (e) {
        this.log.warn('error flush failed', { err: e as Error, dropped: er.length });
      }
    })().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  async close(): Promise<void> {
    clearInterval(this.timer);
    await this.flush();
    if (this.events.length || this.errors.length) await this.flush();
  }
}
