/**
 * Economy persistence (PostgreSQL): wallet, owned items (weapons, characters, equipment, weapon
 * skins), modifications, cases (weapons and skins), loadouts and diamond top-ups. Every balance change locks the player's profile row (SELECT … FOR UPDATE), checks the
 * rules from packages/shared/src/game-rules/economy.ts and writes a currency_ledger row in the same
 * transaction, so concurrent requests can never overspend or double-credit.
 */
import { randomInt } from 'node:crypto';
import {
  CASE_PRICE,
  CHARACTER_IDS,
  DEFAULT_LOADOUT,
  FREE_CHARACTERS,
  FREE_GADGETS,
  FREE_WEAPONS,
  GADGET_IDS,
  MOD_IDS,
  REFUSAL_TEXT,
  buyRefusal,
  drawCase,
  isCharacterId,
  isGadgetId,
  isModId,
  isWeaponId,
  modQuote,
  modsFor,
  priceOf,
  sanitizeLoadout,
  SKIN_CASE_PRICE,
  WEAPONS,
  drawSkin,
  parseSkin,
  skinId,
} from '@blatkom/shared';
import type { BuyRefusal, CaseEntry, CharacterId, Currency, GadgetId, Inventory, LedgerEntry, Loadout, ModId, ShopKind, SkinDrop, WeaponId } from '@blatkom/shared';
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

  /** Builds the inventory from the wallet row, owned items and modifications. */
  private async load(tx: Tx, userId: string, wallet: WalletRow): Promise<Inventory> {
    const items = await tx<Array<{ kind: ShopKind | 'skin'; item_id: string }>>`SELECT kind, item_id FROM user_items WHERE user_id = ${userId}`;
    const modRows = await tx<Array<{ weapon_id: string; mod_id: string }>>`SELECT weapon_id, mod_id FROM weapon_mods WHERE user_id = ${userId}`;
    const weapons = new Set<WeaponId>(FREE_WEAPONS);
    const characters = new Set<CharacterId>(FREE_CHARACTERS);
    const gadgets = new Set<GadgetId>(FREE_GADGETS);
    const skins = new Set<string>();
    for (const it of items) {
      if (it.kind === 'weapon' && isWeaponId(it.item_id)) weapons.add(it.item_id);
      if (it.kind === 'character' && isCharacterId(it.item_id)) characters.add(it.item_id);
      if (it.kind === 'gadget' && isGadgetId(it.item_id)) gadgets.add(it.item_id);
      if (it.kind === 'skin' && parseSkin(it.item_id)) skins.add(it.item_id);
    }
    const mods: Partial<Record<WeaponId, ModId[]>> = {};
    for (const r of modRows) {
      if (!isWeaponId(r.weapon_id) || !weapons.has(r.weapon_id) || !isModId(r.mod_id) || !modsFor(WEAPONS[r.weapon_id]).includes(r.mod_id)) continue;
      (mods[r.weapon_id] ??= []).push(r.mod_id);
    }
    for (const w of Object.keys(mods) as WeaponId[]) mods[w] = MOD_IDS.filter((m) => mods[w]!.includes(m));
    const raw = wallet.loadout && typeof wallet.loadout === 'object' ? (wallet.loadout as Record<string, unknown>) : {};
    const loadout = sanitizeLoadout(
      { ...DEFAULT_LOADOUT, ...raw },
      { weapon: (w) => weapons.has(w), gadget: (g) => gadgets.has(g), mod: (w, m) => mods[w]?.includes(m) ?? false, skin: (w, f) => skins.has(skinId(w, f)) },
    );
    return {
      tokens: wallet.tokens,
      diamonds: wallet.diamonds,
      level: wallet.level,
      weapons: [...weapons],
      characters: CHARACTER_IDS.filter((c) => characters.has(c)),
      gadgets: GADGET_IDS.filter((g) => gadgets.has(g)),
      mods,
      skins: [...skins].sort(),
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

  async buy(userId: string, kind: ShopKind, id: string): Promise<Inventory> {
    if (kind === 'weapon' ? !isWeaponId(id) : kind === 'character' ? !isCharacterId(id) : !isGadgetId(id)) throw new EconomyError('not_for_sale');
    return this.sql.begin(async (tx) => {
      const wallet = await this.lockWallet(tx, userId);
      const inv = await this.load(tx, userId, wallet);
      const refusal = buyRefusal(inv, kind, id);
      if (refusal) throw new EconomyError(refusal);
      const price = priceOf(kind, id)!;
      await this.debit(tx, userId, price.currency, price.amount, price.currency === 'tokens' ? wallet.tokens : wallet.diamonds, 'purchase', `${kind}:${id}`);
      await tx`INSERT INTO user_items (user_id, item_id, kind, source) VALUES (${userId}, ${id}, ${kind}, ${price.currency})`;
      this.log.info('shop purchase', { userId, kind, id, currency: price.currency, amount: price.amount });
      return this.load(tx, userId, { ...wallet, [price.currency]: (price.currency === 'tokens' ? wallet.tokens : wallet.diamonds) - price.amount });
    });
  }

  /** Buys a modification for one weapon (tokens) and equips it (replacing the one on the same mount). */
  async buyMod(userId: string, weapon: WeaponId, mod: ModId): Promise<Inventory> {
    return this.sql.begin(async (tx) => {
      const wallet = await this.lockWallet(tx, userId);
      const inv = await this.load(tx, userId, wallet);
      const q = modQuote(inv, weapon, mod);
      if (typeof q === 'string') throw new EconomyError(q);
      await this.debit(tx, userId, 'tokens', q.cost, wallet.tokens, 'mod', `${weapon}:${mod}`);
      await tx`INSERT INTO weapon_mods (user_id, weapon_id, mod_id) VALUES (${userId}, ${weapon}, ${mod}) ON CONFLICT DO NOTHING`;
      // equip right away: the new one takes its mount on this weapon
      const l = inv.loadout;
      const equipped = [mod, ...(l.mods[weapon] ?? [])];
      const stored = { sidearm: l.sidearm, melee: l.melee, primary: l.primary, gadget: l.gadget, mods: { ...l.mods, [weapon]: equipped }, skins: l.skins ?? {} };
      await tx`UPDATE profiles SET loadout = ${tx.json(stored)}, updated_at = now() WHERE user_id = ${userId}`;
      this.log.info('mod purchase', { userId, weapon, mod, cost: q.cost });
      return this.load(tx, userId, { ...wallet, tokens: wallet.tokens - q.cost, loadout: stored });
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
        INSERT INTO case_openings (user_id, kind, weapon_id, rarity, price) VALUES (${userId}, 'weapon', ${entry.weapon}, ${entry.rarity}, ${CASE_PRICE}) RETURNING id`;
      await this.debit(tx, userId, 'diamonds', CASE_PRICE, wallet.diamonds, 'case', `case:${opening!.id}`);
      await tx`INSERT INTO user_items (user_id, item_id, kind, source) VALUES (${userId}, ${entry.weapon}, 'weapon', 'case') ON CONFLICT DO NOTHING`;
      this.log.info('case opened', { userId, weapon: entry.weapon, rarity: entry.rarity });
      return { entry, inventory: await this.load(tx, userId, { ...wallet, diamonds: wallet.diamonds - CASE_PRICE }) };
    });
  }

  /**
   * Opens the skin case: a skin the player does not own yet (never a duplicate). When the weapon wears
   * no skin yet, the new one goes on at once.
   */
  async openSkinCase(userId: string, rand: () => number = secureRandom): Promise<{ drop: SkinDrop; equipped: boolean; inventory: Inventory }> {
    return this.sql.begin(async (tx) => {
      const wallet = await this.lockWallet(tx, userId);
      const inv = await this.load(tx, userId, wallet);
      const drop = drawSkin(new Set(inv.skins), rand);
      if (!drop) throw new EconomyError('collection_complete');
      if (wallet.diamonds < SKIN_CASE_PRICE) throw new EconomyError('funds');
      const [opening] = await tx<Array<{ id: string }>>`
        INSERT INTO case_openings (user_id, kind, weapon_id, finish_id, rarity, price)
        VALUES (${userId}, 'skin', ${drop.weapon}, ${drop.finish}, ${drop.rarity}, ${SKIN_CASE_PRICE}) RETURNING id`;
      await this.debit(tx, userId, 'diamonds', SKIN_CASE_PRICE, wallet.diamonds, 'case', `skincase:${opening!.id}`);
      await tx`INSERT INTO user_items (user_id, item_id, kind, source) VALUES (${userId}, ${skinId(drop.weapon, drop.finish)}, 'skin', 'case') ON CONFLICT DO NOTHING`;
      const l = inv.loadout;
      const equipped = !l.skins?.[drop.weapon];
      let loadout: unknown = wallet.loadout;
      if (equipped) {
        loadout = { sidearm: l.sidearm, melee: l.melee, primary: l.primary, gadget: l.gadget, mods: l.mods, skins: { ...(l.skins ?? {}), [drop.weapon]: drop.finish } };
        await tx`UPDATE profiles SET loadout = ${tx.json(loadout as postgres.JSONValue)}, updated_at = now() WHERE user_id = ${userId}`;
      }
      this.log.info('skin case opened', { userId, weapon: drop.weapon, finish: drop.finish, rarity: drop.rarity });
      return { drop, equipped, inventory: await this.load(tx, userId, { ...wallet, diamonds: wallet.diamonds - SKIN_CASE_PRICE, loadout }) };
    });
  }

  /**
   * Stores the spawn loadout. Anything the player does not own falls back to the free default;
   * `gadget`/`mods` left out keep their current values.
   */
  async setLoadout(userId: string, raw: Pick<Loadout, 'sidearm' | 'melee' | 'primary'> & Partial<Pick<Loadout, 'gadget' | 'mods' | 'skins'>>): Promise<Inventory> {
    return this.sql.begin(async (tx) => {
      const wallet = await this.lockWallet(tx, userId);
      const inv = await this.load(tx, userId, wallet);
      const owned = new Set(inv.weapons);
      const ownedSkins = new Set(inv.skins);
      const l = sanitizeLoadout(
        { ...raw, gadget: raw.gadget === undefined ? inv.loadout.gadget : raw.gadget, mods: raw.mods ?? inv.loadout.mods, skins: raw.skins ?? inv.loadout.skins },
        { weapon: (w) => owned.has(w), gadget: (g) => inv.gadgets.includes(g), mod: (w, m) => inv.mods[w]?.includes(m) ?? false, skin: (w, f) => ownedSkins.has(skinId(w, f)) },
      );
      const stored = { sidearm: l.sidearm, melee: l.melee, primary: l.primary, gadget: l.gadget, mods: l.mods, skins: l.skins ?? {} };
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
  async grantItem(userId: string, kind: ShopKind | 'skin', id: string): Promise<void> {
    const valid = kind === 'weapon' ? isWeaponId(id) : kind === 'character' ? isCharacterId(id) : kind === 'gadget' ? isGadgetId(id) : parseSkin(id) !== null;
    if (!valid) throw new EconomyError('not_for_sale');
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
