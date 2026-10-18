/**
 * WebSocket gateway: upgrades `/ws`, enforces origin & connection limits, authenticates the first
 * `hello` message and hands the socket to its room.
 */
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import { ClientMessageSchema, WS_CLOSE, PROTOCOL_VERSION } from '@blatkom/shared';
import type { RoomManager } from './RoomManager.js';
import type { Services } from '../services/contracts.js';
import type { Logger } from '../logging/logger.js';

export interface GatewayOptions {
  allowedOrigins: string[];
  publicUrl: string;
  maxConnectionsPerIp: number;
  trustProxy: boolean;
}

export function attachGateway(server: Server, rooms: RoomManager, services: Services, log: Logger, opts: GatewayOptions): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
  const alive = new WeakMap<WebSocket, boolean>();
  const perIp = new Map<string, number>();
  const selfOrigin = new URL(opts.publicUrl).origin;
  const allowed = new Set([selfOrigin, ...opts.allowedOrigins]);

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    const origin = req.headers.origin;
    const host = req.headers.host;
    const sameHost = origin && host && new URL(origin).host === host;
    if (origin && !allowed.has(origin) && !sameHost) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    const ip = (opts.trustProxy ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim() : '') || req.socket.remoteAddress || 'unknown';
    const n = perIp.get(ip) ?? 0;
    if (n >= opts.maxConnectionsPerIp) {
      socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      perIp.set(ip, n + 1);
      alive.set(ws, true);
      ws.on('pong', () => alive.set(ws, true));
      ws.on('close', () => {
        const left = (perIp.get(ip) ?? 1) - 1;
        if (left <= 0) perIp.delete(ip);
        else perIp.set(ip, left);
      });
      handleSocket(ws);
    });
  });

  function handleSocket(ws: WebSocket) {
    let joined = false;
    const helloTimer = setTimeout(() => {
      if (!joined) ws.close(WS_CLOSE.UNAUTHORIZED, 'hello timeout');
    }, 8000);
    ws.on('error', () => {});
    const onFirst = async (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
      if (joined) return;
      if (isBinary) return ws.close(WS_CLOSE.POLICY, 'expected hello');
      let msg;
      try {
        const raw = Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data);
        msg = ClientMessageSchema.safeParse(JSON.parse(raw.toString('utf8')));
      } catch {
        return ws.close(WS_CLOSE.POLICY, 'bad hello');
      }
      if (!msg.success || msg.data.type !== 'hello') {
        // A wrong protocol version is reported explicitly so clients can ask the user to reload.
        ws.send(JSON.stringify({ type: 'error', code: 'version_mismatch', message: `protocol ${PROTOCOL_VERSION} required` }));
        return ws.close(WS_CLOSE.POLICY, 'bad hello');
      }
      const hello = msg.data;
      ws.off('message', onFirst);
      const user = await services.sessions.verify(hello.token).catch(() => null);
      if (!user) {
        ws.send(JSON.stringify({ type: 'error', code: 'unauthorized', message: 'Сессия недействительна' }));
        return ws.close(WS_CLOSE.UNAUTHORIZED, 'unauthorized');
      }
      const room = rooms.get(hello.roomId);
      if (!room) {
        ws.send(JSON.stringify({ type: 'error', code: 'room_not_found', message: 'Комната не найдена' }));
        return ws.close(WS_CLOSE.ROOM_NOT_FOUND, 'room not found');
      }
      const viaInvite = room.isPrivate;
      const result = room.join(user, ws, hello.character, viaInvite);
      if (result === 'room_full' || result === 'room_closed') {
        ws.send(JSON.stringify({ type: 'error', code: result, message: result === 'room_full' ? 'Комната заполнена' : 'Матч завершён' }));
        return ws.close(result === 'room_full' ? WS_CLOSE.ROOM_FULL : WS_CLOSE.ROOM_CLOSED, result);
      }
      joined = true;
      clearTimeout(helloTimer);
      ws.on('message', (d, bin) => {
        try {
          room.onMessage(ws, d, bin);
        } catch (e) {
          log.error('message handling failed', { err: e as Error });
        }
      });
      ws.on('close', () => room.onSocketClose(ws));
    };
    ws.on('message', onFirst);
    ws.on('close', () => clearTimeout(helloTimer));
  }

  // keep-alive pings to detect dead connections
  const interval = setInterval(() => {
    for (const ws of wss.clients) {
      if (alive.get(ws) === false) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      try {
        ws.ping();
      } catch {
        /* ignore */
      }
    }
  }, 15_000);
  wss.on('close', () => clearInterval(interval));
  return wss;
}
