/**
 * Simple bot AI for offline practice (and future server-side fill). Bots only produce InputFrames,
 * exactly like human clients, so they obey every movement/weapon rule of the simulation.
 */
import { WEAPONS } from '../game-rules/weapons.js';
import type { WeaponId } from '../game-rules/weapons.js';
import { quantizeAngle, wrapAngle, angleDiff } from './math.js';
import { mulberry32 } from './rng.js';
import type { NavGrid } from './nav.js';
import type { InputFrame, PlayerState, World } from './world.js';
import { BTN } from './world.js';
import { TICK_DT } from '../constants/game.js';

export type BotDifficulty = 'easy' | 'normal' | 'hard';

const DIFFICULTY: Record<BotDifficulty, { reaction: number; aimError: number; turnRate: number; tolerance: number; vision: number }> = {
  easy: { reaction: 560, aimError: 0.17, turnRate: 4.5, tolerance: 0.28, vision: 420 },
  normal: { reaction: 360, aimError: 0.1, turnRate: 7, tolerance: 0.18, vision: 520 },
  hard: { reaction: 230, aimError: 0.055, turnRate: 10, tolerance: 0.11, vision: 620 },
};

/** Distance a bot tries to keep with the weapon in hand. */
function preferredRange(w: WeaponId): number {
  const d = WEAPONS[w];
  if (d.kind === 'melee') return 0;
  if (d.kind === 'projectile') return Math.max(170, (d.projectile?.radius ?? 60) * 2.6);
  if (d.pellets > 1) return Math.min(110, d.range * 0.35);
  if (d.range >= 900) return 380;
  return Math.min(260, d.range * 0.45);
}

export class BotBrain {
  private seq = 0;
  private aim = 0;
  private path: Array<{ x: number; y: number }> = [];
  private pathGoal: { x: number; y: number } | null = null;
  private repathAt = 0;
  private targetId: string | null = null;
  private targetSeenAt = 0;
  private lastSeen: { x: number; y: number; at: number } | null = null;
  private strafeDir = 1;
  private strafeUntil = 0;
  private aimNoise = 0;
  private aimNoiseAt = 0;
  private stuckCheck = { x: 0, y: 0, at: 0 };
  private roamGoal: { x: number; y: number } | null = null;
  private readonly rng: () => number;
  private readonly d: (typeof DIFFICULTY)[BotDifficulty];

  constructor(
    readonly id: string,
    private readonly world: World,
    private readonly nav: NavGrid,
    difficulty: BotDifficulty = 'normal',
    seed = 1,
  ) {
    this.rng = mulberry32(seed);
    this.d = DIFFICULTY[difficulty];
  }

  nextInput(): InputFrame {
    const now = this.world.time;
    const me = this.world.players.get(this.id);
    const frame: InputFrame = { seq: ++this.seq, moveX: 0, moveY: 0, aim: quantizeAngle(this.aim), buttons: 0, slot: 0, viewTime: now };
    if (!me || !me.alive || this.world.phase !== 'active') {
      if (me) this.aim = me.aim;
      frame.aim = quantizeAngle(this.aim);
      return frame;
    }
    const target = this.pickTarget(me, now);
    let moveX = 0;
    let moveY = 0;
    let desiredAim = this.aim;

    if (target) {
      const dx = target.x - me.x;
      const dy = target.y - me.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (now > this.aimNoiseAt) {
        this.aimNoise = (this.rng() * 2 - 1) * this.d.aimError;
        this.aimNoiseAt = now + 250 + this.rng() * 300;
      }
      desiredAim = Math.atan2(dy, dx) + this.aimNoise;
      // weapon choice
      const meleeInHand = me.weapon === me.melee;
      const heavyDef = me.heavy ? WEAPONS[me.heavy] : null;
      // launchers are useless point-blank: switch to the sidearm when the target is inside the blast
      const tooCloseForLauncher = !!heavyDef?.projectile && dist < heavyDef.projectile.radius * 1.4;
      if (me.heavy && me.weapon !== me.heavy && !tooCloseForLauncher) frame.slot = 3;
      else if (tooCloseForLauncher && me.weapon === me.heavy) frame.slot = 1;
      else if (!me.heavy && dist < 34 && !meleeInHand) frame.slot = 2;
      else if (!me.heavy && dist > 60 && meleeInHand) frame.slot = 1;
      const pref = preferredRange(me.weapon);
      let fwd = 0;
      if (dist > pref + 40) fwd = 1;
      else if (dist < pref - 40 && !meleeInHand) fwd = -0.6;
      if (now > this.strafeUntil) {
        this.strafeDir = this.rng() < 0.5 ? -1 : 1;
        this.strafeUntil = now + 500 + this.rng() * 900;
      }
      const nx = dx / (dist || 1);
      const ny = dy / (dist || 1);
      moveX = nx * fwd + -ny * this.strafeDir * 0.7;
      moveY = ny * fwd + nx * this.strafeDir * 0.7;
      if (!this.nav.isWalkable(me.x + moveX * 18, me.y + moveY * 18)) {
        this.strafeDir *= -1;
        moveX = nx * fwd + -ny * this.strafeDir * 0.7;
        moveY = ny * fwd + nx * this.strafeDir * 0.7;
      }
      const aimed = Math.abs(angleDiff(this.aim, Math.atan2(dy, dx))) < this.d.tolerance + 8 / Math.max(dist, 8);
      const reacted = now - this.targetSeenAt > this.d.reaction;
      const w = WEAPONS[me.weapon];
      if (aimed && reacted && dist < w.range * 0.95) frame.buttons |= BTN.FIRE;
    } else {
      const goal = this.chooseGoal(me, now);
      const wp = this.followPath(me, goal, now);
      if (wp) {
        const dx = wp.x - me.x;
        const dy = wp.y - me.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        moveX = dx / d;
        moveY = dy / d;
        desiredAim = Math.atan2(moveY, moveX);
      }
      const ammo = me.weapon === me.sidearm ? me.sideMag : me.heavyMag;
      const mag = WEAPONS[me.weapon].magazine;
      if (mag > 0 && ammo < mag * 0.5) frame.buttons |= BTN.RELOAD;
      if (me.heavy && me.weapon !== me.heavy) frame.slot = 3;
    }

    // stuck detection
    if (now - this.stuckCheck.at > 900) {
      const moved = Math.abs(me.x - this.stuckCheck.x) + Math.abs(me.y - this.stuckCheck.y);
      if (moved < 6 && (moveX !== 0 || moveY !== 0)) {
        this.path = [];
        this.repathAt = 0;
        this.roamGoal = null;
        this.strafeDir *= -1;
      }
      this.stuckCheck = { x: me.x, y: me.y, at: now };
    }

    const maxTurn = this.d.turnRate * TICK_DT;
    const diff = angleDiff(this.aim, desiredAim);
    this.aim = wrapAngle(this.aim + Math.max(-maxTurn, Math.min(maxTurn, diff)));
    const len = Math.sqrt(moveX * moveX + moveY * moveY);
    if (len > 1) {
      moveX /= len;
      moveY /= len;
    }
    frame.moveX = Math.round(moveX * 127);
    frame.moveY = Math.round(moveY * 127);
    frame.aim = quantizeAngle(this.aim);
    return frame;
  }

  private pickTarget(me: PlayerState, now: number): PlayerState | null {
    let best: PlayerState | null = null;
    let bestD = this.d.vision;
    for (const p of this.world.players.values()) {
      if (p === me || !p.alive) continue;
      const d = Math.sqrt((p.x - me.x) ** 2 + (p.y - me.y) ** 2);
      const sticky = p.id === this.targetId ? 80 : 0;
      if (d - sticky < bestD && this.world.collision.lineOfSight(me.x, me.y, p.x, p.y)) {
        bestD = d - sticky;
        best = p;
      }
    }
    if (best) {
      if (best.id !== this.targetId) {
        this.targetId = best.id;
        this.targetSeenAt = now;
      }
      this.lastSeen = { x: best.x, y: best.y, at: now };
    } else {
      this.targetId = null;
    }
    return best;
  }

  private chooseGoal(me: PlayerState, now: number): { x: number; y: number } {
    if (!me.heavy) {
      let best: { x: number; y: number } | null = null;
      let bestD = 900;
      for (const pk of this.world.pickups) {
        if (!pk.active || (pk.kind === 'medkit' && me.hp > 60)) continue;
        const d = Math.abs(pk.x - me.x) + Math.abs(pk.y - me.y);
        if (d < bestD) {
          bestD = d;
          best = { x: pk.x, y: pk.y };
        }
      }
      if (best) return best;
    }
    if (this.lastSeen && now - this.lastSeen.at < 4000) return this.lastSeen;
    let nearestEnemy: PlayerState | null = null;
    let nd = Infinity;
    for (const p of this.world.players.values()) {
      if (p === me || !p.alive) continue;
      const d = Math.abs(p.x - me.x) + Math.abs(p.y - me.y);
      if (d < nd) {
        nd = d;
        nearestEnemy = p;
      }
    }
    if (nearestEnemy && this.rng() < 0.6) return { x: nearestEnemy.x, y: nearestEnemy.y };
    if (!this.roamGoal || Math.abs(this.roamGoal.x - me.x) + Math.abs(this.roamGoal.y - me.y) < 40) {
      const pts = [...this.world.map.spawns, ...this.world.map.pickups];
      const pt = pts[Math.floor(this.rng() * pts.length)]!;
      this.roamGoal = { x: pt.x, y: pt.y };
    }
    return this.roamGoal;
  }

  private followPath(me: PlayerState, goal: { x: number; y: number }, now: number): { x: number; y: number } | null {
    const goalMoved = !this.pathGoal || Math.abs(this.pathGoal.x - goal.x) + Math.abs(this.pathGoal.y - goal.y) > 48;
    if (this.path.length === 0 || now > this.repathAt || goalMoved) {
      this.path = this.nav.findPath(me.x, me.y, goal.x, goal.y) ?? [];
      this.pathGoal = { ...goal };
      this.repathAt = now + 700 + this.rng() * 400;
    }
    while (this.path.length > 0) {
      const wp = this.path[0]!;
      if (Math.abs(wp.x - me.x) + Math.abs(wp.y - me.y) < 10) this.path.shift();
      else return wp;
    }
    return null;
  }
}
