import type { GadgetState, WorldEvent, PlayerState } from '@blatkom/shared';
import { availableWeapons, weaponFor } from '@blatkom/shared';
import type { RenderGadget, RenderPlayer, SessionEvent } from './types.js';

export function worldEventToSession(e: WorldEvent, players: Map<number, PlayerState> | null, predicted = false): SessionEvent | null {
  switch (e.t) {
    case 'shot': {
      const p = players?.get(e.shooter);
      const aim = p ? p.aim : (e.pellets[0]?.angle ?? 0);
      if (e.turret) return { t: 'shot', shooter: e.shooter, weapon: e.weapon, ox: e.ox, oy: e.oy, aim: e.pellets[0]?.angle ?? 0, pellets: e.pellets, predicted, turret: true };
      return { t: 'shot', shooter: e.shooter, weapon: e.weapon, ox: e.ox, oy: e.oy, aim, pellets: e.pellets, predicted, silenced: e.silenced === true };
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
    laser: p.mods[p.weapon]?.includes('laser') ?? false,
    flashedMs: Math.max(0, p.flashedUntil - now),
    team: p.team,
    objectives: p.objectives,
  };
}

export function toRenderGadget(g: GadgetState, now: number): RenderGadget {
  const left = g.phase === 'active' || (g.phase === 'armed' && now >= g.fuseAt) ? g.endsAt - now : g.fuseAt - now;
  return { id: g.id, kind: g.kind, owner: g.ownerSlot, phase: g.phase, triggered: g.triggeredAt > 0, x: g.x, y: g.y, aim: g.aim, hp: g.hp, leftMs: Math.max(0, left) };
}

export function reloadProgress(p: PlayerState): number {
  if (!p.reloadWeapon) return 0;
  const total = weaponFor(p, p.reloadWeapon).reloadMs;
  return Math.max(0, Math.min(1, 1 - (p.reloadUntil - p.clock) / total));
}

export { availableWeapons };
