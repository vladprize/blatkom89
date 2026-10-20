import { readFileSync } from 'node:fs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { CASE_PRICE, CASE_TABLE, CHARACTER_IDS, CHARACTER_PRICES, DEFAULT_LOADOUT, FINISHES, FREE_CHARACTERS, FREE_GADGETS, FREE_WEAPONS, GADGET_PRICES, MOD_PRICES, PROTOCOL_VERSION, SKIN_CASE_PRICE, WEAPON_PRICES, parseSkin, skinId, tokensForMatch } from '@blatkom/shared';
import { WebSocket } from 'ws';
import { startTestApp, api, devLogin, TEST_BOT_TOKEN } from '../admin/testkit.js';
import { signInitData } from '../auth/telegram.js';
import type { TestApp } from '../admin/testkit.js';
import { pgContext } from '../services/persistence.js';
import { silentLogger } from '../logging/logger.js';
import { StripeProvider, NowPaymentsProvider, sortKeysDeep } from '../payments/providers.js';
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
  assert.equal(r.body.error.code, 'funds', 'diamond items cannot be bought with tokens');
  r = await buy('weapon', 'zolotoy');
  assert.equal(r.body.error.code, 'not_for_sale', 'case weapons are not sold directly');
  r = await buy('weapon', 'laser');
  assert.equal(r.body.error.code, 'not_for_sale');
  const led = await ctx().economy.ledger(a.userId);
  assert.equal(led.filter((e) => e.reason === 'purchase').length, 2);
});

test('economy: characters — level + tokens or diamonds; only owned characters can be preferred', async () => {
  const a = await devLogin(app.base, 'Коллекционер');
  const r0 = await api(app.base, '/api/me', { method: 'PATCH', token: a.token, body: { preferredCharacter: 'vorona' } });
  assert.equal(r0.status, 409);
  await ctx().economy.grant(a.userId, 'tokens', 500, null, 'test');
  await ctx().economy.grant(a.userId, 'diamonds', 300, null, 'test');
  let r = await api(app.base, '/api/shop/buy', { method: 'POST', token: a.token, body: { kind: 'character', id: 'vorona' } });
  assert.equal(r.body.error.code, 'level');
  await setLevel(a.userId, CHARACTER_PRICES.vorona!.level);
  r = await api(app.base, '/api/shop/buy', { method: 'POST', token: a.token, body: { kind: 'character', id: 'vorona' } });
  assert.equal(r.status, 200, r.text);
  r = await api(app.base, '/api/shop/buy', { method: 'POST', token: a.token, body: { kind: 'character', id: 'leopard' } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.diamonds, 1);
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

test('economy: cases cost diamonds, never repeat a weapon and stop when the collection is complete', async () => {
  const a = await devLogin(app.base, 'Азартный');
  const open = () => api(app.base, '/api/shop/case', { method: 'POST', token: a.token, body: { confirmAge: true } });
  assert.equal((await open()).body.error.code, 'funds');
  assert.equal((await api(app.base, '/api/shop/case', { method: 'POST', token: a.token, body: {} })).status, 400, 'adult confirmation required');
  await ctx().economy.grant(a.userId, 'diamonds', CASE_PRICE * CASE_TABLE.length + 5, null, 'test');
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
  assert.equal(inv.diamonds, 5);
  const [n] = await app.db.sql<Array<{ n: number }>>`SELECT count(*)::int AS n FROM case_openings WHERE user_id = ${a.userId}`;
  assert.equal(n!.n, CASE_TABLE.length);
  const off = await startTestApp({ CASES_ENABLED: false });
  try {
    const b = await devLogin(off.base, 'Бельгиец');
    const r = await api(off.base, '/api/shop/case', { method: 'POST', token: b.token, body: { confirmAge: true } });
    assert.equal(r.status, 403);
    assert.equal((await api(off.base, '/api/shop/config')).body.casesEnabled, false);
  } finally {
    await off.close();
  }
});

test('economy: the skin case — 299 diamonds, never a duplicate, the new skin goes on a bare weapon, odds recorded', async () => {
  const a = await quickUser('Модник');
  const open = () => api(app.base, '/api/shop/skin-case', { method: 'POST', token: a.token, body: { confirmAge: true } });
  assert.equal((await open()).body.error.code, 'funds');
  assert.equal((await api(app.base, '/api/shop/skin-case', { method: 'POST', token: a.token, body: {} })).status, 400, 'adult confirmation required');
  await ctx().economy.grant(a.userId, 'diamonds', SKIN_CASE_PRICE * 6 + 10, null, 'test');
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
  assert.equal(inv.skins.length, 6);
  const rows = await app.db.sql<Array<{ kind: string; finish_id: string; price: number }>>`SELECT kind, finish_id, price FROM case_openings WHERE user_id = ${a.userId}`;
  assert.equal(rows.length, 6);
  assert.ok(rows.every((x) => x.kind === 'skin' && x.finish_id && x.price === SKIN_CASE_PRICE));
  const [ledger] = await app.db.sql<Array<{ n: number }>>`SELECT count(*)::int AS n FROM currency_ledger WHERE user_id = ${a.userId} AND reason = 'case' AND ref LIKE 'skincase:%'`;
  assert.equal(ledger!.n, 6);
  // cases switched off: the skin case too
  const off = await startTestApp({ CASES_ENABLED: false });
  try {
    const b = await devLogin(off.base, 'Модник Б');
    assert.equal((await api(off.base, '/api/shop/skin-case', { method: 'POST', token: b.token, body: { confirmAge: true } })).status, 403);
  } finally {
    await off.close();
  }
});

test('economy: skins are worn only when owned (any weapon, owned or not), and the room shows them to everybody', async () => {
  const a = await quickUser('Щёголь');
  const b = await quickUser('Зритель');
  await ctx().economy.grantItem(a.userId, 'skin', 'avtomat.zoloto');
  await ctx().economy.grantItem(a.userId, 'skin', 'svd.gzhel');
  assert.equal((await ctx().economy.inventory(a.userId)).skins.length, 2);
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

test('payments: without provider keys checkout is unavailable (no simulated purchases)', async () => {
  const a = await devLogin(app.base, 'Без карты');
  const cfg = await api(app.base, '/api/shop/config');
  assert.equal(cfg.body.card, false);
  assert.equal(cfg.body.crypto, false);
  const r = await api(app.base, '/api/pay/checkout', { method: 'POST', token: a.token, body: { packId: 'd199', method: 'card' } });
  assert.equal(r.status, 503);
  assert.equal(r.body.error.code, 'payments_not_configured');
  assert.equal((await api(app.base, '/api/pay/stripe/webhook', { method: 'POST', body: {} })).status, 404);
});

test('payments: sessions opened inside Telegram cannot start card or crypto checkouts (Stars only)', async () => {
  const init = signInitData({ user: JSON.stringify({ id: 515151, first_name: 'Zhora' }), auth_date: String(Math.floor(Date.now() / 1000)) }, TEST_BOT_TOKEN);
  const t = await api(app.base, '/api/auth/telegram', { method: 'POST', body: { initData: init, platform: 'telegram_ios' } });
  assert.equal(t.status, 200, t.text);
  const r = await api(app.base, '/api/pay/checkout', { method: 'POST', token: t.body.token, body: { packId: 'd199', method: 'card' } });
  assert.equal(r.status, 403);
  assert.equal(r.body.error.code, 'telegram_stars_only');
  const [n] = await app.db.sql<Array<{ n: number }>>`SELECT count(*)::int AS n FROM payments WHERE user_id = ${t.body.profile.id}`;
  assert.equal(n!.n, 0, 'no payment row is created');
});

test('payments: Stripe checkout + signed webhook credits diamonds exactly once; bad signatures are refused', async () => {
  const a = await devLogin(app.base, 'Платящий');
  const calls: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
  const fakeFetch: FetchLike = async (url, init) => {
    calls.push({ url, body: init.body, headers: init.headers });
    return { ok: true, status: 200, json: async () => ({ id: 'cs_test_123', url: 'https://checkout.stripe.com/c/pay/cs_test_123' }), text: async () => '' };
  };
  const stripe = new StripeProvider('sk_test_x', 'whsec_test', fakeFetch);
  const svc = new PaymentService(app.db.sql, silentLogger, new MemoryAnalytics(), 'https://blatkom.example', stripe, null);
  const co = await svc.checkout(a.userId, 'd499', 'card');
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

test('payments: NOWPayments IPN signature (sorted keys, HMAC-SHA512); underpaid invoices credit nothing', async () => {
  const a = await devLogin(app.base, 'Криптан');
  const fakeFetch: FetchLike = async () => ({ ok: true, status: 200, json: async () => ({ id: 987654, invoice_url: 'https://nowpayments.io/payment/?iid=987654' }), text: async () => '' });
  const np = new NowPaymentsProvider('np_key', 'ipn_secret', false, fakeFetch);
  const svc = new PaymentService(app.db.sql, silentLogger, new MemoryAnalytics(), 'https://blatkom.example', null, np);
  const co = await svc.checkout(a.userId, 'd999', 'crypto');
  const body = { payment_status: 'finished', order_id: co.paymentId, price_amount: 9.99, price_currency: 'usd', pay_currency: 'usdttrc20', actually_paid: 9.99 };
  const sig = createHmac('sha512', 'ipn_secret').update(JSON.stringify(sortKeysDeep(body))).digest('hex');
  assert.equal(np.verifyIpn(body, sig), true);
  assert.equal(np.verifyIpn({ ...body, price_amount: 0.01 }, sig), false);
  await svc.onNowPaymentsIpn({ ...body, price_amount: 1.0 });
  assert.equal((await ctx().economy.inventory(a.userId)).diamonds, 0, 'underpaid');
  await svc.onNowPaymentsIpn(body);
  await svc.onNowPaymentsIpn(body);
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
  assert.equal(r.body.profile.diamonds, 300);
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

test('economy v0.23: two free characters, eleven for talons and eleven for diamonds; a free kit of three weapons; more weapons for diamonds than for talons', () => {
  assert.deepEqual([...FREE_CHARACTERS].sort(), ['petya', 'valuta']);
  const chars = Object.values(CHARACTER_PRICES);
  assert.equal(chars.filter((p) => p!.currency === 'tokens').length, 11);
  assert.equal(chars.filter((p) => p!.currency === 'diamonds').length, 11);
  // every character but the free two has a price; the talon ladder climbs with the level
  assert.deepEqual(CHARACTER_IDS.filter((c) => !CHARACTER_PRICES[c] && !FREE_CHARACTERS.includes(c)), []);
  const ladder = CHARACTER_IDS.map((c) => CHARACTER_PRICES[c]).filter((p) => p?.currency === 'tokens');
  for (let i = 1; i < ladder.length; i++) assert.ok(ladder[i]!.amount > ladder[i - 1]!.amount && ladder[i]!.level >= ladder[i - 1]!.level, `talon ladder step ${i}`);
  assert.deepEqual([...FREE_WEAPONS].sort(), ['avtomat', 'montirovka', 'pistol']);
  const weapons = Object.values(WEAPON_PRICES);
  const forTokens = weapons.filter((p) => p!.currency === 'tokens').length;
  const forDiamonds = weapons.filter((p) => p!.currency === 'diamonds').length;
  assert.ok(forDiamonds > forTokens && forDiamonds - forTokens <= 2, `${forDiamonds} for diamonds, ${forTokens} for talons`);
  // the free kit is complete: a sidearm, a melee weapon and a primary
  assert.ok(FREE_WEAPONS.includes(DEFAULT_LOADOUT.sidearm) && FREE_WEAPONS.includes(DEFAULT_LOADOUT.melee) && FREE_WEAPONS.includes(DEFAULT_LOADOUT.primary!));
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
