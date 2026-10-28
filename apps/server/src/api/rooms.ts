/** Room creation, quick match and invitation resolution. */
import { CreateRoomRequest, QuickMatchRequest, getMap } from '@blatkom/shared';
import type { CreateRoomResponse, InviteInfo, QuickMatchResponse } from '@blatkom/shared';
import { STAKE_REFUSAL_TEXT } from '../rooms/MatchRoom.js';
import type { RouteModule } from '../app.js';
import { HttpError } from '../http/router.js';
import { requireUser, currentUser } from '../http/auth.js';
import { RateLimiter, rateLimit } from '../security/rateLimit.js';

/**
 * Invitation links. In Telegram: straight into the game with a direct-link app (`/newapp`, short name in
 * TELEGRAM_MINIAPP_SHORT_NAME); otherwise through the bot — `?start=<code>` opens the chat, «Start» sends
 * `/start <code>` and the bot answers with a «join the room» button (telegram/bot.ts), which needs no
 * Mini App set up in BotFather.
 */
export function inviteUrls(env: { PUBLIC_URL: string; TELEGRAM_BOT_USERNAME?: string; TELEGRAM_MINIAPP_SHORT_NAME?: string }, code: string) {
  const web = `${env.PUBLIC_URL.replace(/\/$/, '')}/?invite=${encodeURIComponent(code)}`;
  const tg = env.TELEGRAM_BOT_USERNAME
    ? env.TELEGRAM_MINIAPP_SHORT_NAME
      ? `https://t.me/${env.TELEGRAM_BOT_USERNAME}/${env.TELEGRAM_MINIAPP_SHORT_NAME}?startapp=${encodeURIComponent(code)}`
      : `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=${encodeURIComponent(code)}`
    : null;
  return { web, tg };
}

export const registerRoomRoutes: RouteModule = (router, { env, services, rooms }) => {
  const auth = requireUser(services.sessions);
  const createLimiter = new RateLimiter(10, 0.2);
  const lookupLimiter = new RateLimiter(60, 2);

  /** v0.2.17: a stake is for tournament rooms only, and the player has to be able to stake it now. */
  const stakeFor = async (userId: string, kon: unknown, stake: number | undefined): Promise<number> => {
    const s = stake ?? 0;
    if (s <= 0) return 0;
    if (!kon) throw new HttpError(400, 'validation_error', 'stake: tournament rooms only');
    const why = services.stakes ? await services.stakes.check(userId, s) : 'stakes_off';
    if (why) throw new HttpError(409, why, STAKE_REFUSAL_TEXT[why]);
    return s;
  };

  router.post('/api/rooms', auth, rateLimit(createLimiter, (ctx) => currentUser(ctx).userId), async (ctx) => {
    const user = currentUser(ctx);
    const body = await ctx.body(CreateRoomRequest);
    const stake = await stakeFor(user.userId, body.kon, body.stake);
    let room;
    try {
      room = rooms.create(body.mapId, body.isPrivate, user.userId, null, body.mode, body.kon ?? null, stake);
    } catch {
      throw new HttpError(503, 'capacity', 'The server is full, try again later');
    }
    let inviteCode: string | null = null;
    let inviteUrl: string | null = null;
    let webUrl = `${env.PUBLIC_URL.replace(/\/$/, '')}/?room=${room.id}`;
    if (body.isPrivate) {
      const inv = await services.invites.create(room.id, user.userId);
      inviteCode = inv.code;
      room.inviteCode = inv.code;
      const urls = inviteUrls(env, inv.code);
      inviteUrl = urls.tg ?? urls.web;
      webUrl = urls.web;
      services.analytics.server('invite_created', { code: inv.code, roomId: room.id }, user);
    }
    const res: CreateRoomResponse = { roomId: room.id, inviteCode, inviteUrl, webUrl, mapId: room.mapId, mode: room.mode, kon: room.kon, stake: room.stake };
    ctx.json(201, res);
  });

  router.post('/api/rooms/quick', auth, rateLimit(lookupLimiter, (ctx) => currentUser(ctx).userId), async (ctx) => {
    const user = currentUser(ctx);
    const body = await ctx.body(QuickMatchRequest);
    const stake = await stakeFor(user.userId, body.kon, body.stake);
    const room = body.kon ? rooms.konQuick(user.userId, body.kon, body.mapId, stake) : rooms.quickMatch(user.userId, body.mapId, body.mode);
    const res: QuickMatchResponse = { roomId: room.id, mapId: room.mapId, mode: room.mode, kon: room.kon, stake: room.stake };
    ctx.json(200, res);
  });

  router.get('/api/rooms/:id', auth, (ctx) => {
    const room = rooms.get(ctx.params.id ?? '');
    if (!room) throw new HttpError(404, 'room_not_found', 'Room not found');
    const user = currentUser(ctx);
    ctx.json(200, { ...room.publicInfo(), joinable: room.isJoinable(user.userId), mapName: getMap(room.mapId).name });
  });

  router.get('/api/invites/:code', rateLimit(lookupLimiter), async (ctx) => {
    const code = ctx.params.code ?? '';
    if (!/^[A-Za-z0-9]{6,16}$/.test(code)) throw new HttpError(400, 'bad_code', 'Invalid invitation code');
    const resolved = await services.invites.resolve(code);
    let info: InviteInfo = { code, status: 'not_found', roomId: null, mapId: null, mode: null, players: 0, maxPlayers: 0, hostName: null, kon: null, stake: 0 };
    if (resolved) {
      const room = rooms.get(resolved.roomId);
      if (!room) info = { ...info, status: 'expired' };
      else {
        const phase = room.phase;
        const status: InviteInfo['status'] = room.occupancy >= room.config.maxPlayers ? 'full' : phase === 'finished' ? 'finished' : phase === 'waiting' ? 'joinable' : room.isJoinable() ? 'in_progress' : 'full';
        info = { code, status, roomId: room.id, mapId: room.mapId, mode: room.mode, players: room.lineup, maxPlayers: room.config.maxPlayers, hostName: room.hostName(), kon: room.kon, stake: room.stake, battle: room.battle };
      }
    }
    ctx.json(200, info);
  });
};
