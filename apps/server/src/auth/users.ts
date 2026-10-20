/** User records. Only the data needed to run the game is stored (see docs/PRIVACY.md). */
import type { Sql } from '../database/db.js';
import type { TelegramUser } from './telegram.js';
import { displayNameFromTelegram } from './telegram.js';
import { nameKey } from '@blatkom/shared';
import { freeName, isNameConflict } from './names.js';

export interface UpsertResult {
  userId: string;
  isNew: boolean;
  displayName: string;
}

type Row = { id: string; inserted: boolean; display_name: string };

export class UserRepo {
  constructor(private readonly sql: Sql) {}

  /**
   * Creates the account (with the first free variant of `name`: aliases are unique) or touches the
   * existing one, whose alias never changes here. A concurrent sign-up taking the same alias between
   * the check and the insert only costs a retry.
   */
  private async upsert(name: string, insert: (name: string) => Promise<Row[]>): Promise<UpsertResult> {
    for (let attempt = 0; ; attempt++) {
      const candidate = await freeName(this.sql, name);
      try {
        const row = (await insert(candidate))[0]!;
        if (row.inserted) await this.sql`INSERT INTO profiles (user_id) VALUES (${row.id}) ON CONFLICT DO NOTHING`;
        return { userId: row.id, isNew: row.inserted, displayName: row.display_name };
      } catch (e) {
        if (!isNameConflict(e) || attempt >= 4) throw e;
      }
    }
  }

  async upsertTelegram(tg: TelegramUser, platform: string | null): Promise<UpsertResult> {
    return this.upsert(
      displayNameFromTelegram(tg),
      (name) => this.sql<Row[]>`
        INSERT INTO users (telegram_id, display_name, name_key, language_code, platform)
        VALUES (${String(tg.id)}::bigint, ${name}, ${nameKey(name)}, ${tg.languageCode}, ${platform})
        ON CONFLICT (telegram_id) DO UPDATE
          SET language_code = EXCLUDED.language_code,
              platform = COALESCE(EXCLUDED.platform, users.platform),
              last_seen_at = now()
        RETURNING id, (xmax = 0) AS inserted, display_name`,
    );
  }

  /** Guest player of the public website, keyed by an HMAC of the browser's device secret. The name is set only on creation. */
  async findGuest(deviceKey: string): Promise<string | null> {
    const rows = await this.sql<Array<{ id: string }>>`SELECT id FROM users WHERE dev_device_id = ${deviceKey} AND deleted_at IS NULL`;
    return rows[0]?.id ?? null;
  }

  async upsertGuest(deviceKey: string, name: string, platform: string | null): Promise<UpsertResult> {
    return this.upsert(
      name,
      (n) => this.sql<Row[]>`
        INSERT INTO users (dev_device_id, display_name, name_key, platform)
        VALUES (${deviceKey}, ${n}, ${nameKey(n)}, ${platform})
        ON CONFLICT (dev_device_id) DO UPDATE
          SET platform = COALESCE(EXCLUDED.platform, users.platform),
              last_seen_at = now()
        RETURNING id, (xmax = 0) AS inserted, display_name`,
    );
  }

  /** Developer sign-in (tests, local play): like a guest; a taken name gets a number. */
  async upsertDev(deviceId: string, name: string, platform: string | null): Promise<UpsertResult> {
    return this.upsert(
      name,
      (n) => this.sql<Row[]>`
        INSERT INTO users (dev_device_id, display_name, name_key, platform)
        VALUES (${deviceId}, ${n}, ${nameKey(n)}, ${platform})
        ON CONFLICT (dev_device_id) DO UPDATE
          SET platform = COALESCE(EXCLUDED.platform, users.platform),
              last_seen_at = now()
        RETURNING id, (xmax = 0) AS inserted, display_name`,
    );
  }
}
