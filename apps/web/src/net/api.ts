/** HTTP API client (same origin). Never handles secrets other than the player's own session token. */
import type { AuthResponse, CreateRoomResponse, InviteInfo, MapId, PublicProfile, CharacterId, MatchHistoryResponse, AchievementsResponse } from '@blatkom/shared';
import { platform } from '../telegram/tg.js';
import { VERSION } from '../app/config.js';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const MESSAGES: Record<string, string> = {
  unauthorized: 'Сессия устарела. Перезапустите игру.',
  rate_limited: 'Слишком часто. Подождите немного.',
  capacity: 'Сервер переполнен, попробуйте позже.',
  room_not_found: 'Комната не найдена.',
};

export class Api {
  token: string | null = null;

  async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(path.replace(/^\//, ''), {
        method,
        headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(this.token ? { authorization: `Bearer ${this.token}` } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError(0, 'network', 'Нет связи с сервером. Проверьте интернет.');
    }
    if (res.status === 204) return undefined as T;
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      /* non-JSON */
    }
    if (!res.ok) {
      const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
      const code = err?.code ?? `http_${res.status}`;
      throw new ApiError(res.status, code, MESSAGES[code] ?? err?.message ?? `Ошибка сервера (${res.status})`);
    }
    return data as T;
  }

  authTelegram(initData: string) {
    return this.req<AuthResponse>('POST', '/api/auth/telegram', { initData, platform: platform(), clientVersion: VERSION });
  }
  authDev(name: string, deviceId: string) {
    return this.req<AuthResponse>('POST', '/api/auth/dev', { name, deviceId, platform: platform(), clientVersion: VERSION });
  }
  logout() {
    return this.req<void>('POST', '/api/auth/logout', {});
  }
  me() {
    return this.req<PublicProfile>('GET', '/api/me');
  }
  updateMe(patch: { displayName?: string; preferredCharacter?: CharacterId }) {
    return this.req<PublicProfile>('PATCH', '/api/me', patch);
  }
  history() {
    return this.req<MatchHistoryResponse>('GET', '/api/me/history');
  }
  achievements() {
    return this.req<AchievementsResponse>('GET', '/api/me/achievements');
  }
  deleteAccount() {
    return this.req<void>('DELETE', '/api/me');
  }
  createRoom(mapId: MapId, isPrivate: boolean) {
    return this.req<CreateRoomResponse>('POST', '/api/rooms', { mapId, isPrivate });
  }
  quickMatch(mapId?: MapId) {
    return this.req<{ roomId: string; mapId: MapId }>('POST', '/api/rooms/quick', mapId ? { mapId } : {});
  }
  invite(code: string) {
    return this.req<InviteInfo>('GET', `/api/invites/${encodeURIComponent(code)}`);
  }
}
