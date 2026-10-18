import type { WorldEvent, PlayerState } from '@blatkom/shared';
import { WEAPONS, availableWeapons } from '@blatkom/shared';
import type { RenderPlayer, SessionEvent } from './types.js';

export function worldEventToSession(e: WorldEvent, players: Map<number, PlayerState> | null, predicted = false): SessionEvent | null {
  switch (e.t) {
    case 'shot': {
      const p = players?.get(e.shooter);
      const aim = p ? p.aim : (e.pellets[0]?.angle ?? 0);
      return { t: 'shot', shooter: e.shooter, weapon: e.weapon, ox: e.ox, oy: e.oy, aim, pellets: e.pellets, predicted };
    }
    case 'melee':
      return { t: 'melee', shooter: e.shooter, angle: e.angle, hit: e.hit, predicted };
    default:
      return e as SessionEvent;
  }
}

export function toRenderPlayer(p: PlayerState, isLocal: boolean, now: number): RenderPlayer {
  return {
    slot: p.slot,
    id: p.id,
    name: p.name,
    character: p.character,
    isLocal,
    isBot: p.isBot,
    x: p.x,
    y: p.y,
    vx: p.vx,
    vy: p.vy,
    aim: p.aim,
    hp: p.hp,
    alive: p.alive,
    weapon: p.weapon,
    reloading: p.reloadWeapon !== null,
    invulnerable: now < p.invulnUntil,
    walking: p.walking,
    connected: p.connected,
    kills: p.kills,
    assists: p.assists,
    deaths: p.deaths,
    score: p.score,
    level: null,
  };
}

export function reloadProgress(p: PlayerState): number {
  if (!p.reloadWeapon) return 0;
  const total = WEAPONS[p.reloadWeapon].reloadMs;
  return Math.max(0, Math.min(1, 1 - (p.reloadUntil - p.clock) / total));
}

export { availableWeapons };
