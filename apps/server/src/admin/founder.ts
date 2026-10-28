/**
 * v0.2.17 — the owner: «my account (the one linked to my email): 320 000 000 $BLAT, the biggest holding in
 * the game; level 87; every skin and every character; the main admin account with a gold “Founder” badge».
 *
 * The live database is reached only from the server, so this is an administrator's action on a player's
 * card (/admin → the player → «Сделать основателем»), audited. In one transaction:
 *   • the account is marked as the founder's (`users.founder`: the badge, the hidden way into /admin);
 *   • experience up to level 87 (FOUNDER_LEVEL) — the levels' $BLAT are paid as for anybody (players' pool);
 *   • every character, weapon, piece of equipment, skin and weapon modification, as a grant;
 *   • $BLAT up to 320 000 000 in total: what is missing comes out of the founder's pool (one allocation,
 *     `allocation:founder` — never twice for the same account; the pool never gives more than its cap).
 * Repeating it changes nothing that was already done. There is one founder: another account is refused.
 */
import { BLAT_FOUNDER_HOLDING, CHARACTER_IDS, FOUNDER_LEVEL, GADGET_IDS, WEAPONS, WEAPON_IDS, allSkins, levelForXp, modsFor, totalXpForLevel } from '@blatkom/shared';
import type { Sql } from '../database/db.js';
import { allocateBlat, creditLevels } from '../blat/repo.js';

export interface FounderResult {
  level: number;
  blat: number;
  /** $BLAT the founder's pool gave this time (0 when the account already had its share). */
  allocated: number;
  /** Items and modifications added this time. */
  items: number;
}

/** Another account is the founder already (there is one founder; the founder's pool is given once). */
export class FounderTaken extends Error {
  constructor(readonly holder: string) {
    super('founder_taken');
  }
}

export async function makeFounder(sql: Sql, userId: string): Promise<FounderResult | null> {
  return sql.begin(async (tx) => {
    // one founder: a second account is refused (a slip of the mouse must not spend the founder's pool)
    await tx`LOCK TABLE blat_pools IN SHARE ROW EXCLUSIVE MODE`;
    const [other] = await tx<Array<{ display_name: string }>>`SELECT display_name FROM users WHERE founder AND id <> ${userId} AND deleted_at IS NULL LIMIT 1`;
    if (other) throw new FounderTaken(other.display_name);
    const [u] = await tx<Array<{ id: string }>>`UPDATE users SET founder = true WHERE id = ${userId} AND deleted_at IS NULL RETURNING id`;
    if (!u) return null;
    await tx`INSERT INTO profiles (user_id) VALUES (${userId}) ON CONFLICT DO NOTHING`;
    const [p] = await tx<Array<{ xp: number; level: number }>>`SELECT xp, level FROM profiles WHERE user_id = ${userId} FOR UPDATE`;
    const xp = Math.max(p!.xp, totalXpForLevel(FOUNDER_LEVEL));
    const level = Math.max(p!.level, levelForXp(xp).level);
    await tx`UPDATE profiles SET xp = ${xp}, level = ${level}, updated_at = now() WHERE user_id = ${userId}`;
    await creditLevels(tx, userId, level);
    let items = 0;
    const give = async (kind: 'character' | 'weapon' | 'gadget' | 'skin', id: string) => {
      const r = await tx`INSERT INTO user_items (user_id, item_id, kind, source) VALUES (${userId}, ${id}, ${kind}, 'grant') ON CONFLICT DO NOTHING RETURNING item_id`;
      items += r.length;
    };
    for (const c of CHARACTER_IDS) await give('character', c);
    for (const w of WEAPON_IDS) await give('weapon', w);
    for (const g of GADGET_IDS) await give('gadget', g);
    for (const s of allSkins()) await give('skin', s);
    for (const w of WEAPON_IDS) {
      for (const m of modsFor(WEAPONS[w])) {
        const r = await tx`INSERT INTO weapon_mods (user_id, weapon_id, mod_id) VALUES (${userId}, ${w}, ${m}) ON CONFLICT DO NOTHING RETURNING mod_id`;
        items += r.length;
      }
    }
    const [b] = await tx<Array<{ blat: number }>>`SELECT blat FROM profiles WHERE user_id = ${userId}`;
    let blat = b?.blat ?? 0;
    let allocated = 0;
    const missing = BLAT_FOUNDER_HOLDING - blat;
    if (missing > 0) {
      const r = await allocateBlat(tx, userId, 'founder', missing, 'allocation:founder');
      if (r.ok) {
        allocated = missing;
        blat = r.balance;
      }
    }
    return { level, blat, allocated, items };
  });
}
