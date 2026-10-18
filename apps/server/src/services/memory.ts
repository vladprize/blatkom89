/** In-memory implementations of the service contracts (tests and local experiments). */
import { randomBytes } from 'node:crypto';
import { levelForXp, xpForMatch } from '@blatkom/shared';
import type { PersonalResult } from '@blatkom/shared';
import type { Analytics, AuthedUser, InviteRegistry, MatchCompletion, MatchRecorder, MatchStart, Services, SessionVerifier } from './contracts.js';

export class MemorySessions implements SessionVerifier {
  readonly tokens = new Map<string, AuthedUser>();
  issue(user: Omit<AuthedUser, 'sessionId'> & { sessionId?: string }): string {
    const token = randomBytes(24).toString('base64url');
    this.tokens.set(token, { sessionId: user.sessionId ?? randomBytes(8).toString('hex'), ...user });
    return token;
  }
  async verify(token: string) {
    return this.tokens.get(token) ?? null;
  }
}

export class MemoryRecorder implements MatchRecorder {
  readonly started: MatchStart[] = [];
  readonly completed = new Map<string, MatchCompletion>();
  readonly abandoned: string[] = [];
  readonly xp = new Map<string, number>();
  async matchStarted(m: MatchStart) {
    this.started.push(m);
  }
  async matchCompleted(m: MatchCompletion) {
    const out = new Map<string, PersonalResult>();
    const first = !this.completed.has(m.matchId);
    if (first) this.completed.set(m.matchId, m);
    for (const p of m.participants) {
      const gained = first ? xpForMatch({ kills: p.kills, assists: p.assists, deaths: p.deaths, place: p.place, playersAtEnd: m.playersAtEnd, completed: p.completed, withFriends: p.viaInvite && m.playersAtEnd > 1 }) : 0;
      const total = (this.xp.get(p.userId) ?? 0) + gained;
      this.xp.set(p.userId, total);
      out.set(p.userId, { xpGained: gained, totalXp: total, level: levelForXp(total).level, leveledUp: false, newAchievements: [] });
    }
    return out;
  }
  async matchAbandoned(id: string) {
    this.abandoned.push(id);
  }
}

export class MemoryInvites implements InviteRegistry {
  readonly codes = new Map<string, { roomId: string; expiresAt: Date }>();
  async create(roomId: string) {
    const code = randomBytes(6).toString('base64url').replace(/[^A-Za-z0-9]/g, 'x').slice(0, 8);
    const expiresAt = new Date(Date.now() + 6 * 3600_000);
    this.codes.set(code, { roomId, expiresAt });
    return { code, expiresAt };
  }
  async resolve(code: string) {
    const c = this.codes.get(code);
    return c && c.expiresAt > new Date() ? { roomId: c.roomId } : null;
  }
}

export class MemoryAnalytics implements Analytics {
  readonly events: Array<{ name: string; props: Record<string, unknown> }> = [];
  readonly errors: Array<Record<string, unknown>> = [];
  server(name: string, props: Record<string, unknown>) {
    this.events.push({ name, props });
  }
  error(e: Record<string, unknown>) {
    this.errors.push(e);
  }
}

export function memoryServices(): Services & { sessions: MemorySessions; recorder: MemoryRecorder; invites: MemoryInvites; analytics: MemoryAnalytics } {
  return { sessions: new MemorySessions(), recorder: new MemoryRecorder(), invites: new MemoryInvites(), analytics: new MemoryAnalytics() };
}
