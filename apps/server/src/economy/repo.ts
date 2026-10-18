/**
 * Economy persistence (PostgreSQL): wallet, owned items, upgrades, cases, loadouts and diamond
 * top-ups. Every balance change locks the player's profile row (SELECT … FOR UPDATE), checks the
 * rules from packages/shared/src/game-rules/economy.ts and writes a currency_ledger row in the same
 * transaction, so concurrent requests can never overspend or double-credit.
 */
import { randomInt } from 'node:crypto';
import {
  CASE_PRICE,
  CHARACTER_IDS,
  DEFAULT_LOADOUT,
  FREE_CHARACTERS,
  FREE_WEAPONS,
  REFUSAL_TEXT,
  UPGRADE_STATS,
  buyRefusal,
  drawCase,
  isCharacterId,
  isWeaponId,
  priceOf,
  sanitizeLoadout,
  upgradeQuote,
} from '@blatkom/shared';
import type { BuyRefusal, CaseEntry, CharacterId, Currency, Inventory, LedgerEntry, Loadout, UpgradeStat, WeaponId, WeaponMods } from '@blatkom/shared';
import type postgres from 'postgres';
import type { Sql } from '../database/db.js';
import type { Logger } from '../logging/logger.js';
import type { Economy, PlayerGear } from '../services/contracts.js';

type Tx = postgres.TransactionSql<Record<string, unknown>> | Sql;

export class EconomyError extends Error {
  constructor(readonly refusal: BuyRefusal) {
    super(REFUSAL_TEXT[refusal]);
  }
}

interface WalletRow {
  tokens: number;
  diamonds: number;
  level: number;
  loadout: unknown;
}

/** Uniform float in [0, 1) from the OS CSPRNG (case draws). */
function secureRandom(): number {
  return randomInt(0, 2 ** 32) / 2 ** 32;
}

export class EconomyRepo implements Economy {
  constructor(
    private readonly sql: Sql,
    private readonly log: Logger,
  ) {}

  /** Builds the inventory from the wallet row, owned items and upgrades. */
  private async load(tx: Tx, userId: string, wallet: WalletRow): Promise<Inventory> {
    const items = await tx<Array<{ kind: 'weapon' | 'character'; item_id: string }>>`SELECT kind, item_id FROM user_items WHERE user_id = ${userId}`;
    const ups = await tx<Array<{ weapon_id: string; stat: UpgradeStat; level: number }>>`SELECT weapon_id, stat, level FROM weapon_upgrades WHERE user_id = ${userId}`;
    const weapons = new Set<WeaponId>(FREE_WEAPONS);
    const characters = new Set<CharacterId>(FREE_CHARACTERS);
    for (const it of items) {
      if (it.kind === 'weapon' && isWeaponId(it.item_id)) weapons.add(it.item_id);
      if (it.kind === 'character' && isCharacterId(it.item_id)) characters.add(it.item_id);
    }
    const upgrades: Partial<Record<WeaponId, WeaponMods>> = {};
    for (const u of ups) {
      if (!isWeaponId(u.weapon_id) || !weapons.has(u.weapon_id) || !(UPGRADE_STATS as readonly string[]).includes(u.stat)) continue;
      (upgrades[u.weapon_id] ??= {})[u.stat] = u.level;
    }
    const raw = wallet.loadout && typeof wallet.loadout === 'object' ? (wallet.loadout as Record<string, unknown>) : {};
    const loadout = sanitizeLoadout({ ...DEFAULT_LOADOUT, ...raw, mods: upgrades }, (w) => weapons.has(w));
    return {
      tokens: wallet.tokens,
      diamonds: wallet.diamonds,
      level: wallet.level,
      weapons: [...weapons],
      characters: CHARACTER_IDS.filter((c) => characters.has(c)),
      upgrades,
      loadout,
    };
  }

  private async lockWallet(tx: Tx, userId: string): Promise<WalletRow> {
    await tx`INSERT INTO profiles (user_id) VALUES (${userId}) ON CONFLICT DO NOTHING`;
    const rows = await tx<WalletRow[]>`SELECT tokens, diamonds, level, loadout FROM profiles WHERE user_id = ${userId} FOR UPDATE`;
    return rows[0]!;
  }

  private async debit(tx: Tx, userId: string, currency: Currency, amount: number, balanceBefore: number, reason: LedgerEntry['reason'], ref: string): Promise<void> {
    const after = balanceBefore - amount;
    if (after < 0) throw new EconomyError('funds');
    if (currency === 'tokens') await tx`UPDATE profiles SET tokens = ${after}, updated_at = now() WHERE user_id = ${userId}`;
    else await tx`UPDATE profiles SET diamonds = ${after}, updated_at = now() WHERE user_id = ${userId}`;
    await tx`INSERT INTO currency_ledger (user_id, currency, delta, balance_after, reason, ref) VALUES (${userId}, ${currency}, ${-amount}, ${after}, ${reason}, ${ref})`;
  }

  async inventory(userId: string): Promise<Inventory> {
    await this.sql`INSERT INTO profiles (user_id) VALUES (${userId}) ON CONFLICT DO NOTHING`;
    const rows = await this.sql<WalletRow[]>`SELECT tokens, diamonds, level, loadout FROM profiles WHERE user_id = ${userId}`;
    return this.load(this.sql, userId, rows[0]!);
  }

  /** Loadout and owned characters of a player joining a room. */
  async gear(userId: string): Promise<PlayerGear> {
    const inv = await this.inventory(userId);
    return { loadout: inv.loadout, characters: new Set(inv.characters) };
  }

  async buy(userId: string, kind: 'weapon' | 'character', id: string): Promise<Inventory> {
    if (kind === 'weapon' ? !isWeaponId(id) : !isCharacterId(id)) throw new EconomyError('not_for_sale');
    return this.sql.begin(async (tx) => {
      const wallet = await this.lockWallet(tx, userId);
      const inv = await this.load(tx, userId, wallet);
      const refusal = buyRefusal(inv, kind, id as WeaponId | CharacterId);
      if (refusal) throw new EconomyError(refusal);
      const price = priceOf(kind, id)!;
      await this.debit(tx, userId, price.currency, price.amount, price.currency === 'tokens' ? wallet.tokens : wallet.diamonds, 'purchase', `${kind}:${id}`);
      await tx`INSERT INTO user_items (user_id, item_id, kind, source) VALUES (${userId}, ${id}, ${kind}, ${price.currency})`;
      this.log.info('shop purchase', { userId, kind, id, currency: price.currency, amount: price.amount });
      return this.load(tx, userId, { ...wallet, [price.currency]: (price.currency === 'tokens' ? wallet.tokens : wallet.diamonds) - price.amount });
    });
  }

  async upgrade(userId: string, weapon: WeaponId, stat: UpgradeStat): Promise<Inventory> {
    return this.sql.begin(async (tx) => {
      const wallet = await this.lockWallet(tx, userId);
      const inv = await this.load(tx, userId, wallet);
      const q = upgradeQuote(inv, weapon, stat);
      if (typeof q === 'string') throw new EconomyError(q);
      await this.debit(tx, userId, 'tokens', q.cost, wallet.tokens, 'upgrade', `${weapon}:${stat}:${q.level}`);
      await tx`
        INSERT INTO weapon_upgrades (user_id, weapon_id, stat, level) VALUES (${userId}, ${weapon}, ${stat}, ${q.level})
        ON CONFLICT (user_id, weapon_id, stat) DO UPDATE SET level = EXCLUDED.level, updated_at = now()`;
      return this.load(tx, userId, { ...wallet, tokens: wallet.tokens - q.cost });
    });
  }

  /** Opens a case: a rare weapon the player does not own yet (never a duplicate). */
  async openCase(userId: string, rand: () => number = secureRandom): Promise<{ entry: CaseEntry; inventory: Inventory }> {
    return this.sql.begin(async (tx) => {
      const wallet = await this.lockWallet(tx, userId);
      const inv = await this.load(tx, userId, wallet);
      const entry = drawCase(new Set(inv.weapons), rand());
      if (!entry) throw new EconomyError('collection_complete');
      if (wallet.diamonds < CASE_PRICE) throw new EconomyError('funds');
      const [opening] = await tx<Array<{ id: string }>>`
        INSERT INTO case_openings (user_id, weapon_id, rarity, price) VALUES (${userId}, ${entry.weapon}, ${entry.rarity}, ${CASE_PRICE}) RETURNING id`;
      await this.debit(tx, userId, 'diamonds', CASE_PRICE, wallet.diamonds, 'case', `case:${opening!.id}`);
      await tx`INSERT INTO user_items (user_id, item_id, kind, source) VALUES (${userId}, ${entry.weapon}, 'weapon', 'case') ON CONFLICT DO NOTHING`;
      this.log.info('case opened', { userId, weapon: entry.weapon, rarity: entry.rarity });
      return { entry, inventory: await this.load(tx, userId, { ...wallet, diamonds: wallet.diamonds - CASE_PRICE }) };
    });
  }

  /** Stores the spawn loadout (weapons the player does not own fall back to the free defaults). */
  async setLoadout(userId: string, raw: Pick<Loadout, 'sidearm' | 'melee' | 'primary'>): Promise<Inventory> {
    return this.sql.begin(async (tx) => {
      const wallet = await this.lockWallet(tx, userId);
      const inv = await this.load(tx, userId, wallet);
      const owned = new Set(inv.weapons);
      const l = sanitizeLoadout({ ...raw, mods: {} }, (w) => owned.has(w));
      const stored = { sidearm: l.sidearm, melee: l.melee, primary: l.primary };
      await tx`UPDATE profiles SET loadout = ${tx.json(stored)}, updated_at = now() WHERE user_id = ${userId}`;
      return this.load(tx, userId, { ...wallet, loadout: stored });
    });
  }

  /** Administrator grant (or correction with a negative amount); returns the new balance. */
  async grant(userId: string, currency: Currency, amount: number, adminId: string | null, note: string): Promise<number> {
    if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 1_000_000) throw new Error('bad amount');
    return this.sql.begin(async (tx) => {
      const wallet = await this.lockWallet(tx, userId);
      const before = currency === 'tokens' ? wallet.tokens : wallet.diamonds;
      const after = before + amount;
      if (after < 0) throw new EconomyError('funds');
      if (currency === 'tokens') await tx`UPDATE profiles SET tokens = ${after}, updated_at = now() WHERE user_id = ${userId}`;
      else await tx`UPDATE profiles SET diamonds = ${after}, updated_at = now() WHERE user_id = ${userId}`;
      await tx`INSERT INTO currency_ledger (user_id, currency, delta, balance_after, reason, ref, admin_id) VALUES (${userId}, ${currency}, ${amount}, ${after}, 'grant', ${note.slice(0, 120) || null}, ${adminId})`;
      return after;
    });
  }

  /** Grants an item without payment (administrator). */
  async grantItem(userId: string, kind: 'weapon' | 'character', id: string): Promise<void> {
    if (kind === 'weapon' ? !isWeaponId(id) : !isCharacterId(id)) throw new EconomyError('not_for_sale');
    await this.sql`INSERT INTO profiles (user_id) VALUES (${userId}) ON CONFLICT DO NOTHING`;
    await this.sql`INSERT INTO user_items (user_id, item_id, kind, source) VALUES (${userId}, ${id}, ${kind}, 'grant') ON CONFLICT DO NOTHING`;
  }

  async ledger(userId: string, limit = 50): Promise<LedgerEntry[]> {
    const rows = await this.sql<Array<{ created_at: Date; currency: Currency; delta: number; balance_after: number; reason: LedgerEntry['reason']; ref: string | null }>>`
      SELECT created_at, currency, delta, balance_after, reason, ref FROM currency_ledger WHERE user_id = ${userId} ORDER BY id DESC LIMIT ${limit}`;
    return rows.map((r) => ({ at: r.created_at.toISOString(), currency: r.currency, delta: r.delta, balanceAfter: r.balance_after, reason: r.reason, ref: r.ref }));
  }
}

/** Credits match tokens inside the match-results transaction (called once per match and player). */
export async function awardMatchTokens(tx: Tx, userId: string, matchId: string, tokens: number): Promise<number> {
  const rows = await tx<Array<{ tokens: number }>>`UPDATE profiles SET tokens = tokens + ${tokens} WHERE user_id = ${userId} RETURNING tokens`;
  const total = rows[0]?.tokens ?? 0;
  if (tokens > 0) await tx`INSERT INTO currency_ledger (user_id, currency, delta, balance_after, reason, ref) VALUES (${userId}, 'tokens', ${tokens}, ${total}, 'match', ${matchId})`;
  return total;
}
