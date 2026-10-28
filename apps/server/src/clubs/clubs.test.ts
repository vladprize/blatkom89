/**
 * Clubs (v0.3) against PostgreSQL and the real gateway: the table with the house clubs, founding (level,
 * talons, unique names and tags), requests the head answers with live notices, leaving, showing out,
 * handing over and disbanding, the house clubs answering by themselves and drifting, and the club rating
 * moving with its members' match results; v0.2.17: gang battles — a gang calls another out.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import { CLUB_RULES, PROTOCOL_VERSION, clubMottoSchema, clubNameSchema, clubTagSchema, nameKey } from '@blatkom/shared';
import type { ClubDetails, ClubsResponse, ServerMessage, SocialEvent } from '@blatkom/shared';
import { startTestApp, api, devLogin, cookieFrom } from '../admin/testkit.js';
import { ADMIN_COOKIE } from '../admin/auth.js';
import type { TestApp } from '../admin/testkit.js';
import { ClubRepo } from './repo.js';
import { HOUSE_CLUBS, acceptAfterMs, drift, housePeople, houseSeed, houseSize } from './house.js';
import { PgMatchRecorder } from '../progression/recorder.js';
import { silentLogger } from '../logging/logger.js';

let app: TestApp;
before(async () => {
  app = await startTestApp({ ADMIN_BOOTSTRAP_USERNAME: 'root', ADMIN_BOOTSTRAP_PASSWORD: 'correct-horse-battery-staple' });
});
after(async () => {
  await app.close();
});

class Social {
  readonly ws: WebSocket;
  readonly events: SocialEvent[] = [];
  constructor(token: string) {
    this.ws = new WebSocket(`${app.wsBase}/ws/social`);
    this.ws.on('open', () => this.ws.send(JSON.stringify({ type: 'auth', token })));
    this.ws.on('message', (d) => this.events.push(JSON.parse(String(d)) as SocialEvent));
    this.ws.on('error', () => {});
  }
  async next<K extends SocialEvent['type']>(type: K, timeoutMs = 4000): Promise<Extract<SocialEvent, { type: K }>> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const hit = this.events.find((e) => e.type === type);
      if (hit) return hit as Extract<SocialEvent, { type: K }>;
      if (Date.now() > deadline) throw new Error(`no ${type} event; got ${JSON.stringify(this.events).slice(0, 300)}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  close() {
    this.ws.close();
  }
}

/** A signed-in player (sign-ins are rate-limited per address: wait for a token when the burst runs out). */
async function login(name: string) {
  for (let i = 0; ; i++) {
    try {
      return await devLogin(app.base, name);
    } catch (e) {
      if (i > 10 || !String(e).includes('429')) throw e;
      await new Promise((r) => setTimeout(r, 3100));
    }
  }
}

async function player(name: string, o: { level?: number; tokens?: number } = {}) {
  const s = await login(`${name} ${randomUUID().slice(0, 4)}`);
  await app.db.sql`INSERT INTO profiles (user_id) VALUES (${s.userId}) ON CONFLICT DO NOTHING`;
  await app.db.sql`UPDATE profiles SET level = ${o.level ?? 5}, tokens = ${o.tokens ?? 1000} WHERE user_id = ${s.userId}`;
  return s;
}

const FLAG = { pattern: 'h3', colors: [0, 8, 5] };
const EMBLEM = { icon: 'gear', color: 9 };
const found = (token: string, name: string, tag: string, extra: Record<string, unknown> = {}) => api(app.base, '/api/clubs', { method: 'POST', token, body: { name, tag, flag: FLAG, emblem: EMBLEM, ...extra } });
const page = async (token: string, id: string) => (await api(app.base, `/api/clubs/${id}`, { token })).body as ClubDetails;
const table = async (token: string, q?: string) => (await api(app.base, `/api/clubs${q ? `?q=${encodeURIComponent(q)}` : ''}`, { token })).body as ClubsResponse;

test('clubs: the table opens with the house clubs — twenty and more, ranked by rating, with people and a head, marked as nothing else', async () => {
  const a = await player('Зритель');
  const t = await table(a.token);
  assert.ok(t.clubs.length >= 20, `${t.clubs.length} clubs`);
  assert.equal(t.mine, null);
  t.clubs.forEach((c, i) => {
    assert.equal(c.rank, i + 1);
    if (i) assert.ok(t.clubs[i - 1]!.rating >= c.rating, 'by rating');
    assert.deepEqual(Object.keys(c).sort(), ['emblem', 'flag', 'id', 'members', 'name', 'rank', 'rating', 'recruiting', 'tag'], 'nothing tells a house club apart');
  });
  const first = t.clubs.find((c) => c.name === 'Garage Co-op 7')!;
  assert.ok(first, 'a house club by name');
  const d = await page(a.token, first.id);
  assert.equal(d.memberList.length, d.members);
  assert.equal(d.memberList.filter((m) => m.role === 'head').length, 1);
  assert.equal(d.memberList[0]!.role, 'head', 'the head first');
  for (const m of d.memberList) assert.match(m.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.doesNotMatch(JSON.stringify(d), /bot|house|seed|бот/i);
  assert.equal(d.me, 'none');
  assert.deepEqual(d.requests, []);
  // the same people on every visit
  assert.deepEqual((await page(a.token, first.id)).memberList.map((m) => m.name), d.memberList.map((m) => m.name));
  // search by name and by tag, letter case ignored
  assert.ok((await table(a.token, 'garage co')).clubs.some((c) => c.id === first.id));
  assert.ok((await table(a.token, 'gc7')).clubs.some((c) => c.id === first.id));
  assert.ok((await table(a.token, 'VHS')).clubs.some((c) => c.tag === 'VHS'));
  // v0.3: every club in Latin letters
  for (const c of t.clubs) assert.match(`${c.name} ${c.tag}`, /^[A-Za-z0-9 _.\-’'#!&]+$/);
});

test('clubs: anyone starts a gang (v0.2.8: level 1, free) with a free name and tag; the founder is the head', async () => {
  assert.deepEqual([CLUB_RULES.createLevel, CLUB_RULES.createTokens], [1, 0]);
  const fresh = await player('Новичок', { level: 1, tokens: 0 });
  const first = await found(fresh.token, 'Fresh Start', 'FS1');
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const [w] = await app.db.sql<Array<{ tokens: number }>>`SELECT tokens FROM profiles WHERE user_id = ${fresh.userId}`;
  assert.equal(w!.tokens, 0, 'nothing paid');
  assert.equal((await app.db.sql`SELECT 1 FROM currency_ledger WHERE user_id = ${fresh.userId} AND currency <> 'blat'`).length, 0, 'no talon ledger row for a free gang');
  const a = await player('Основатель');
  const bad = await found(a.token, 'X', 'Q');
  assert.equal(bad.status, 400, 'a one-letter name or tag is refused');
  assert.equal((await found(a.token, 'COURTYARD bosses', 'ZZZ')).body.error.code, 'name_taken', 'a house club’s name, any letter case');
  assert.equal((await found(a.token, 'New Bosses', 'cb')).body.error.code, 'tag_taken', 'a house club’s tag, any letter case');
  // v0.3: Latin letters only — name, tag and motto
  assert.equal((await found(a.token, 'Кассетные короли', 'TK')).status, 400);
  assert.equal((await found(a.token, 'Tape Kings', 'КК')).status, 400);
  assert.equal((await found(a.token, 'Tape Kings', 'TK', { motto: 'Перемотай назад' })).status, 400);
  const ok = await found(a.token, 'Tape  Kings ', 'tk', { motto: '  Rewind\u0000 it ' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const club = ok.body as ClubDetails;
  assert.equal(club.name, 'Tape Kings', 'spaces tidied');
  assert.equal(club.tag, 'TK', 'tags in capitals');
  assert.equal(club.motto, 'Rewind it', 'control characters out');
  assert.equal(club.me, 'head');
  assert.equal(club.rating, CLUB_RULES.startRating);
  assert.equal(club.members, 1);
  const [p] = await app.db.sql<Array<{ tokens: number }>>`SELECT tokens FROM profiles WHERE user_id = ${a.userId}`;
  assert.equal(p!.tokens, 1000 - CLUB_RULES.createTokens);
  assert.equal((await found(a.token, 'Second Club', 'SC')).body.error.code, 'in_club', 'one club at a time');
  const b = await player('Копирщик');
  assert.equal((await found(b.token, 'tape KINGS', 'ZZ')).body.error.code, 'name_taken');
  assert.equal((await found(b.token, 'Totally Different', 'Tk')).body.error.code, 'tag_taken', 'any letter case');
  // the table shows it; the founder's club is «mine» with its place
  const t = await table(a.token);
  assert.equal(t.mine?.id, club.id);
  assert.equal(t.mine?.rank, (await new ClubRepo(app.db.sql).search('Tape Kings'))[0]!.rank);
  // the head changes the flag and the motto; nobody else can
  const flag = { pattern: 'diag', colors: [5, 2, 2] };
  const ch = await api(app.base, `/api/clubs/${club.id}`, { method: 'PATCH', token: a.token, body: { flag, motto: 'No rewinding' } });
  assert.equal(ch.status, 200);
  assert.deepEqual((ch.body as ClubDetails).flag, flag);
  assert.equal((await api(app.base, `/api/clubs/${club.id}`, { method: 'PATCH', token: b.token, body: { motto: 'Takeover' } })).status, 403);
  const wrong = await api(app.base, `/api/clubs/${club.id}`, { method: 'PATCH', token: a.token, body: { flag: { pattern: 'plaid', colors: [0, 0, 0] } } });
  assert.equal(wrong.status, 400, 'unknown patterns are refused');
});

test('clubs: a request reaches the head live, the head takes the player in (the player hears it), other requests disappear; turning down and withdrawing', async () => {
  const head = await player('Глава');
  const club = (await found(head.token, 'Night Trams', 'NT')).body as ClubDetails;
  const other = (await table(head.token)).clubs.find((c) => c.name === 'North End')!;
  const b = await player('Проситель');
  const hs = new Social(head.token);
  const bs = new Social(b.token);
  try {
    await hs.next('ready');
    await bs.next('ready');
    assert.equal((await api(app.base, `/api/clubs/${other.id}/request`, { method: 'POST', token: b.token })).status, 200, 'a request to a house club too');
    const r = await api(app.base, `/api/clubs/${club.id}/request`, { method: 'POST', token: b.token });
    assert.equal(r.status, 200);
    assert.equal((r.body as ClubDetails).me, 'requested');
    assert.equal((await api(app.base, `/api/clubs/${club.id}/request`, { method: 'POST', token: b.token })).body.error.code, 'already_requested');
    const ev = await hs.next('club_request');
    assert.equal(ev.clubId, club.id);
    assert.equal(ev.from.id, b.userId);
    const mine = await table(head.token);
    assert.equal(mine.incoming, 1);
    const d = await page(head.token, club.id);
    assert.deepEqual(d.requests.map((q) => q.id), [b.userId]);
    assert.equal((await page(b.token, club.id)).requests.length, 0, 'only the head sees requests');
    // B can't answer for the club
    assert.equal((await api(app.base, `/api/clubs/${club.id}/requests/${b.userId}`, { method: 'POST', token: b.token, body: { accept: true } })).status, 403);
    const yes = await api(app.base, `/api/clubs/${club.id}/requests/${b.userId}`, { method: 'POST', token: head.token, body: { accept: true } });
    assert.equal(yes.status, 200);
    assert.equal((yes.body as ClubDetails).members, 2);
    const joined = await bs.next('club_joined');
    assert.equal(joined.club.id, club.id);
    const bt = await table(b.token);
    assert.equal(bt.mine?.id, club.id);
    assert.deepEqual(bt.requested, [], 'the request to the other club is gone');
    assert.equal((await page(b.token, club.id)).me, 'member');
    assert.equal((await api(app.base, `/api/clubs/${other.id}/request`, { method: 'POST', token: b.token })).body.error.code, 'in_club');
  } finally {
    hs.close();
    bs.close();
  }
  // turning down: the player hears it; withdrawing
  const c = await player('Отказник');
  const cs = new Social(c.token);
  try {
    await cs.next('ready');
    await api(app.base, `/api/clubs/${club.id}/request`, { method: 'POST', token: c.token });
    const no = await api(app.base, `/api/clubs/${club.id}/requests/${c.userId}`, { method: 'POST', token: head.token, body: { accept: false } });
    assert.equal(no.status, 200);
    const declined = await cs.next('club_declined');
    assert.equal(declined.name, 'Night Trams');
    assert.equal((await page(c.token, club.id)).me, 'none');
    await api(app.base, `/api/clubs/${club.id}/request`, { method: 'POST', token: c.token });
    const w = await api(app.base, `/api/clubs/${club.id}/request`, { method: 'DELETE', token: c.token });
    assert.equal((w.body as ClubDetails).me, 'none');
    assert.equal((await api(app.base, `/api/clubs/${club.id}/request`, { method: 'DELETE', token: c.token })).status, 404);
  } finally {
    cs.close();
  }
  // three open requests at most; closed recruiting refuses
  const d = await player('Жадный');
  const houses = (await table(d.token)).clubs.filter((x) => x.recruiting).slice(0, 4);
  for (const h of houses.slice(0, 3)) assert.equal((await api(app.base, `/api/clubs/${h.id}/request`, { method: 'POST', token: d.token })).status, 200);
  assert.equal((await api(app.base, `/api/clubs/${houses[3]!.id}/request`, { method: 'POST', token: d.token })).body.error.code, 'too_many_requests');
  const closed = (await table(d.token)).clubs.find((x) => !x.recruiting)!;
  assert.equal((await api(app.base, `/api/clubs/${closed.id}/request`, { method: 'POST', token: d.token })).body.error.code, 'closed');
  const r2 = await api(app.base, `/api/clubs/${club.id}/recruiting`, { method: 'POST', token: head.token, body: { recruiting: false } });
  assert.equal((r2.body as ClubDetails).recruiting, false);
  const e = await player('Опоздавший');
  assert.equal((await api(app.base, `/api/clubs/${club.id}/request`, { method: 'POST', token: e.token })).body.error.code, 'closed');
});

test('clubs: showing out, a head who leaves hands the club over, the last one out closes it, disbanding tells everybody', async () => {
  const head = await player('Старший');
  const club = (await found(head.token, 'Garage Wolves', 'GW')).body as ClubDetails;
  const people = [await player('Первый'), await player('Второй'), await player('Третий')];
  for (const p of people) {
    await api(app.base, `/api/clubs/${club.id}/request`, { method: 'POST', token: p.token });
    await api(app.base, `/api/clubs/${club.id}/requests/${p.userId}`, { method: 'POST', token: head.token, body: { accept: true } });
    await new Promise((r) => setTimeout(r, 15));
  }
  const ts = new Social(people[2]!.token);
  try {
    await ts.next('ready');
    const k = await api(app.base, `/api/clubs/${club.id}/kick/${people[2]!.userId}`, { method: 'POST', token: head.token });
    assert.equal((k.body as ClubDetails).members, 3);
    const ev = await ts.next('club_left');
    assert.equal(ev.reason, 'removed');
  } finally {
    ts.close();
  }
  assert.equal((await api(app.base, `/api/clubs/${club.id}/kick/${head.userId}`, { method: 'POST', token: people[0]!.token })).status, 403, 'members can’t show anyone out');
  const fs = new Social(people[0]!.token);
  try {
    await fs.next('ready');
    const left = await api(app.base, '/api/clubs/leave', { method: 'POST', token: head.token });
    assert.deepEqual(left.body, { left: club.id, closed: false });
    const ev = await fs.next('club_head');
    assert.equal(ev.clubId, club.id);
  } finally {
    fs.close();
  }
  const d = await page(people[0]!.token, club.id);
  assert.equal(d.me, 'head', 'the longest-standing member is the head now');
  assert.equal(d.members, 2);
  // disbanding: the other member hears it, the club is gone
  const ss = new Social(people[1]!.token);
  try {
    await ss.next('ready');
    assert.equal((await api(app.base, `/api/clubs/${club.id}`, { method: 'DELETE', token: people[1]!.token })).status, 403);
    assert.equal((await api(app.base, `/api/clubs/${club.id}`, { method: 'DELETE', token: people[0]!.token })).status, 200);
    assert.equal((await ss.next('club_left')).reason, 'disbanded');
  } finally {
    ss.close();
  }
  assert.equal((await api(app.base, `/api/clubs/${club.id}`, { token: people[0]!.token })).status, 404);
  assert.equal((await table(people[1]!.token)).mine, null);
  // the last one out closes a club
  const solo = await player('Одиночка');
  const sc = (await found(solo.token, 'On My Own', 'OMO')).body as ClubDetails;
  assert.deepEqual((await api(app.base, '/api/clubs/leave', { method: 'POST', token: solo.token })).body, { left: sc.id, closed: true });
  assert.equal((await api(app.base, `/api/clubs/${sc.id}`, { token: solo.token })).status, 404);
  assert.equal((await api(app.base, '/api/clubs/leave', { method: 'POST', token: solo.token })).status, 403, 'not in a club');
});

test('clubs: a house club says yes a few minutes after a request; the player is then listed among its people', async () => {
  const p = await player('Соискатель');
  const t = await table(p.token);
  const club = t.clubs.find((c) => c.name === 'Yard Cats')!;
  await api(app.base, `/api/clubs/${club.id}/request`, { method: 'POST', token: p.token });
  const now = Date.now();
  const wait = acceptAfterMs(houseSeed('Yard Cats'), p.userId);
  assert.ok(wait >= 2 * 60_000 && wait <= 12 * 60_000, `${wait} ms`);
  // (other players' older requests may be answered on the way: only this player's answer is looked at)
  const mineOnly = (l: Array<{ userId: string; clubId: string }>) => l.filter((j) => j.userId === p.userId);
  assert.deepEqual(mineOnly(await new ClubRepo(app.db.sql, () => new Date(now + wait - 5000)).answerHouseRequests()), [], 'not yet');
  const joined = await new ClubRepo(app.db.sql, () => new Date(now + wait + 5000)).answerHouseRequests();
  assert.deepEqual(mineOnly(joined), [{ userId: p.userId, clubId: club.id }]);
  const d = await page(p.token, club.id);
  assert.equal(d.me, 'member');
  assert.equal(d.members, club.members + 1);
  assert.ok(d.memberList.some((m) => m.id === p.userId && m.role === 'member'));
  assert.equal(d.memberList[0]!.role, 'head');
  // a house club can't be disbanded by anyone; leaving works
  assert.equal((await api(app.base, `/api/clubs/${club.id}`, { method: 'DELETE', token: p.token })).status, 403);
  assert.equal((await api(app.base, '/api/clubs/leave', { method: 'POST', token: p.token })).status, 200);
});

test('clubs: the rating moves with the members’ match results (and only theirs)', async () => {
  const head = await player('Капитан');
  const club = (await found(head.token, 'Rated Crew', 'RATE')).body as ClubDetails;
  const b = await player('Боец');
  await api(app.base, `/api/clubs/${club.id}/request`, { method: 'POST', token: b.token });
  await api(app.base, `/api/clubs/${club.id}/requests/${b.userId}`, { method: 'POST', token: head.token, body: { accept: true } });
  const loner = await player('Одиночка-2');
  const rec = new PgMatchRecorder(app.db.sql, silentLogger);
  const part = (userId: string, place: number) => ({ userId, character: 'petya' as const, place, kills: 3, assists: 0, deaths: 1, score: 6, damageDealt: 300, completed: true, viaInvite: false, team: null, playtimeMs: 180_000 });
  const now = Date.now();
  const res = await rec.matchCompleted({
    matchId: randomUUID(),
    roomId: 'clubroom01',
    mapId: 'factory',
    mode: 'ffa',
    winnerTeam: null,
    isPrivate: false,
    startedAt: new Date(now - 200_000),
    endedAt: new Date(now),
    durationMs: 200_000,
    endReason: 'time',
    playersAtEnd: 3,
    participants: [part(head.userId, 1), part(loner.userId, 2), part(b.userId, 3)],
  });
  const expected = club.rating + (res.get(head.userId)!.ratingDelta ?? 0) + (res.get(b.userId)!.ratingDelta ?? 0);
  assert.notEqual(res.get(head.userId)!.ratingDelta ?? 0, 0);
  assert.equal((await page(head.token, club.id)).rating, Math.max(0, expected));
});

test('clubs: house clubs — the same people for the same seed, a newcomer now and then, ratings that drift step by step and never jump', () => {
  const created = new Date('2026-09-01T00:00:00Z');
  const now = new Date('2026-10-22T12:00:00Z');
  const seed = houseSeed('Factory Lads');
  assert.equal(seed, houseSeed('FACTORY LADS'), 'by the folded name');
  const a = housePeople(seed, 'ru', 12, created, now);
  const b = housePeople(seed, 'ru', 12, created, now);
  assert.deepEqual(a, b);
  assert.equal(new Set(a.map((m) => m.name.toLowerCase())).size, 12, 'no two alike');
  for (const m of a) assert.match(m.name, /^[A-Za-z0-9 _.\-’']+$/, 'house people have Latin aliases like everybody (v0.3)');
  assert.equal(a[0]!.role, 'head');
  const later = housePeople(seed, 'ru', 12, created, new Date(now.getTime() + 14 * 86_400_000));
  assert.deepEqual(later.map((m) => m.name), a.map((m) => m.name), 'the same people two weeks later…');
  assert.ok(later.every((m, i) => m.level >= a[i]!.level), '…a little more experienced');
  assert.ok(houseSize(10, seed, created, new Date(created.getTime() + 60 * 86_400_000), 0) > 10, 'newcomers over two months');
  assert.equal(houseSize(48, seed, created, new Date(created.getTime() + 600 * 86_400_000), 3), CLUB_RULES.maxMembers - 3, 'never over the cap');
  // drift: one step per half hour, deterministic, bounded
  const o = { seed, base: 3000, trend: 1, size: 30, createdAt: created };
  const x = drift(3000, { ...o, from: now, now: new Date(now.getTime() + 29 * 60_000) });
  const y = drift(3000, { ...o, from: now, now: new Date(now.getTime() + 24 * 3_600_000) });
  assert.equal(y.rating, drift(3000, { ...o, from: now, now: new Date(now.getTime() + 24 * 3_600_000) }).rating, 'the same steps, the same result');
  assert.ok(Math.abs(y.rating - 3000) < 400, `a day moves it a little (${y.rating})`);
  assert.ok(x.at.getTime() <= now.getTime() + 29 * 60_000);
  const week = drift(3000, { ...o, from: now, now: new Date(now.getTime() + 60 * 86_400_000) });
  assert.ok(week.rating >= 300);
  // every house club: a valid name, tag, motto and flag
  assert.ok(HOUSE_CLUBS.length >= 20);
  assert.equal(new Set(HOUSE_CLUBS.map((c) => nameKey(c.name))).size, HOUSE_CLUBS.length);
  assert.equal(new Set(HOUSE_CLUBS.map((c) => nameKey(c.tag))).size, HOUSE_CLUBS.length);
  for (const c of HOUSE_CLUBS) {
    assert.ok(clubNameSchema.safeParse(c.name).success && clubTagSchema.safeParse(c.tag).success && clubMottoSchema.safeParse(c.motto).success, `${c.name} [${c.tag}] «${c.motto}» pass the players’ rules`);
    assert.ok(c.name.length >= 3 && c.name.length <= 24, c.name);
    assert.ok(c.tag.length >= 2 && c.tag.length <= 4, c.tag);
    assert.ok(c.motto.length <= CLUB_RULES.mottoMax, c.motto);
    assert.ok(c.size >= 1 && c.size <= CLUB_RULES.maxMembers);
  }
});

test('clubs: a deleted account leaves its club and withdraws its requests', async () => {
  const head = await player('Уходящий');
  const club = (await found(head.token, 'Quiet Exit', 'QE')).body as ClubDetails;
  const b = await player('Остающийся');
  await api(app.base, `/api/clubs/${club.id}/request`, { method: 'POST', token: b.token });
  await api(app.base, `/api/clubs/${club.id}/requests/${b.userId}`, { method: 'POST', token: head.token, body: { accept: true } });
  const del = await api(app.base, '/api/me', { method: 'DELETE', token: head.token });
  assert.ok(del.status === 200 || del.status === 204, String(del.status));
  const d = await page(b.token, club.id);
  assert.equal(d.me, 'head', 'the club went to the remaining member');
  assert.equal(d.members, 1);
});

test('clubs: the admin sees every club (the game’s own marked) and removes a player club — audited, its people told; the game’s clubs stay', async () => {
  const head = await player('Хулиган');
  const club = (await found(head.token, 'Bad Name', 'BAD')).body as ClubDetails;
  const b = await player('Свидетель');
  await api(app.base, `/api/clubs/${club.id}/request`, { method: 'POST', token: b.token });
  await api(app.base, `/api/clubs/${club.id}/requests/${b.userId}`, { method: 'POST', token: head.token, body: { accept: true } });
  assert.equal((await api(app.base, '/api/admin/clubs')).status, 401);
  const login = await api(app.base, '/api/admin/login', { method: 'POST', body: { username: 'root', password: 'correct-horse-battery-staple' } });
  const cookie = cookieFrom(login.headers, ADMIN_COOKIE)!;
  const csrf = login.body.csrfToken as string;
  const list = await api(app.base, '/api/admin/clubs', { cookie });
  assert.equal(list.status, 200);
  const rows = list.body as Array<{ id: string; house: boolean; realMembers: number; headName: string | null }>;
  assert.ok(rows.filter((r) => r.house).length >= 20);
  const mine = rows.find((r) => r.id === club.id)!;
  assert.deepEqual([mine.house, mine.realMembers], [false, 2]);
  assert.match(mine.headName ?? '', /Khuligan/, 'the head’s alias in Latin letters');
  assert.equal((await api(app.base, `/api/admin/clubs/${club.id}`, { method: 'DELETE', cookie })).status, 403, 'no CSRF token');
  const bs = new Social(b.token);
  try {
    await bs.next('ready');
    const del = await api(app.base, `/api/admin/clubs/${club.id}`, { method: 'DELETE', cookie, csrf });
    assert.equal(del.status, 200, del.text);
    assert.equal((await bs.next('club_left')).reason, 'disbanded');
  } finally {
    bs.close();
  }
  assert.equal((await api(app.base, `/api/clubs/${club.id}`, { token: b.token })).status, 404);
  const [a] = await app.db.sql<Array<{ action: string; details: { name: string; members: number } }>>`SELECT action, details FROM admin_audit_log WHERE target = ${club.id}`;
  assert.equal(a!.action, 'club_delete');
  assert.deepEqual([a!.details.name, a!.details.members], ['Bad Name', 2]);
  const house = rows.find((r) => r.house)!;
  assert.equal((await api(app.base, `/api/admin/clubs/${house.id}`, { method: 'DELETE', cookie, csrf })).body.error.code, 'house_club');
});

test('gang battles (v0.2.17): a gang calls another out — refusals, the room of the two gangs, the call to both gangs’ people, the gateway lets only them in', async () => {
  const join = async (clubId: string, head: { token: string }, who: { token: string; userId: string }) => {
    await api(app.base, `/api/clubs/${clubId}/request`, { method: 'POST', token: who.token });
    const r = await api(app.base, `/api/clubs/${clubId}/requests/${who.userId}`, { method: 'POST', token: head.token, body: { accept: true } });
    assert.equal(r.status, 200, r.text);
  };
  const tag = () => `B${randomUUID().slice(0, 3).toUpperCase()}`.replace(/[^A-Z0-9]/g, 'X');
  const ra = await player('Redhead');
  const rb = await player('Redhand');
  const ba = await player('Bluehead');
  const bb = await player('Bluehand');
  const loner = await player('Loner');
  const red = (await found(ra.token, `Red Battle ${randomUUID().slice(0, 4)}`, tag())).body as ClubDetails;
  const blue = (await found(ba.token, `Blue Battle ${randomUUID().slice(0, 4)}`, tag())).body as ClubDetails;
  const battle = (token: string, id: string, kon = '2x2') => api(app.base, `/api/clubs/${id}/battle`, { method: 'POST', token, body: { kon } });
  // refusals: no gang, own gang, too few people, an unknown gang, a 1×1 «battle»
  assert.equal((await battle(loner.token, blue.id)).body.error.code, 'no_gang');
  assert.equal((await battle(ra.token, red.id)).body.error.code, 'own_gang');
  assert.equal((await battle(ra.token, blue.id)).body.error.code, 'too_few', 'one person a gang: no 2×2');
  assert.equal((await battle(ra.token, randomUUID())).status, 404);
  assert.equal((await battle(ra.token, blue.id, '1x1')).status, 400, '1×1 is not a gang battle');
  await join(red.id, ra, rb);
  await join(blue.id, ba, bb);
  assert.equal((await battle(ra.token, blue.id, '3x3')).body.error.code, 'too_few', 'two people a gang: no 3×3');
  // the call: the other three are online and hear it; the loner doesn't
  const ears = [rb, ba, bb, loner].map((p) => new Social(p.token));
  try {
    await Promise.all(ears.map((e) => e.next('ready')));
    const ok = await battle(ra.token, blue.id);
    assert.equal(ok.status, 201, ok.text);
    assert.deepEqual([ok.body.kon, ok.body.mode, ok.body.stake, ok.body.battle.red.id, ok.body.battle.blue.id, ok.body.battle.red.tag], ['2x2', 'teams', 0, red.id, blue.id, red.tag]);
    assert.equal(ok.body.told, 3, 'the caller’s gang-mate and both people of the other gang');
    assert.match(ok.body.inviteCode, /^[A-Za-z0-9]{6,16}$/);
    for (const e of ears.slice(0, 3)) {
      const ev = await e.next('invite');
      assert.deepEqual([ev.invite.roomId, ev.invite.battle?.format, ev.invite.battle?.red.id, ev.invite.battle?.blue.id, ev.invite.from.name.startsWith('Redhead')], [ok.body.roomId, '2x2', red.id, blue.id, true]);
    }
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(ears[3]!.events.filter((e) => e.type === 'invite').length, 0, 'nobody outside the two gangs is called');
    // the room: GET says it's a battle; the gateway turns the loner away, takes a gang's person on its side
    const info = await api(app.base, `/api/rooms/${ok.body.roomId}`, { token: loner.token });
    assert.deepEqual([info.body.kon, info.body.battle?.blue.id], ['2x2', blue.id]);
    // so does the invitation: a stranger's app can say who is fighting before connecting
    const inv = await api(app.base, `/api/invites/${ok.body.inviteCode}`);
    assert.deepEqual([inv.body.status, inv.body.battle?.red.id, inv.body.battle?.blue.tag], ['joinable', red.id, blue.tag]);
    const hello = (token: string) =>
      new Promise<ServerMessage>((resolve) => {
        const ws = new WebSocket(`${app.wsBase}/ws`);
        ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', protocol: PROTOCOL_VERSION, token, roomId: ok.body.roomId, character: 'petya', clientVersion: 'test' })));
        ws.on('message', (d, binary) => {
          if (binary) return;
          const m = JSON.parse(String(d)) as ServerMessage;
          if (m.type === 'error' || m.type === 'roster') {
            resolve(m);
            ws.close();
          }
        });
      });
    const out = await hello(loner.token);
    assert.deepEqual([out.type, out.type === 'error' ? out.code : null], ['error', 'battle_gang']);
    const inBlue = await hello(bb.token);
    assert.equal(inBlue.type, 'roster');
    if (inBlue.type === 'roster') {
      assert.equal(inBlue.players.find((p) => p.id === bb.userId)?.team, 1, 'the other gang plays blue');
      assert.equal(inBlue.battle?.red.id, red.id);
    }
  } finally {
    for (const e of ears) e.close();
  }
});
