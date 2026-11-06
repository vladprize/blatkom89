import { readFileSync } from 'node:fs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { CASE_CHARACTERS, CASE_PRICE, CASE_TABLE, CHARACTERS, CHARACTER_CASE_PRICE, CHARACTER_IDS, CHARACTER_PRICES, DEFAULT_LOADOUT, DIAMOND_PACKS, FINISHES, FREE_CHARACTERS, FREE_GADGETS, FREE_WEAPONS, GADGET_PRICES, MOD_PRICES, PROTOCOL_VERSION, REAL_MONEY, SHOP_FINISHES, SKINNABLE_WEAPONS, SKIN_CASE_PRICE, SKIN_PRICES, WEAPON_PRICES, parseSkin, skinId, tokensForMatch, welcomeSkins } from '@blatkom/shared';
import { WebSocket } from 'ws';
import { startTestApp, api, devLogin, TEST_BOT_TOKEN } from '../admin/testkit.js';
import { signInitData } from '../auth/telegram.js';
import type { TestApp } from '../admin/testkit.js';
import { pgContext } from '../services/persistence.js';
import { silentLogger } from '../logging/logger.js';
import { StripeProvider } from '../payments/providers.js';
import type { FetchLike } from '../payments/providers.js';
import { PaymentService } from '../payments/service.js';
import { MemoryAnalytics } from '../services/memory.js';

let app: TestApp;
before(async () => {
  app = await startTestApp();
});
after(async () => {
  await app.close();
});

const ctx = () => pgContext(app.db.sql, app.env, silentLogger);
/** A signed-in player made directly (this file signs in more players than the login rate limit allows). */
const quickUser = async (name: string) => {
  const p = ctx();
  const up = await p.users.upsertDev(`dev-quick-${randomBytes(6).toString('hex')}`, name, null);
  const s = await p.sessions.issue(up.userId, 'dev', null, null);
  return { userId: up.userId, token: s.token };
};
const setLevel = (userId: string, level: number) => app.db.sql`UPDATE profiles SET level = ${level} WHERE user_id = ${userId}`;

test('economy: a new player owns the free weapons and characters and spawns with the default loadout', async () => {
  const a = await devLogin(app.base, 'Новичок');
  const r = await api(app.base, '/api/me/inventory', { token: a.token });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.tokens, 0);
  assert.equal(r.body.diamonds, 0);
  assert.deepEqual([...r.body.weapons].sort(), [...FREE_WEAPONS].sort());
  assert.deepEqual([...r.body.characters].sort(), [...FREE_CHARACTERS].sort());
  assert.deepEqual([...r.body.gadgets].sort(), [...FREE_GADGETS].sort());
  assert.deepEqual(r.body.mods, {});
  assert.deepEqual({ ...r.body.loadout, mods: {} }, { ...DEFAULT_LOADOUT, mods: {} });
  assert.equal(r.body.loadout.gadget, 'f1', 'the free grenade is equipped by default');
  const me = await api(app.base, '/api/me', { token: a.token });
  assert.equal(me.body.tokens, 0);
  assert.equal(me.body.email, null);
});

test('economy: tokens are awarded once per finished match, with a ledger entry', async () => {
  const a = await devLogin(app.base, 'Игрок А');
  const b = await devLogin(app.base, 'Игрок Б');
  const matchId = '7b0f7c4e-1b6a-4f0e-9a51-2c1d00000001';
  const started = new Date(Date.now() - 200_000);
  const completion = {
    matchId,
    roomId: 'R1',
    mapId: 'factory' as const,
    mode: 'ffa' as const,
    winnerTeam: null,
    isPrivate: false,
    startedAt: started,
    endedAt: new Date(),
    durationMs: 200_000,
    endReason: 'time' as const,
    playersAtEnd: 2,
    participants: [
      { userId: a.userId, character: 'petya' as const, place: 1, kills: 5, assists: 2, deaths: 1, score: 12, damageDealt: 500, completed: true, viaInvite: false, team: null, playtimeMs: 200_000 },
      { userId: b.userId, character: 'valuta' as const, place: 2, kills: 1, assists: 0, deaths: 5, score: 2, damageDealt: 150, completed: true, viaInvite: false, team: null, playtimeMs: 200_000 },
    ],
  };
  const r1 = await ctx().recorder.matchCompleted(completion);
  const expectA = tokensForMatch({ kills: 5, assists: 2, deaths: 1, place: 1, playersAtEnd: 2, completed: true, withFriends: false });
  assert.equal(r1.get(a.userId)!.tokensGained, expectA);
  assert.equal(r1.get(a.userId)!.totalTokens, expectA);
  // a duplicate completion (retry) awards nothing new and reports the stored values
  const r2 = await ctx().recorder.matchCompleted(completion);
  assert.equal(r2.get(a.userId)!.tokensGained, expectA);
  assert.equal(r2.get(a.userId)!.totalTokens, expectA);
  const inv = await ctx().economy.inventory(a.userId);
  assert.equal(inv.tokens, expectA);
  const led = await api(app.base, '/api/me/ledger', { token: a.token });
  assert.equal(led.body.entries.filter((e: { reason: string }) => e.reason === 'match').length, 1);
});

test('economy: buying weapons checks funds, level and ownership; prices come from the server', async () => {
  const a = await devLogin(app.base, 'Покупатель');
  const buy = (kind: string, id: string) => api(app.base, '/api/shop/buy', { method: 'POST', token: a.token, body: { kind, id } });
  let r = await buy('weapon', 'uzi');
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, 'funds');
  await ctx().economy.grant(a.userId, 'tokens', 1000, null, 'test');
  r = await buy('weapon', 'uzi');
  assert.equal(r.status, 200, r.text);
  assert.ok(r.body.weapons.includes('uzi'));
  assert.equal(r.body.tokens, 1000 - WEAPON_PRICES.uzi!.amount);
  r = await buy('weapon', 'uzi');
  assert.equal(r.body.error.code, 'owned');
  r = await buy('weapon', 'ksyuha');
  assert.equal(r.body.error.code, 'level', 'АКС-74У needs level 7');
  await setLevel(a.userId, 7);
  r = await buy('weapon', 'ksyuha');
  assert.equal(r.status, 200, r.text);
  r = await buy('weapon', 'svd');
  assert.equal(r.body.error.code, 'level', 'the SVD (sold for diamonds until v0.24) needs level 15');
  r = await buy('weapon', 'zolotoy');
  assert.equal(r.body.error.code, 'not_for_sale', 'case weapons are not sold directly');
  r = await buy('weapon', 'laser');
  assert.equal(r.body.error.code, 'not_for_sale');
  const led = await ctx().economy.ledger(a.userId);
  assert.equal(led.filter((e) => e.reason === 'purchase').length, 2);
});

test('economy v0.2.18: characters — three for level + talons, the rest for BLATS by grade; only owned characters can be preferred', async () => {
  const a = await devLogin(app.base, 'Коллекционер');
  const r0 = await api(app.base, '/api/me', { method: 'PATCH', token: a.token, body: { preferredCharacter: 'vorona' } });
  assert.equal(r0.status, 409);
  const leopard = CHARACTER_PRICES.leopard!;
  assert.deepEqual(leopard, { currency: 'diamonds', amount: 399, level: 1 }, 'a rare character: 399 BLATS, no level');
  await ctx().economy.grant(a.userId, 'tokens', CHARACTER_PRICES.vorona!.amount + 7, null, 'test');
  let r = await api(app.base, '/api/shop/buy', { method: 'POST', token: a.token, body: { kind: 'character', id: 'vorona' } });
  assert.equal(r.body.error.code, 'level');
  await setLevel(a.userId, CHARACTER_PRICES.vorona!.level);
  r = await api(app.base, '/api/shop/buy', { method: 'POST', token: a.token, body: { kind: 'character', id: 'vorona' } });
  assert.equal(r.status, 200, r.text);
  // talons don't buy a BLATS character
  await ctx().economy.grant(a.userId, 'tokens', 5000, null, 'test');
  r = await api(app.base, '/api/shop/buy', { method: 'POST', token: a.token, body: { kind: 'character', id: 'leopard' } });
  assert.equal(r.body.error.code, 'funds', 'BLATS, not talons');
  await ctx().economy.grant(a.userId, 'diamonds', leopard.amount + 5, null, 'test');
  r = await api(app.base, '/api/shop/buy', { method: 'POST', token: a.token, body: { kind: 'character', id: 'leopard' } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.tokens, 5007, 'the talons are untouched');
  assert.equal(r.body.diamonds, 5);
  const [row] = await app.db.sql<Array<{ source: string }>>`SELECT source FROM user_items WHERE user_id = ${a.userId} AND item_id = 'leopard'`;
  assert.equal(row?.source, 'diamonds');
  assert.ok(r.body.characters.includes('vorona') && r.body.characters.includes('leopard'));
  const p = await api(app.base, '/api/me', { method: 'PATCH', token: a.token, body: { preferredCharacter: 'leopard' } });
  assert.equal(p.status, 200);
  assert.equal(p.body.preferredCharacter, 'leopard');
  const gear = await ctx().economy.gear(a.userId);
  assert.ok(gear.characters.has('leopard'));
});

test('economy: modifications cost tokens per weapon, fit only where they make sense and equip by mount', async () => {
  const a = await devLogin(app.base, 'Оружейник');
  await ctx().economy.grant(a.userId, 'tokens', 5000, null, 'test');
  const mod = (weapon: string, m: string) => api(app.base, '/api/shop/mod', { method: 'POST', token: a.token, body: { weapon, mod: m } });
  let r = await mod('avtomat', 'silencer');
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.body.mods.avtomat, ['silencer']);
  assert.deepEqual(r.body.loadout.mods.avtomat, ['silencer'], 'a bought modification is equipped right away');
  r = await mod('avtomat', 'reddot');
  assert.deepEqual(r.body.loadout.mods.avtomat, ['silencer', 'reddot']);
  r = await mod('avtomat', 'scope');
  assert.deepEqual(r.body.mods.avtomat, ['silencer', 'reddot', 'scope']);
  assert.deepEqual(r.body.loadout.mods.avtomat, ['silencer', 'scope'], 'the scope takes the optic mount from the red dot');
  assert.equal((await mod('avtomat', 'silencer')).body.error.code, 'owned');
  assert.equal((await mod('pistol', 'scope')).body.error.code, 'not_fit');
  assert.equal((await mod('montirovka', 'laser')).body.error.code, 'not_fit');
  assert.equal((await mod('svd', 'scope')).body.error.code, 'not_owned');
  assert.equal((await mod('avtomat', 'turbo')).status, 400);
  const inv = await ctx().economy.inventory(a.userId);
  assert.equal(inv.tokens, 5000 - MOD_PRICES.silencer - MOD_PRICES.reddot - MOD_PRICES.scope);
  // the loadout endpoint switches between owned modifications; unowned ones are dropped
  r = await api(app.base, '/api/me/loadout', { method: 'POST', token: a.token, body: { sidearm: 'pistol', melee: 'montirovka', primary: 'avtomat', mods: { avtomat: ['reddot', 'laser'] } } });
  assert.deepEqual(r.body.loadout.mods.avtomat, ['reddot']);
  const gear = await ctx().economy.gear(a.userId);
  assert.deepEqual(gear.loadout.mods.avtomat, ['reddot'], 'modifications travel with the loadout into rooms');
  const led = await ctx().economy.ledger(a.userId);
  assert.equal(led.filter((e) => e.reason === 'mod').length, 3);
});

test('economy: equipment is bought with tokens (some from a level) and equipped in the loadout', async () => {
  const a = await devLogin(app.base, 'Подрывник');
  const buy = (id: string) => api(app.base, '/api/shop/buy', { method: 'POST', token: a.token, body: { kind: 'gadget', id } });
  assert.equal((await buy('f1')).body.error.code, 'not_for_sale', 'the free grenade is not sold');
  assert.equal((await buy('smoke')).body.error.code, 'funds');
  await ctx().economy.grant(a.userId, 'tokens', 2000, null, 'test');
  let r = await buy('smoke');
  assert.equal(r.status, 200, r.text);
  assert.ok(r.body.gadgets.includes('smoke'));
  assert.equal(r.body.tokens, 2000 - GADGET_PRICES.smoke!.amount);
  assert.equal((await buy('turret')).body.error.code, 'level');
  await setLevel(a.userId, 12);
  r = await buy('turret');
  assert.equal(r.status, 200, r.text);
  r = await api(app.base, '/api/me/loadout', { method: 'POST', token: a.token, body: { sidearm: 'pistol', melee: 'montirovka', primary: 'avtomat', gadget: 'turret' } });
  assert.equal(r.body.loadout.gadget, 'turret');
  r = await api(app.base, '/api/me/loadout', { method: 'POST', token: a.token, body: { sidearm: 'pistol', melee: 'montirovka', primary: 'avtomat', gadget: 'c4' } });
  assert.equal(r.body.loadout.gadget, 'f1', 'unowned equipment falls back to the free grenade');
  r = await api(app.base, '/api/me/loadout', { method: 'POST', token: a.token, body: { sidearm: 'pistol', melee: 'montirovka', primary: 'avtomat', gadget: null } });
  assert.equal(r.body.loadout.gadget, null);
  assert.equal((await ctx().economy.gear(a.userId)).loadout.gadget, null);
});

test('economy: cases cost talons (v0.24), never repeat a weapon and stop when the collection is complete', async () => {
  const a = await devLogin(app.base, 'Азартный');
  const open = () => api(app.base, '/api/shop/case', { method: 'POST', token: a.token, body: {} });
  assert.equal(CASE_PRICE.currency, 'tokens');
  assert.equal((await open()).body.error.code, 'funds', 'a talon case needs no adult confirmation, just talons');
  await ctx().economy.grant(a.userId, 'diamonds', 5000, null, 'test');
  assert.equal((await open()).body.error.code, 'funds', 'diamonds do not open it');
  await ctx().economy.grant(a.userId, 'tokens', CASE_PRICE.amount * CASE_TABLE.length + 5, null, 'test');
  const got = new Set<string>();
  for (let i = 0; i < CASE_TABLE.length; i++) {
    const r = await open();
    assert.equal(r.status, 200, r.text);
    assert.ok(!got.has(r.body.weapon), `no duplicate (${r.body.weapon})`);
    got.add(r.body.weapon);
    assert.ok(r.body.inventory.weapons.includes(r.body.weapon));
  }
  assert.equal(got.size, CASE_TABLE.length);
  const last = await open();
  assert.equal(last.status, 409);
  assert.equal(last.body.error.code, 'collection_complete');
  const inv = await ctx().economy.inventory(a.userId);
  assert.equal(inv.tokens, 5);
  assert.equal(inv.diamonds, 5000);
  const [n] = await app.db.sql<Array<{ n: number }>>`SELECT count(*)::int AS n FROM case_openings WHERE user_id = ${a.userId} AND currency = 'tokens' AND price = ${CASE_PRICE.amount}`;
  assert.equal(n!.n, CASE_TABLE.length);
  const off = await startTestApp({ CASES_ENABLED: false });
  try {
    const b = await devLogin(off.base, 'Бельгиец');
    const r = await api(off.base, '/api/shop/case', { method: 'POST', token: b.token, body: {} });
    assert.equal(r.status, 403);
    assert.equal((await api(off.base, '/api/shop/config')).body.casesEnabled, false);
  } finally {
    await off.close();
  }
});

test('economy v0.2.18: the skin case — 299 BLATS with the adult confirmation, never a duplicate or a free skin, the new skin goes on a bare weapon', async () => {
  const a = await quickUser('Модник');
  const open = () => api(app.base, '/api/shop/skin-case', { method: 'POST', token: a.token, body: { confirmAge: true } });
  assert.equal((await open()).body.error.code, 'funds');
  assert.equal((await api(app.base, '/api/shop/skin-case', { method: 'POST', token: a.token, body: {} })).body.error.code, 'confirm_age', 'a case for money asks for 18+');
  await ctx().economy.grant(a.userId, 'tokens', 10_000, null, 'test');
  assert.equal((await open()).body.error.code, 'funds', 'talons don’t open it');
  await ctx().economy.grant(a.userId, 'diamonds', SKIN_CASE_PRICE.amount * 6 + 10, null, 'test');
  const got = new Set<string>();
  const wornBefore = new Map<string, string | undefined>();
  for (let i = 0; i < 6; i++) {
    const before = (await ctx().economy.inventory(a.userId)).loadout.skins ?? {};
    const r = await open();
    assert.equal(r.status, 200, r.text);
    const id = skinId(r.body.weapon, r.body.finish);
    assert.ok(parseSkin(id), id);
    assert.equal(FINISHES[r.body.finish as keyof typeof FINISHES].rarity, r.body.rarity);
    assert.ok(!got.has(id), `no duplicate (${id})`);
    assert.ok(SHOP_FINISHES.includes(r.body.finish), 'only a finish on sale: never a free, gifted or retired one');
    got.add(id);
    assert.ok(r.body.inventory.skins.includes(id));
    const prev = before[r.body.weapon as keyof typeof before];
    wornBefore.set(id, prev);
    // a weapon without a skin gets the new one; a weapon already wearing one keeps it
    assert.equal(r.body.equipped, prev === undefined);
    assert.equal(r.body.inventory.loadout.skins[r.body.weapon], prev ?? r.body.finish);
  }
  const inv = await ctx().economy.inventory(a.userId);
  assert.equal(inv.diamonds, 10);
  assert.equal(inv.skins.filter((x) => !FINISHES[parseSkin(x)!.finish].gift).length, 6, 'six from the case (and the welcome gift)');
  const rows = await app.db.sql<Array<{ kind: string; finish_id: string; price: number; currency: string }>>`SELECT kind, finish_id, price, currency FROM case_openings WHERE user_id = ${a.userId}`;
  assert.equal(rows.length, 6);
  assert.ok(rows.every((x) => x.kind === 'skin' && x.finish_id && x.price === SKIN_CASE_PRICE.amount && x.currency === 'diamonds'));
  const [ledger] = await app.db.sql<Array<{ n: number }>>`SELECT count(*)::int AS n FROM currency_ledger WHERE user_id = ${a.userId} AND reason = 'case' AND ref LIKE 'skincase:%'`;
  assert.equal(ledger!.n, 6);
  // cases switched off: the skin case too
  const off = await startTestApp({ CASES_ENABLED: false });
  try {
    const b = await devLogin(off.base, 'Модник Б');
    assert.equal((await api(off.base, '/api/shop/skin-case', { method: 'POST', token: b.token, body: {} })).status, 403);
  } finally {
    await off.close();
  }
});

test('economy v0.2.18 part 2: the character case — 299 BLATS with the adult confirmation, only characters sold for BLATS, never a duplicate; the collection completes', async () => {
  const a = await quickUser('Коллекционер');
  const open = () => api(app.base, '/api/shop/character-case', { method: 'POST', token: a.token, body: { confirmAge: true } });
  assert.equal((await api(app.base, '/api/shop/character-case', { method: 'POST', token: a.token, body: {} })).body.error.code, 'confirm_age', 'a case for money asks for 18+');
  assert.equal((await open()).body.error.code, 'funds');
  await ctx().economy.grant(a.userId, 'tokens', 10_000, null, 'test');
  assert.equal((await open()).body.error.code, 'funds', 'talons don’t open it');
  const n = CASE_CHARACTERS.length;
  await ctx().economy.grant(a.userId, 'diamonds', CHARACTER_CASE_PRICE.amount * (n + 1), null, 'test');
  const got = new Set<string>();
  const take = (character: string, grade: string, characters: string[]) => {
    assert.ok(CASE_CHARACTERS.includes(character as (typeof CASE_CHARACTERS)[number]), `${character}: one sold for BLATS`);
    assert.equal(CHARACTERS[character as keyof typeof CHARACTERS].grade, grade);
    assert.ok(!got.has(character), `no duplicate (${character})`);
    got.add(character);
    assert.ok(characters.includes(character));
  };
  // three through the API, the rest straight from the repository (the shop's rate limit)
  for (let i = 0; i < 3; i++) {
    const r = await open();
    assert.equal(r.status, 200, r.text);
    take(r.body.character, r.body.grade, r.body.inventory.characters);
  }
  for (let i = 3; i < n; i++) {
    const r = await ctx().economy.openCharacterCase(a.userId);
    take(r.character, r.grade, r.inventory.characters);
  }
  // every character for BLATS is in; the next opening is refused
  assert.equal(got.size, n);
  await assert.rejects(ctx().economy.openCharacterCase(a.userId), (e: Error & { refusal?: string }) => e.refusal === 'collection_complete');
  const inv = await ctx().economy.inventory(a.userId);
  assert.equal(inv.diamonds, CHARACTER_CASE_PRICE.amount, 'only the openings were paid');
  assert.ok(!inv.characters.includes('uchastkovy') && !inv.characters.includes('vorona'), 'the talon characters never drop');
  const rows = await app.db.sql<Array<{ kind: string; character_id: string; weapon_id: string | null; rarity: string }>>`SELECT kind, character_id, weapon_id, rarity FROM case_openings WHERE user_id = ${a.userId}`;
  assert.equal(rows.length, n);
  assert.ok(rows.every((x) => x.kind === 'character' && x.character_id && x.weapon_id === null && CHARACTERS[x.character_id as keyof typeof CHARACTERS].grade === x.rarity));
  const [ledger] = await app.db.sql<Array<{ n: number }>>`SELECT count(*)::int AS n FROM currency_ledger WHERE user_id = ${a.userId} AND reason = 'case' AND ref LIKE 'charcase:%'`;
  assert.equal(ledger!.n, n);
  const off = await startTestApp({ CASES_ENABLED: false });
  try {
    const b = await devLogin(off.base, 'Коллекционер Б');
    assert.equal((await api(off.base, '/api/shop/character-case', { method: 'POST', token: b.token, body: { confirmAge: true } })).status, 403);
  } finally {
    await off.close();
  }
});

test('economy: skins are worn only when owned (any weapon, owned or not), and the room shows them to everybody', async () => {
  const a = await quickUser('Щёголь');
  const b = await quickUser('Зритель');
  await ctx().economy.grantItem(a.userId, 'skin', 'avtomat.zoloto');
  await ctx().economy.grantItem(a.userId, 'skin', 'svd.gzhel');
  assert.equal((await ctx().economy.inventory(a.userId)).skins.filter((x) => !FINISHES[parseSkin(x)!.finish].gift).length, 2, 'two of the retired line kept (and the welcome gift)');
  const body = { sidearm: 'pistol', melee: 'montirovka', primary: 'avtomat', skins: { avtomat: 'zoloto', pistol: 'hohloma', svd: 'gzhel' } };
  const r = await api(app.base, '/api/me/loadout', { method: 'POST', token: a.token, body });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.body.loadout.skins, { avtomat: 'zoloto', svd: 'gzhel' }, 'the unowned pistol skin is dropped; the svd skin stays for when one is picked up');
  assert.equal((await api(app.base, '/api/me/loadout', { method: 'POST', token: a.token, body: { ...body, skins: { avtomat: 'not-a-finish' } } })).status, 400);
  // a later loadout change without «skins» keeps them
  const keep = await api(app.base, '/api/me/loadout', { method: 'POST', token: a.token, body: { sidearm: 'pistol', melee: 'montirovka', primary: 'avtomat' } });
  assert.deepEqual(keep.body.loadout.skins, { avtomat: 'zoloto', svd: 'gzhel' });
  // in a room: B sees A's skins in the roster
  const room = await api(app.base, '/api/rooms', { method: 'POST', token: a.token, body: { mapId: 'factory', isPrivate: true, mode: 'ffa' } });
  // every message is recorded from the first one (welcome and roster can arrive in one packet)
  const rosters: Array<{ players: Array<{ id: string; skins?: Record<string, string> }> }> = [];
  const join = (token: string, record: boolean) =>
    new Promise<WebSocket>((resolve) => {
      const ws = new WebSocket(`${app.wsBase}/ws`);
      ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', protocol: PROTOCOL_VERSION, token, roomId: room.body.roomId, character: 'petya', clientVersion: 'test' })));
      ws.on('message', (d, bin) => {
        if (bin) return;
        const m = JSON.parse(String(d));
        if (m.type === 'welcome') resolve(ws);
        if (record && m.type === 'roster') rosters.push(m);
      });
    });
  const wa = await join(a.token, false);
  const wb = await join(b.token, true);
  const deadline = Date.now() + 5000;
  while (!rosters.some((m) => m.players.length === 2) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
  const roster = rosters.find((m) => m.players.length === 2)!;
  assert.ok(roster, 'a roster with both players');
  assert.deepEqual(roster.players.find((p) => p.id === a.userId)?.skins, { avtomat: 'zoloto', svd: 'gzhel' });
  assert.deepEqual(roster.players.find((p) => p.id === b.userId)?.skins, {});
  wa.close();
  wb.close();
});

test('economy: the loadout only keeps owned weapons and the server re-reads it for rooms', async () => {
  const a = await devLogin(app.base, 'Снайпер');
  let r = await api(app.base, '/api/me/loadout', { method: 'POST', token: a.token, body: { sidearm: 'deagle', melee: 'bita', primary: 'svd' } });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual([r.body.loadout.sidearm, r.body.loadout.melee, r.body.loadout.primary], ['pistol', 'montirovka', 'avtomat'], 'unowned → free defaults');
  await ctx().economy.grantItem(a.userId, 'weapon', 'svd');
  r = await api(app.base, '/api/me/loadout', { method: 'POST', token: a.token, body: { sidearm: 'pistol', melee: 'montirovka', primary: 'svd' } });
  assert.equal(r.body.loadout.primary, 'svd');
  r = await api(app.base, '/api/me/loadout', { method: 'POST', token: a.token, body: { sidearm: 'pistol', melee: 'montirovka', primary: null } });
  assert.equal(r.body.loadout.primary, null, 'going in with a pistol only is allowed');
  assert.equal((await api(app.base, '/api/me/loadout', { method: 'POST', token: a.token, body: { sidearm: 'svd', melee: 'montirovka', primary: null } })).status, 200);
  const gear = await ctx().economy.gear(a.userId);
  assert.equal(gear.loadout.sidearm, 'pistol', 'a rifle cannot be a sidearm');
});

test('economy: concurrent purchases cannot overspend', async () => {
  const a = await devLogin(app.base, 'Торопыга');
  await ctx().economy.grant(a.userId, 'tokens', WEAPON_PRICES.nozh!.amount + WEAPON_PRICES.uzi!.amount - 1, null, 'test');
  const results = await Promise.all([
    api(app.base, '/api/shop/buy', { method: 'POST', token: a.token, body: { kind: 'weapon', id: 'nozh' } }),
    api(app.base, '/api/shop/buy', { method: 'POST', token: a.token, body: { kind: 'weapon', id: 'uzi' } }),
  ]);
  assert.equal(results.filter((r) => r.status === 200).length, 1, results.map((r) => r.text).join(' | '));
  const inv = await ctx().economy.inventory(a.userId);
  assert.ok(inv.tokens >= 0);
});

// ── Payments ──────────────────────────────────────────────────────────────

test('payments v0.2.18: BLATS packs from 99 are on sale; without a connected provider the checkout says so (no simulated purchases); no crypto', async () => {
  const a = await devLogin(app.base, 'Без карты');
  const cfg = await api(app.base, '/api/shop/config');
  assert.equal(cfg.body.card, false);
  assert.equal(cfg.body.crypto, undefined, 'no crypto method');
  assert.deepEqual(cfg.body.packs, DIAMOND_PACKS.map((p) => ({ ...p })));
  assert.equal(cfg.body.packs[0].diamonds, 99);
  const r = await api(app.base, '/api/pay/checkout', { method: 'POST', token: a.token, body: { packId: 'b199', method: 'card' } });
  assert.equal(r.status, 503);
  assert.equal(r.body.error.code, 'payments_not_configured');
  assert.equal((await api(app.base, '/api/pay/checkout', { method: 'POST', token: a.token, body: { packId: 'b199', method: 'crypto' } })).status, 400, 'crypto is no method');
  assert.equal((await api(app.base, '/api/pay/nowpayments/ipn', { method: 'POST', body: {} })).status, 404);
  assert.equal((await api(app.base, '/api/pay/stripe/webhook', { method: 'POST', body: {} })).status, 404);
  const [n] = await app.db.sql<Array<{ n: number }>>`SELECT count(*)::int AS n FROM payments WHERE user_id = ${a.userId}`;
  assert.equal(n!.n, 0, 'no payment row without a provider');
});

test('payments: sessions opened inside Telegram cannot start a card checkout (Stars only)', async () => {
  const init = signInitData({ user: JSON.stringify({ id: 515151, first_name: 'Zhora' }), auth_date: String(Math.floor(Date.now() / 1000)) }, TEST_BOT_TOKEN);
  const t = await api(app.base, '/api/auth/telegram', { method: 'POST', body: { initData: init, platform: 'telegram_ios' } });
  assert.equal(t.status, 200, t.text);
  const r = await api(app.base, '/api/pay/checkout', { method: 'POST', token: t.body.token, body: { packId: 'b199', method: 'card' } });
  assert.equal(r.status, 403);
  assert.equal(r.body.error.code, 'telegram_stars_only', r.text);
  const [n] = await app.db.sql<Array<{ n: number }>>`SELECT count(*)::int AS n FROM payments WHERE user_id = ${t.body.profile.id}`;
  assert.equal(n!.n, 0, 'no payment row is created');
});

test('payments: Stripe checkout + signed webhook credits BLATS exactly once; bad signatures are refused', async () => {
  const a = await devLogin(app.base, 'Платящий');
  const calls: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
  const fakeFetch: FetchLike = async (url, init) => {
    calls.push({ url, body: init.body, headers: init.headers });
    return { ok: true, status: 200, json: async () => ({ id: 'cs_test_123', url: 'https://checkout.stripe.com/c/pay/cs_test_123' }), text: async () => '' };
  };
  const stripe = new StripeProvider('sk_test_x', 'whsec_test', fakeFetch);
  const svc = new PaymentService(app.db.sql, silentLogger, new MemoryAnalytics(), 'https://blatkom.example', stripe);
  const co = await svc.checkout(a.userId, 'b499', 'card');
  assert.equal(co.url, 'https://checkout.stripe.com/c/pay/cs_test_123');
  const form = new URLSearchParams(calls[0]!.body);
  assert.equal(form.get('line_items[0][price_data][unit_amount]'), '499');
  assert.equal(form.get('metadata[payment_id]'), co.paymentId);
  assert.equal(calls[0]!.headers['idempotency-key'], co.paymentId);
  // signature verification
  const payload = Buffer.from(JSON.stringify({ type: 'checkout.session.completed', data: { object: { payment_status: 'paid', currency: 'usd', amount_total: 499, metadata: { payment_id: co.paymentId } } } }));
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', 'whsec_test').update(`${t}.`).update(payload).digest('hex');
  assert.equal(stripe.verifyWebhook(payload, `t=${t},v1=${sig}`), true);
  assert.equal(stripe.verifyWebhook(payload, `t=${t},v1=${'0'.repeat(64)}`), false);
  assert.equal(stripe.verifyWebhook(payload, `t=${t - 3600},v1=${sig}`), false, 'old timestamps are rejected');
  assert.equal(stripe.verifyWebhook(Buffer.from(payload.toString().replace('499', '1')), `t=${t},v1=${sig}`), false, 'tampered body');
  await svc.onStripeEvent(JSON.parse(payload.toString()));
  await svc.onStripeEvent(JSON.parse(payload.toString()));
  const inv = await ctx().economy.inventory(a.userId);
  assert.equal(inv.diamonds, 499, 'credited once');
  assert.equal((await svc.status(a.userId, co.paymentId)).status, 'paid');
  // refund takes back unspent diamonds
  await svc.markRefunded(co.paymentId, 'stripe');
  assert.equal((await ctx().economy.inventory(a.userId)).diamonds, 0);
});

test('payments: an underpaid Stripe session credits nothing; the full price once', async () => {
  const a = await devLogin(app.base, 'Недоплатил');
  const fakeFetch: FetchLike = async () => ({ ok: true, status: 200, json: async () => ({ id: 'cs_test_999', url: 'https://checkout.stripe.com/c/pay/cs_test_999' }), text: async () => '' });
  const svc = new PaymentService(app.db.sql, silentLogger, new MemoryAnalytics(), 'https://blatkom.example', new StripeProvider('sk_test_x', 'whsec_test', fakeFetch));
  const co = await svc.checkout(a.userId, 'b999', 'card');
  const paid = (cents: number) => ({ type: 'checkout.session.completed', data: { object: { payment_status: 'paid', currency: 'usd', amount_total: cents, metadata: { payment_id: co.paymentId } } } });
  await svc.onStripeEvent(paid(100));
  assert.equal((await ctx().economy.inventory(a.userId)).diamonds, 0, 'underpaid');
  await svc.onStripeEvent(paid(999));
  await svc.onStripeEvent(paid(999));
  assert.equal((await ctx().economy.inventory(a.userId)).diamonds, 999);
  const [n] = await app.db.sql<Array<{ n: number }>>`SELECT count(*)::int AS n FROM currency_ledger WHERE user_id = ${a.userId} AND reason = 'topup'`;
  assert.equal(n!.n, 1);
});

// ── Email sign-in ───────────────────────────────────────────────────────────

test('email: link an email, sign in from another device, refuse taken emails and wrong passwords', async () => {
  const a = await devLogin(app.base, 'Донатер');
  const b = await devLogin(app.base, 'Сосед');
  await ctx().economy.grant(a.userId, 'diamonds', 300, null, 'test');
  let r = await api(app.base, '/api/auth/email/link', { method: 'POST', token: a.token, body: { email: 'Donater@Example.com ', password: 'короткий' } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.email, 'donater@example.com');
  r = await api(app.base, '/api/auth/email/link', { method: 'POST', token: a.token, body: { email: 'other@example.com', password: 'длинный-пароль' } });
  assert.equal(r.body.error.code, 'already_linked');
  r = await api(app.base, '/api/auth/email/link', { method: 'POST', token: b.token, body: { email: 'donater@example.com', password: 'длинный-пароль' } });
  assert.equal(r.body.error.code, 'email_taken');
  r = await api(app.base, '/api/auth/email/link', { method: 'POST', token: b.token, body: { email: 'neighbour@example.com', password: '1234567' } });
  assert.equal(r.status, 400, 'password too short');
  r = await api(app.base, '/api/auth/email/login', { method: 'POST', body: { email: 'donater@example.com', password: 'неверный' } });
  assert.equal(r.status, 401);
  r = await api(app.base, '/api/auth/email/login', { method: 'POST', body: { email: 'DONATER@example.com', password: 'короткий', platform: 'browser_mobile' } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.profile.id, a.userId, 'the same account on the new device');
  assert.equal(r.body.profile.diamonds, 300 + 199, 'its BLATS — and, v0.2.20, the welcome bonus registering the email paid');
  const [u] = await app.db.sql<Array<{ password_hash: string }>>`SELECT password_hash FROM users WHERE id = ${a.userId}`;
  assert.ok(u!.password_hash.startsWith('scrypt$') && !u!.password_hash.includes('короткий'));
  // password change
  r = await api(app.base, '/api/auth/email/password', { method: 'POST', token: r.body.token, body: { current: 'короткий', password: 'новый-пароль-89' } });
  assert.equal(r.status, 200);
  assert.equal((await api(app.base, '/api/auth/email/login', { method: 'POST', body: { email: 'donater@example.com', password: 'новый-пароль-89' } })).status, 200);
});

test('email: reset links are single-use and revoke old sessions; without a mail service the request is refused', async () => {
  const a = await devLogin(app.base, 'Забывчивый');
  await api(app.base, '/api/auth/email/link', { method: 'POST', token: a.token, body: { email: 'forgetful@example.com', password: 'первый-пароль' } });
  const req = await api(app.base, '/api/auth/email/reset-request', { method: 'POST', body: { email: 'forgetful@example.com' } });
  assert.equal(req.status, 503);
  assert.equal(req.body.error.code, 'mail_not_configured');
  const reset = await ctx().emailAuth.createReset('admin', { userId: a.userId });
  assert.ok(reset);
  let r = await api(app.base, '/api/auth/email/reset', { method: 'POST', body: { token: reset!.token, password: 'второй-пароль' } });
  assert.equal(r.status, 200, r.text);
  r = await api(app.base, '/api/auth/email/reset', { method: 'POST', body: { token: reset!.token, password: 'третий-пароль' } });
  assert.equal(r.status, 400, 'single use');
  assert.equal((await api(app.base, '/api/me', { token: a.token })).status, 401, 'old sessions revoked');
  assert.equal((await api(app.base, '/api/auth/email/login', { method: 'POST', body: { email: 'forgetful@example.com', password: 'второй-пароль' } })).status, 200);
});

test('funnel: anonymous visits are recorded and linked to the account created from them', async () => {
  const vid = 'visitor_abcdefghijklmnop';
  const v = await api(app.base, '/api/visit', { method: 'POST', body: { visitorId: vid, platform: 'browser_mobile', referrer: 'https://t.me/some/chat' } });
  assert.equal(v.status, 204, v.text);
  await api(app.base, '/api/visit', { method: 'POST', body: { visitorId: vid } });
  const [row] = await app.db.sql<Array<{ referrer: string; user_id: string | null }>>`SELECT referrer, user_id FROM visitors WHERE visitor_id = ${vid}`;
  assert.equal(row!.referrer, 't.me', 'only the referrer domain is kept');
  assert.equal(row!.user_id, null);
  const guestOn = await startTestApp({ GUEST_AUTH_ENABLED: true });
  try {
    await api(guestOn.base, '/api/visit', { method: 'POST', body: { visitorId: vid } });
    const g = await api(guestOn.base, '/api/auth/guest', { method: 'POST', body: { name: 'Гость', deviceId: 'device_0123456789abcdefghij', visitorId: vid } });
    assert.equal(g.status, 200, g.text);
    const [linked] = await guestOn.db.sql<Array<{ user_id: string }>>`SELECT user_id FROM visitors WHERE visitor_id = ${vid}`;
    assert.equal(linked!.user_id, g.body.profile.id);
  } finally {
    await guestOn.close();
  }
});

test('economy v0.2.18: two free characters and a free kit; three characters, weapons and the weapon case for talons; the rest for BLATS', () => {
  assert.equal(REAL_MONEY, true);
  assert.deepEqual([...FREE_CHARACTERS].sort(), ['petya', 'valuta']);
  const chars = Object.values(CHARACTER_PRICES);
  assert.equal(chars.length, CHARACTER_IDS.length - 2);
  assert.equal(chars.filter((p) => p!.currency === 'tokens').length, 3);
  assert.ok(chars.filter((p) => p!.currency === 'diamonds').every((p) => [199, 399, 799, 1099].includes(p!.amount) && p!.level === 1));
  assert.deepEqual(CHARACTER_IDS.filter((c) => !CHARACTER_PRICES[c] && !FREE_CHARACTERS.includes(c)), []);
  assert.deepEqual([...FREE_WEAPONS].sort(), ['avtomat', 'montirovka', 'pistol']);
  const weapons = Object.values(WEAPON_PRICES);
  assert.equal(weapons.length, 19);
  assert.ok(weapons.every((p) => p!.currency === 'tokens'), 'weapons are for talons');
  assert.equal(CASE_PRICE.currency, 'tokens', 'the rare-weapon case is opened with talons');
  assert.deepEqual(SKIN_CASE_PRICE, { currency: 'diamonds', amount: 299, level: 1 });
  assert.deepEqual(SKIN_PRICES, { common: 99, rare: 199, epic: 299, legendary: 499 });
  // the free kit is complete: a sidearm, a melee weapon and a primary
  assert.ok(FREE_WEAPONS.includes(DEFAULT_LOADOUT.sidearm) && FREE_WEAPONS.includes(DEFAULT_LOADOUT.melee) && FREE_WEAPONS.includes(DEFAULT_LOADOUT.primary!));
});

test('economy v0.2.18: a skin bought for BLATS goes on its weapon; the free finishes are everyone’s and can be worn', async () => {
  const a = await quickUser('Покупатель скинов');
  const buy = (weapon: string, finish: string) => api(app.base, '/api/shop/skin', { method: 'POST', token: a.token, body: { weapon, finish } });
  assert.equal((await buy('avtomat', 'berezka')).body.error.code, 'owned', 'a free finish is owned already');
  assert.equal((await buy('avtomat', 'yadernaya')).body.error.code, 'funds');
  assert.equal((await buy('avtomat', 'nope')).status, 400);
  // v0.2.18 part 2: the first line is retired (not sold), the welcome gift is not sold either
  assert.equal((await buy('avtomat', 'zoloto')).body.error.code, 'not_for_sale', 'a retired finish');
  assert.equal((await buy('avtomat', 'akulka')).body.error.code, 'owned', 'the welcome gift is everyone’s while it lasts');
  await ctx().economy.grant(a.userId, 'diamonds', SKIN_PRICES.legendary + SKIN_PRICES.common, null, 'test');
  let r = await buy('avtomat', 'yadernaya');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.diamonds, SKIN_PRICES.common);
  assert.ok(r.body.skins.includes('avtomat.yadernaya'));
  assert.equal(r.body.loadout.skins.avtomat, 'yadernaya', 'worn at once');
  assert.equal((await buy('avtomat', 'yadernaya')).body.error.code, 'owned');
  r = await buy('pistol', 'haki');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.diamonds, 0);
  const ledger = await app.db.sql<Array<{ delta: number; ref: string }>>`SELECT delta, ref FROM currency_ledger WHERE user_id = ${a.userId} AND reason = 'purchase' ORDER BY id`;
  assert.deepEqual(ledger.map((l) => [l.delta, l.ref]), [[-SKIN_PRICES.legendary, 'skin:avtomat.yadernaya'], [-SKIN_PRICES.common, 'skin:pistol.haki']]);
  // a free finish and the gift are worn without buying them; an unbought paid one is dropped
  const l = await api(app.base, '/api/me/loadout', { method: 'POST', token: a.token, body: { sidearm: 'pistol', melee: 'montirovka', primary: 'avtomat', skins: { montirovka: 'rzhavchina', obrez: 'gzhel', tt: 'blatkom' } } });
  assert.equal(l.status, 200, l.text);
  assert.deepEqual(l.body.loadout.skins, { montirovka: 'rzhavchina', tt: 'blatkom' });
});

test('economy v0.2.18 part 2: the welcome gift — both finishes on every weapon from the first sign-in while it lasts, kept for good; none after WELCOME_GIFT_UNTIL', async () => {
  const a = await quickUser('Ранний');
  const inv = await ctx().economy.inventory(a.userId);
  for (const id of welcomeSkins()) assert.ok(inv.skins.includes(id), id);
  assert.equal(welcomeSkins().length, SKINNABLE_WEAPONS.length * 2);
  // no item rows: one mark on the profile
  const [row] = await app.db.sql<Array<{ n: number; at: Date | null }>>`SELECT (SELECT count(*)::int FROM user_items WHERE user_id = ${a.userId} AND kind = 'skin') AS n, (SELECT welcome_gift_at FROM profiles WHERE user_id = ${a.userId}) AS at`;
  assert.equal(row!.n, 0);
  assert.ok(row!.at instanceof Date);
  // a server whose gift is over: a new player gets nothing, an early one keeps it
  const late = await startTestApp({ WELCOME_GIFT_UNTIL: new Date(Date.now() - 60_000) });
  try {
    const b = await devLogin(late.base, 'Поздний');
    const rb = await api(late.base, '/api/me/inventory', { token: b.token });
    assert.equal(rb.status, 200);
    assert.ok(!rb.body.skins.some((x: string) => FINISHES[parseSkin(x)!.finish].gift), 'after the date: no gift');
    const c = await devLogin(late.base, 'Ранний Б');
    await late.db.sql`UPDATE profiles SET welcome_gift_at = now() - interval '1 day' WHERE user_id = ${c.userId}`;
    const rc = await api(late.base, '/api/me/inventory', { token: c.token });
    assert.ok(rc.body.skins.includes('avtomat.akulka') && rc.body.skins.includes('avtomat.blatkom'), 'given before the date: kept');
  } finally {
    await late.close();
  }
});

test('economy v0.23: accounts made before the change keep the wolf, the bear and the sawn-off (migration 009)', async () => {
  const a = await devLogin(app.base, 'Старожил');
  // the migration's own SQL, run again now that this account exists (it is idempotent)
  await app.db.sql.unsafe(readFileSync(new URL('../database/migrations/009_v023_unlocks.sql', import.meta.url), 'utf8'));
  const r = await api(app.base, '/api/me/inventory', { token: a.token });
  assert.equal(r.status, 200);
  assert.ok(r.body.characters.includes('uchastkovy') && r.body.characters.includes('mihalych') && r.body.weapons.includes('obrez'));
  const b = await devLogin(app.base, 'Новичок');
  const rb = await api(app.base, '/api/me/inventory', { token: b.token });
  assert.ok(!rb.body.characters.includes('uchastkovy') && !rb.body.weapons.includes('obrez'), 'a new account starts with the free ones only');
});
