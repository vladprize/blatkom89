/** User records. Only the data needed to run the game is stored (see docs/PRIVACY.md). */
import type { Sql } from '../database/db.js';
import type { TelegramUser } from './telegram.js';
import { displayNameFromTelegram } from './telegram.js';

export interface UpsertResult {
  userId: string;
  isNew: boolean;
  displayName: string;
}

export class UserRepo {
  constructor(private readonly sql: Sql) {}

  async upsertTelegram(tg: TelegramUser, platform: string | null): Promise<UpsertResult> {
    const name = displayNameFromTelegram(tg);
    const rows = await this.sql<Array<{ id: string; inserted: boolean; display_name: string }>>`
      INSERT INTO users (telegram_id, display_name, language_code, platform)
      VALUES (${String(tg.id)}::bigint, ${name}, ${tg.languageCode}, ${platform})
      ON CONFLICT (telegram_id) DO UPDATE
        SET language_code = EXCLUDED.language_code,
            platform = COALESCE(EXCLUDED.platform, users.platform),
            last_seen_at = now()
      RETURNING id, (xmax = 0) AS inserted, display_name`;
    const row = rows[0]!;
    if (row.inserted) await this.sql`INSERT INTO profiles (user_id) VALUES (${row.id}) ON CONFLICT DO NOTHING`;
    return { userId: row.id, isNew: row.inserted, displayName: row.display_name };
  }

  /** Guest player of the public website, keyed by an HMAC of the browser's device secret. The name is set only on creation. */
  async findGuest(deviceKey: string): Promise<string | null> {
    const rows = await this.sql<Array<{ id: string }>>`SELECT id FROM users WHERE dev_device_id = ${deviceKey} AND deleted_at IS NULL`;
    return rows[0]?.id ?? null;
  }

  async upsertGuest(deviceKey: string, name: string, platform: string | null): Promise<UpsertResult> {
    const rows = await this.sql<Array<{ id: string; inserted: boolean; display_name: string }>>`
      INSERT INTO users (dev_device_id, display_name, platform)
      VALUES (${deviceKey}, ${name}, ${platform})
      ON CONFLICT (dev_device_id) DO UPDATE
        SET platform = COALESCE(EXCLUDED.platform, users.platform),
            last_seen_at = now()
      RETURNING id, (xmax = 0) AS inserted, display_name`;
    const row = rows[0]!;
    if (row.inserted) await this.sql`INSERT INTO profiles (user_id) VALUES (${row.id}) ON CONFLICT DO NOTHING`;
    return { userId: row.id, isNew: row.inserted, displayName: row.display_name };
  }

  async upsertDev(deviceId: string, name: string, platform: string | null): Promise<UpsertResult> {
    const rows = await this.sql<Array<{ id: string; inserted: boolean; display_name: string }>>`
      INSERT INTO users (dev_device_id, display_name, platform)
      VALUES (${deviceId}, ${name}, ${platform})
      ON CONFLICT (dev_device_id) DO UPDATE
        SET display_name = EXCLUDED.display_name,
            platform = COALESCE(EXCLUDED.platform, users.platform),
            last_seen_at = now()
      RETURNING id, (xmax = 0) AS inserted, display_name`;
    const row = rows[0]!;
    if (row.inserted) await this.sql`INSERT INTO profiles (user_id) VALUES (${row.id}) ON CONFLICT DO NOTHING`;
    return { userId: row.id, isNew: row.inserted, displayName: row.display_name };
  }
}
