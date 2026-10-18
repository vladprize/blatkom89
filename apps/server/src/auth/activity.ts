/**
 * Daily activity index used for DAU/WAU/MAU and retention (UTC calendar days).
 * One row per (user, day); repeated touches are de-duplicated in memory and by the primary key.
 */
import type { Sql } from '../database/db.js';
import type { Logger } from '../logging/logger.js';

export function utcDay(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export class ActivityTracker {
  private readonly lastDay = new Map<string, string>();

  constructor(
    private readonly sql: Sql,
    private readonly log: Logger,
  ) {}

  /** Records activity for today (UTC). Never throws. */
  async touch(userId: string, now = new Date()): Promise<void> {
    const day = utcDay(now);
    if (this.lastDay.get(userId) === day) return;
    this.lastDay.set(userId, day);
    if (this.lastDay.size > 50_000) this.lastDay.clear();
    try {
      await this.sql`INSERT INTO user_daily_activity (user_id, day, first_seen_at) VALUES (${userId}, ${day}::date, ${now}) ON CONFLICT DO NOTHING`;
    } catch (e) {
      this.lastDay.delete(userId);
      this.log.warn('activity touch failed', { err: e as Error });
    }
  }

  forget(userId: string): void {
    this.lastDay.delete(userId);
  }
}
