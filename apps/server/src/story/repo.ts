/**
 * Story progress (v0.3 part 4). A mission reported done is stored once per player (later runs only
 * improve the best time); the first completion pays the mission's talons and experience, and the mission
 * that finishes a chapter unlocks the chapter's achievement, which pays the chapter's talons, characters
 * and skins — once (the achievement row and a unique ledger reference guard it, also under retries and
 * concurrent requests). A character or skin the player already owns is paid in talons instead.
 */
import { ACHIEVEMENTS, ACHIEVEMENT_TARGETS, CHARACTER_PRICES, STORY_OWNED_SKIN_TALONS, isChapterDone, levelForXp, storyChapter } from '@blatkom/shared';
import type { AchievementId, CharacterId, SkinId, StoryDone, StoryMission, StoryReward } from '@blatkom/shared';
import type postgres from 'postgres';
import type { Sql } from '../database/db.js';

type Tx = postgres.TransactionSql<Record<string, unknown>>;

export class StoryError extends Error {
  constructor(readonly code: 'no_profile') {
    super(code);
  }
}

const LEVEL_ACHIEVEMENTS: ReadonlyArray<[AchievementId, number]> = [
  ['level_10', ACHIEVEMENT_TARGETS.levels[0]!],
  ['level_25', ACHIEVEMENT_TARGETS.levels[1]!],
];

export class StoryRepo {
  constructor(private readonly sql: Sql) {}

  async done(userId: string, q: Sql | Tx = this.sql): Promise<StoryDone[]> {
    const rows = await q<Array<{ mission_id: string; completed_at: Date; best_ms: number; completions: number }>>`
      SELECT mission_id, completed_at, best_ms, completions FROM story_progress WHERE user_id = ${userId} ORDER BY completed_at, mission_id`;
    return rows.map((r) => ({ id: r.mission_id, at: r.completed_at.toISOString(), bestMs: r.best_ms, completions: r.completions }));
  }

  async doneIds(userId: string): Promise<Set<string>> {
    return new Set((await this.done(userId)).map((d) => d.id));
  }

  /** Records a finished mission and pays what it pays (see the file comment). */
  async complete(userId: string, m: StoryMission, ms: number): Promise<StoryReward> {
    return this.sql.begin(async (tx) => {
      // one completion of a player at a time: the profile row is the lock
      const [prof] = await tx<Array<{ xp: number; level: number; tokens: number }>>`SELECT xp, level, tokens FROM profiles WHERE user_id = ${userId} FOR UPDATE`;
      if (!prof) throw new StoryError('no_profile');
      const [row] = await tx<Array<{ completions: number }>>`
        INSERT INTO story_progress (user_id, mission_id, best_ms) VALUES (${userId}, ${m.id}, ${ms})
        ON CONFLICT (user_id, mission_id) DO UPDATE SET best_ms = LEAST(story_progress.best_ms, EXCLUDED.best_ms), completions = story_progress.completions + 1
        RETURNING completions`;
      const first = row!.completions === 1;
      const out: StoryReward = { mission: m.id, first, talons: 0, xp: 0, achievement: null, characters: [], skins: [], compensated: [], tokens: prof.tokens, xpTotal: prof.xp, level: prof.level, done: [] };
      if (first) {
        let tokens = prof.tokens;
        const pay = async (amount: number, ref: string) => {
          if (amount <= 0) return;
          const paid = await tx`INSERT INTO currency_ledger (user_id, currency, delta, balance_after, reason, ref) VALUES (${userId}, 'tokens', ${amount}, ${tokens + amount}, 'story', ${ref}) ON CONFLICT DO NOTHING RETURNING id`;
          if (paid.length === 0) return;
          tokens += amount;
          out.talons += amount;
        };
        await pay(m.talons, `story:${m.id}`);
        out.xp += m.xp;
        const ids = new Set((await tx<Array<{ mission_id: string }>>`SELECT mission_id FROM story_progress WHERE user_id = ${userId}`).map((r) => r.mission_id));
        const ch = storyChapter(m.campaign, m.chapter);
        if (ch?.achievement && isChapterDone(m.campaign, m.chapter, ids)) {
          const got = await tx`INSERT INTO player_achievements (user_id, achievement_id) VALUES (${userId}, ${ch.achievement}) ON CONFLICT DO NOTHING RETURNING achievement_id`;
          if (got.length > 0) {
            out.achievement = ch.achievement;
            out.xp += ACHIEVEMENTS[ch.achievement].xpReward;
            await pay(ch.talons, `story:${ch.achievement}`);
            for (const c of ch.characters) await this.give(tx, userId, 'character', c, out, (t, ref) => pay(t, ref));
            for (const s of ch.skins) await this.give(tx, userId, 'skin', s, out, (t, ref) => pay(t, ref));
          }
        }
        // experience (and the level achievements it may reach)
        let xpTotal = prof.xp + out.xp;
        const owned = new Set((await tx<Array<{ achievement_id: AchievementId }>>`SELECT achievement_id FROM player_achievements WHERE user_id = ${userId}`).map((r) => r.achievement_id));
        for (const [id, lvl] of LEVEL_ACHIEVEMENTS) {
          if (!owned.has(id) && levelForXp(xpTotal).level >= lvl) {
            await tx`INSERT INTO player_achievements (user_id, achievement_id) VALUES (${userId}, ${id}) ON CONFLICT DO NOTHING`;
            xpTotal += ACHIEVEMENTS[id].xpReward;
            out.xp += ACHIEVEMENTS[id].xpReward;
          }
        }
        const level = levelForXp(xpTotal).level;
        await tx`UPDATE profiles SET xp = ${xpTotal}, level = ${level}, tokens = ${tokens}, updated_at = now() WHERE user_id = ${userId}`;
        out.tokens = tokens;
        out.xpTotal = xpTotal;
        out.level = level;
      }
      out.done = await this.done(userId, tx);
      return out;
    });
  }

  /** A story character or skin: into the inventory, or its worth in talons when it is already there. */
  private async give(tx: Tx, userId: string, kind: 'character' | 'skin', id: CharacterId | SkinId, out: StoryReward, pay: (talons: number, ref: string) => Promise<void>) {
    const got = await tx`INSERT INTO user_items (user_id, item_id, kind, source) VALUES (${userId}, ${id}, ${kind}, 'story') ON CONFLICT DO NOTHING RETURNING item_id`;
    if (got.length > 0) {
      if (kind === 'character') out.characters.push(id as CharacterId);
      else out.skins.push(id as SkinId);
      return;
    }
    const worth = kind === 'character' ? (CHARACTER_PRICES[id as CharacterId]?.amount ?? 0) : STORY_OWNED_SKIN_TALONS;
    const before = out.talons;
    await pay(worth, `story:own:${kind}:${id}`);
    if (out.talons > before) out.compensated.push({ kind, id, talons: out.talons - before });
  }
}
