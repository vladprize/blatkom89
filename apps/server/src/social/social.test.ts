/**
 * Social features against PostgreSQL and the real gateway: unique aliases, friends (requests,
 * acceptance, presence), direct messages, room invitations over the social WebSocket, rating and the
 * Top-100 leaderboard, account deletion.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import { PROTOCOL_VERSION, RATING_RULES, ratingDelta } from '@blatkom/shared';
import type { SocialEvent } from '@blatkom/shared';
import { startTestApp, api, devLogin } from '../admin/testkit.js';
import type { TestApp } from '../admin/testkit.js';
import { pgContext } from '../services/persistence.js';
import { silentLogger } from '../logging/logger.js';

let app: TestApp;
before(async () => {
  app = await startTestApp();
});
after(async () => {
  await app.close();
});

/** A social socket that records events. */
class Social {
  readonly ws: WebSocket;
  readonly events: SocialEvent[] = [];
  private waiters: Array<() => void> = [];
  constructor(token: string) {
    this.ws = new WebSocket(`${app.wsBase}/ws/social`);
    this.ws.on('open', () => this.ws.send(JSON.stringify({ type: 'auth', token })));
    this.ws.on('message', (d) => {
      this.events.push(JSON.parse(String(d)) as SocialEvent);
      const w = this.waiters;
      this.waiters = [];
      for (const f of w) f();
    });
    this.ws.on('error', () => {});
  }
  async next<K extends SocialEvent['type']>(type: K, pred: (e: Extract<SocialEvent, { type: K }>) => boolean = () => true, timeoutMs = 4000): Promise<Extract<SocialEvent, { type: K }>> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const hit = this.events.find((e): e is Extract<SocialEvent, { type: K }> => e.type === type && pred(e as Extract<SocialEvent, { type: K }>));
      if (hit) return hit;
      if (Date.now() > deadline) throw new Error(`no ${type} event; got ${JSON.stringify(this.events).slice(0, 300)}`);
      await new Promise<void>((r) => {
        const t = setTimeout(r, 100);
        this.waiters.push(() => {
          clearTimeout(t);
          r();
        });
      });
    }
  }
  close() {
    this.ws.close();
  }
}

const friends = (token: string) => api(app.base, '/api/friends', { token });
const request = (token: string, name: string) => api(app.base, '/api/friends/request', { method: 'POST', token, body: { name } });

test('aliases are unique (any letter case): new accounts get a number, renames to a taken alias are refused with free suggestions', async () => {
  const a = await devLogin(app.base, 'Петя Уникум');
  const b = await devLogin(app.base, 'Петя Уникум');
  const pa = await api(app.base, '/api/me', { token: a.token });
  const pb = await api(app.base, '/api/me', { token: b.token });
  assert.equal(pa.body.displayName, 'Петя Уникум');
  assert.equal(pb.body.displayName, 'Петя Уникум 2', 'a second account with the same name gets a number');
  const taken = await api(app.base, '/api/me', { method: 'PATCH', token: b.token, body: { displayName: 'петя уникум' } });
  assert.equal(taken.status, 409);
  assert.equal(taken.body.error.code, 'name_taken');
  const own = await api(app.base, '/api/me', { method: 'PATCH', token: a.token, body: { displayName: 'ПЕТЯ уникум' } });
  assert.equal(own.status, 200, 'changing the case of your own alias is fine');
  const check = await api(app.base, `/api/names/check?name=${encodeURIComponent('Петя Уникум')}`, { token: b.token });
  assert.equal(check.status, 200);
  assert.equal(check.body.available, false);
  assert.ok(check.body.suggestions.length >= 2);
  for (const s of check.body.suggestions) {
    const c = await api(app.base, `/api/names/check?name=${encodeURIComponent(s)}`, { token: b.token });
    assert.equal(c.body.available, true, `${s} is free`);
  }
  const free = await api(app.base, `/api/names/check?name=${encodeURIComponent('Совсем Новый')}`, { token: b.token });
  assert.deepEqual([free.body.available, free.body.suggestions], [true, []]);
  const bad = await api(app.base, `/api/names/check?name=${encodeURIComponent('<script>')}`, { token: b.token });
  assert.equal(bad.status, 400);
  // guests: the temporary name of a new browser gets a number too
  const g1 = await api(app.base, '/api/auth/guest', { method: 'POST', body: { name: 'Comrade_ABC', deviceId: randomUUID().replace(/-/g, '') } });
  const g2 = await api(app.base, '/api/auth/guest', { method: 'POST', body: { name: 'Comrade_ABC', deviceId: randomUUID().replace(/-/g, '') } });
  assert.equal(g1.status, 200, g1.text);
  assert.equal(g2.body.profile.displayName, 'Comrade_ABC 2');
});

test('friends: a request by alias, live notice, acceptance; mutual requests; refusals', async () => {
  const a = await devLogin(app.base, 'Друг Первый');
  const b = await devLogin(app.base, 'Друг Второй');
  const sb = new Social(b.token);
  await sb.next('ready');
  const r = await request(a.token, 'друг второй');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.result, 'sent');
  const ev = await sb.next('friend_request');
  assert.equal(ev.from.name, 'Друг Первый');
  assert.equal((await friends(b.token)).body.incoming[0].id, a.userId);
  assert.equal((await friends(a.token)).body.outgoing[0].id, b.userId);
  assert.equal((await request(a.token, 'Друг Второй')).body.error.code, 'already_sent');
  const sa = new Social(a.token);
  await sa.next('ready');
  const acc = await api(app.base, `/api/friends/${a.userId}/accept`, { method: 'POST', token: b.token });
  assert.equal(acc.status, 200, acc.text);
  const accepted = await sa.next('friend_accepted');
  assert.equal(accepted.friend.id, b.userId);
  assert.equal(accepted.friend.status, 'online', 'B has the game open');
  const fa = (await friends(a.token)).body;
  assert.deepEqual(fa.friends.map((f: { id: string }) => f.id), [b.userId]);
  assert.equal(fa.friends[0].status, 'online');
  assert.equal((await request(a.token, 'Друг Второй')).body.error.code, 'already_friends');
  assert.equal((await request(a.token, 'Друг Первый')).status, 400, 'not yourself');
  assert.equal((await request(a.token, 'Никого Нет Такого')).status, 404);
  // two players asking each other: the second request is a yes
  const c = await devLogin(app.base, 'Друг Третий');
  assert.equal((await request(c.token, 'Друг Первый')).body.result, 'sent');
  const mutual = await request(a.token, 'Друг Третий');
  assert.equal(mutual.body.result, 'accepted');
  assert.equal((await friends(c.token)).body.friends[0].id, a.userId);
  // presence: B goes offline, A's list says so; A's open window hears it
  sb.close();
  await sa.next('presence', (e) => e.userId === b.userId && e.status === 'offline', 6000);
  assert.equal((await friends(a.token)).body.friends.find((f: { id: string }) => f.id === b.userId).status, 'offline');
  // unfriend: both sides lose it, the other side hears it
  const sc = new Social(c.token);
  await sc.next('ready');
  assert.equal((await api(app.base, `/api/friends/${c.userId}`, { method: 'DELETE', token: a.token })).status, 200);
  await sc.next('friend_removed', (e) => e.userId === a.userId);
  assert.equal((await friends(c.token)).body.friends.length, 0);
  sa.close();
  sc.close();
});

test('direct messages: only between friends, live delivery, unread counts and read receipts, validation', async () => {
  const a = await devLogin(app.base, 'Писатель');
  const b = await devLogin(app.base, 'Читатель');
  const stranger = await devLogin(app.base, 'Незнакомец');
  await request(a.token, 'Читатель');
  await api(app.base, `/api/friends/${a.userId}/accept`, { method: 'POST', token: b.token });
  const sb = new Social(b.token);
  await sb.next('ready');
  const sent = await api(app.base, `/api/messages/${b.userId}`, { method: 'POST', token: a.token, body: { text: '  Здорово!\u0007 Как дела?  ' } });
  assert.equal(sent.status, 200, sent.text);
  assert.equal(sent.body.message.text, 'Здорово! Как дела?', 'trimmed, control characters dropped');
  const dm = await sb.next('dm');
  assert.equal(dm.message.text, 'Здорово! Как дела?');
  assert.equal(dm.from.name, 'Писатель');
  const fb = (await friends(b.token)).body.friends[0];
  assert.equal(fb.unread, 1);
  const conv = await api(app.base, `/api/messages/${a.userId}`, { token: b.token });
  assert.deepEqual(conv.body.messages.map((m: { text: string }) => m.text), ['Здорово! Как дела?']);
  const sa = new Social(a.token);
  await sa.next('ready');
  const read = await api(app.base, `/api/messages/${a.userId}/read`, { method: 'POST', token: b.token });
  assert.ok(read.body.upTo > 0);
  await sa.next('dm_read', (e) => e.by === b.userId);
  assert.equal((await friends(b.token)).body.friends[0].unread, 0);
  assert.equal((await api(app.base, `/api/messages/${b.userId}`, { method: 'POST', token: stranger.token, body: { text: 'привет' } })).status, 403, 'strangers cannot write');
  assert.equal((await api(app.base, `/api/messages/${a.userId}`, { token: stranger.token })).status, 403);
  assert.equal((await api(app.base, `/api/messages/${b.userId}`, { method: 'POST', token: a.token, body: { text: '   ' } })).status, 400);
  assert.equal((await api(app.base, `/api/messages/${b.userId}`, { method: 'POST', token: a.token, body: { text: 'x'.repeat(501) } })).status, 400);
  assert.equal((await api(app.base, '/api/messages/not-a-uuid', { method: 'POST', token: a.token, body: { text: 'x' } })).status, 400);
  // paging: the newest 50 (oldest first), older ones with `before`
  await app.db.sql`INSERT INTO direct_messages (sender_id, recipient_id, body) SELECT ${a.userId}, ${b.userId}, 'старое ' || g FROM generate_series(1, 60) g`;
  const page = await api(app.base, `/api/messages/${a.userId}`, { token: b.token });
  assert.equal(page.body.messages.length, 50);
  assert.equal(page.body.more, true);
  assert.ok(page.body.messages.at(-1).id > page.body.messages[0].id, 'oldest first');
  const older = await api(app.base, `/api/messages/${a.userId}?before=${page.body.messages[0].id}`, { token: b.token });
  assert.equal(older.body.messages.length, 11, '61 messages in all');
  assert.equal(older.body.more, false);
  assert.equal(older.body.messages[0].text, 'Здорово! Как дела?');
  sa.close();
  sb.close();
});

test('invitations: a friend in your room gets a live invite with the room; strangers and outsiders are refused', async () => {
  const a = await devLogin(app.base, 'Зазывала');
  const b = await devLogin(app.base, 'Приглашённый');
  const c = await devLogin(app.base, 'Посторонний');
  await request(a.token, 'Приглашённый');
  await api(app.base, `/api/friends/${a.userId}/accept`, { method: 'POST', token: b.token });
  const room = await api(app.base, '/api/rooms', { method: 'POST', token: a.token, body: { mapId: 'factory', isPrivate: true, mode: 'ctf' } });
  assert.equal(room.status, 201);
  const outside = await api(app.base, `/api/friends/${b.userId}/invite`, { method: 'POST', token: a.token, body: { roomId: room.body.roomId } });
  assert.equal(outside.body.error.code, 'not_in_room', 'you invite from the room you are in');
  const ws = new WebSocket(`${app.wsBase}/ws`);
  await new Promise<void>((r) => ws.on('open', () => r()));
  ws.send(JSON.stringify({ type: 'hello', protocol: PROTOCOL_VERSION, token: a.token, roomId: room.body.roomId, character: 'petya', clientVersion: 'test' }));
  await new Promise<void>((r) => ws.once('message', () => r()));
  const sb = new Social(b.token);
  await sb.next('ready');
  // A is in the lobby: B's friends list says so
  assert.equal((await friends(b.token)).body.friends[0].status, 'lobby');
  const inv = await api(app.base, `/api/friends/${b.userId}/invite`, { method: 'POST', token: a.token, body: { roomId: room.body.roomId } });
  assert.equal(inv.status, 200, inv.text);
  assert.equal(inv.body.delivered, true);
  const ev = await sb.next('invite');
  assert.deepEqual([ev.invite.roomId, ev.invite.mode, ev.invite.mapId, ev.invite.isPrivate, ev.invite.from.name], [room.body.roomId, 'ctf', 'factory', true, 'Зазывала']);
  assert.equal((await api(app.base, `/api/friends/${c.userId}/invite`, { method: 'POST', token: a.token, body: { roomId: room.body.roomId } })).status, 403, 'only friends');
  sb.close();
  await new Promise((r) => setTimeout(r, 300));
  const offline = await api(app.base, `/api/friends/${b.userId}/invite`, { method: 'POST', token: a.token, body: { roomId: room.body.roomId } });
  assert.deepEqual([offline.status, offline.body.delivered], [200, false], 'nobody to deliver to when the friend is offline');
  ws.close();
});

test('rating and the Top-100: places move the rating, the table ranks by rating, level and eliminations', async () => {
  const top = await devLogin(app.base, 'Чемпион');
  const low = await devLogin(app.base, 'Новобранец');
  const idle = await devLogin(app.base, 'Без Матчей');
  const rec = pgContext(app.db.sql, app.env, silentLogger).recorder;
  const now = Date.now();
  const part = (userId: string, place: number, kills: number) => ({ userId, character: 'petya' as const, place, kills, assists: 0, deaths: 1, score: kills * 2, damageDealt: 0, completed: true, viaInvite: false, team: null, playtimeMs: 60_000 });
  const res = await rec.matchCompleted({
    matchId: randomUUID(),
    roomId: 'room123456',
    mapId: 'factory',
    mode: 'ffa',
    winnerTeam: null,
    isPrivate: false,
    startedAt: new Date(now - 90_000),
    endedAt: new Date(now),
    durationMs: 90_000,
    endReason: 'time',
    playersAtEnd: 4,
    peopleAtEnd: 2,
    fillAtEnd: 2,
    participants: [part(top.userId, 1, 9), part(low.userId, 4, 1)],
  });
  const first = ratingDelta({ place: 1, playersAtEnd: 4, completed: true });
  const last = ratingDelta({ place: 4, playersAtEnd: 4, completed: true });
  assert.deepEqual([first, last], [16, -16]);
  assert.deepEqual([res.get(top.userId)!.ratingDelta, res.get(top.userId)!.rating], [first, RATING_RULES.start + first]);
  assert.equal(res.get(low.userId)!.rating, RATING_RULES.start + last);
  const hist = await api(app.base, '/api/me/history', { token: top.token });
  assert.equal(hist.body.matches[0].ratingDelta, first);
  assert.equal((await api(app.base, '/api/me', { token: top.token })).body.rating, RATING_RULES.start + first);
  const lb = await api(app.base, '/api/leaderboard?by=rating', { token: idle.token });
  assert.equal(lb.status, 200);
  const names = lb.body.entries.map((e: { name: string }) => e.name);
  assert.ok(names.indexOf('Чемпион') >= 0 && names.indexOf('Чемпион') < names.indexOf('Новобранец'));
  assert.ok(!names.includes('Без Матчей'), 'players without a finished match are not ranked');
  assert.equal(lb.body.me, null);
  const mine = await api(app.base, '/api/leaderboard?by=kills', { token: low.token });
  assert.equal(mine.body.by, 'kills');
  assert.equal(mine.body.me.name, 'Новобранец');
  assert.ok(mine.body.me.rank >= 2);
  assert.ok(mine.body.entries.every((_e: unknown, i: number, arr: Array<{ kills: number }>) => i === 0 || arr[i - 1]!.kills >= arr[i]!.kills));
  // places are distinct (ties go to the other measure, then the older account) and «me» matches the table
  assert.deepEqual(mine.body.entries.map((e: { rank: number }) => e.rank), mine.body.entries.map((_: unknown, i: number) => i + 1));
  assert.equal(mine.body.entries.find((e: { name: string }) => e.name === 'Новобранец').rank, mine.body.me.rank);
  const topMe = await api(app.base, '/api/leaderboard?by=rating', { token: top.token });
  assert.equal(topMe.body.entries.find((e: { name: string }) => e.name === 'Чемпион').rank, topMe.body.me.rank);
  const lvl = await api(app.base, '/api/leaderboard?by=level', { token: low.token });
  assert.equal(lvl.body.entries[0].rank, 1);
  // a leaver loses rating; the rating never goes below zero
  assert.equal(ratingDelta({ place: 1, playersAtEnd: 4, completed: false }), RATING_RULES.leaver);
  assert.deepEqual(
    (['win', 'loss', 'draw'] as const).map((o) => ratingDelta({ place: 1, playersAtEnd: 6, completed: true, teamOutcome: o })),
    [RATING_RULES.team, -RATING_RULES.team, 0],
  );
});

test('deleting an account removes its friendships and messages', async () => {
  const a = await devLogin(app.base, 'Остаётся');
  const b = await devLogin(app.base, 'Уходит');
  await request(a.token, 'Уходит');
  await api(app.base, `/api/friends/${a.userId}/accept`, { method: 'POST', token: b.token });
  await api(app.base, `/api/messages/${a.userId}`, { method: 'POST', token: b.token, body: { text: 'пока' } });
  assert.equal((await api(app.base, '/api/me', { method: 'DELETE', token: b.token })).status, 200);
  assert.equal((await friends(a.token)).body.friends.length, 0);
  const [n] = await app.db.sql<Array<{ n: number }>>`SELECT count(*)::int AS n FROM direct_messages WHERE sender_id = ${b.userId} OR recipient_id = ${b.userId}`;
  assert.equal(n!.n, 0);
});
