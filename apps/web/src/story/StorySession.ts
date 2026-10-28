/**
 * A story mission (v0.2.13, part 4a), played in the browser like practice: the shared World and bots,
 * with the mission's rules on top — who is on which side and what they carry, the waves, the one life
 * of «clear» and «survive», the time limit, and the lines the characters say. The server only learns
 * that the mission was done (api/story.ts guards what it pays for).
 */
import { BotBrain, DEFAULT_LOADOUT, STORY_RULES, isTeamMode, storyGameMode } from '@blatkom/shared';
import type { CharacterId, Loadout, StoryKit, StoryMission, StoryNpc, Team, WorldEvent } from '@blatkom/shared';
import { charName } from '../i18n/content.js';
import { OfflineSession } from '../game/session/OfflineSession.js';
import type { HudState } from '../game/session/types.js';
import { MISSION_SCRIPTS, ROLE_NAMES, line } from './script.js';
import type { BarkKey } from './script.js';

export type StoryFail = 'down' | 'time' | 'lost';
export interface StoryOutcome {
  result: 'win' | 'fail';
  reason?: StoryFail;
}

/** The objective line: enemies still standing (now and in the waves to come), the side's points, the hero's lives (null: no limit). */
export interface StoryGoalState {
  left: number;
  score: number;
  limit: number;
  lives: number | null;
}

/** No limit by eliminations in the missions that are not about them. */
const NO_LIMIT = 9999;
/** «lowHp»: said once when the hero's health drops to this. */
const LOW_HP = 35;

export function kitLoadout(k: StoryKit): Loadout {
  return { ...DEFAULT_LOADOUT, sidearm: k.sidearm, melee: k.melee, primary: k.primary, gadget: k.gadget, mods: {} };
}

/** The name over a story character: a named one is themselves, anyone else the role they play. */
export function npcName(n: Pick<StoryNpc, 'character' | 'role'>): string {
  return n.role === 'self' ? charName(n.character) : line(ROLE_NAMES[n.role]);
}

export class StorySession extends OfflineSession {
  readonly mission: StoryMission;
  private readonly waves: StoryNpc[][] = [];
  private wave = 0;
  private nextWaveAt = 0;
  private npcSeq = 0;
  private readonly enemyIds = new Set<string>();
  private outcomeValue: StoryOutcome | null = null;
  private cues: BarkKey[] = [];
  private readonly said = new Set<BarkKey>();
  private wasActive = false;
  /** Seconds in the mission (from «FORWARD!» to the end). */
  private endedAt = 0;
  /** «clear» and «survive»: falls the hero can still take (0 ends the mission). */
  private livesLeft: number;

  constructor(m: StoryMission, opts: { seed?: number } = {}) {
    const mode = storyGameMode(m.objective);
    const o = m.objective;
    super({
      mapId: m.map,
      character: m.hero,
      name: charName(m.hero),
      level: null,
      bots: 0,
      difficulty: 'normal',
      gameMode: mode,
      durationMs: m.timeLimitMs,
      loadout: kitLoadout(m.kit),
      teamScoreLimit: o.kind === 'team' ? o.limit : NO_LIMIT,
      config: {
        fixedTeams: true,
        captureLimit: o.kind === 'flag' ? o.limit : NO_LIMIT,
        baseScoreLimit: o.kind === 'bases' ? o.limit : NO_LIMIT,
        // the mission's kits are the weapons: no «дефицит» crates
        supplyFirstMs: Number.MAX_SAFE_INTEGER,
      },
      ...(opts.seed !== undefined ? { seed: opts.seed } : {}),
      deferStart: true,
    });
    this.mission = m;
    const hero = this.world.players.get(this.localId);
    if (hero) hero.damageTaken = STORY_RULES.heroDamage;
    // nor weapons lying on the map (first-aid kits stay; what the fallen drop can still be picked up)
    for (let i = this.world.pickups.length - 1; i >= 0; i--) if (this.world.pickups[i]!.kind === 'weapon') this.world.pickups.splice(i, 1);
    this.livesLeft = o.kind === 'clear' || o.kind === 'survive' ? STORY_RULES.lives : 0;
    for (const n of m.npcs) {
      const w = n.side === 'enemy' ? (n.wave ?? 0) : 0;
      (this.waves[w] ??= []).push(n);
    }
    for (let i = 0; i < this.waves.length; i++) this.waves[i] ??= [];
    this.addWave(0);
    this.world.beginMatch(true);
  }

  // ── the mission's own rules ────────────────────────────────────────────
  private addWave(w: number) {
    for (const n of this.waves[w] ?? []) {
      const id = `npc${this.npcSeq++}`;
      const team: Team = n.side === 'ally' ? 0 : 1;
      this.world.addPlayer(id, npcName(n), n.character as CharacterId, true, kitLoadout(n.kit), isTeamMode(this.gameMode) ? team : undefined);
      if (n.side === 'enemy') this.enemyIds.add(id);
      // v0.2.17: the enemies are eased (BOT_EASE), the hero's allies are not
      this.brains.push(new BotBrain(id, this.world, this.nav, n.difficulty, 1000 + this.npcSeq * 77 + Math.floor(Math.random() * 1000), n.side === 'enemy'));
    }
    this.wave = w;
  }

  /** «clear» and «survive»: the hero's falls are counted (STORY_RULES.lives). */
  private get countsLives(): boolean {
    return this.mission.objective.kind === 'clear' || this.mission.objective.kind === 'survive';
  }

  private cue(k: BarkKey) {
    if (this.said.has(k)) return;
    this.said.add(k);
    this.cues.push(k);
  }

  private end(o: StoryOutcome) {
    if (this.outcomeValue) return;
    this.outcomeValue = o;
    this.endedAt = this.world.time;
    if (o.result === 'win') this.cue('win');
    if (this.world.phase === 'active') this.world.finish(o.result === 'win' ? 'score' : 'aborted');
  }

  protected override onWorldEvent(e: WorldEvent): void {
    const me = this.localSlot();
    switch (e.t) {
      case 'phase':
        if (e.phase === 'active' && !this.wasActive) {
          this.wasActive = true;
          this.cue('start');
        }
        break;
      case 'kill': {
        const victim = this.world.playerBySlot(e.victim);
        if (!victim) break;
        if (victim.id === this.localId && this.countsLives) {
          this.livesLeft = Math.max(0, this.livesLeft - 1);
          if (this.livesLeft === 0) this.end({ result: 'fail', reason: 'down' });
          break;
        }
        if (this.enemyIds.has(victim.id)) {
          if (e.killer === me) this.cue('firstKill');
          // «clear»: the ones who are down stay down; «survive»: they come back, but not at once
          if (this.mission.objective.kind === 'clear') victim.respawnAt = Number.POSITIVE_INFINITY;
          else if (this.mission.objective.kind === 'survive') victim.respawnAt = this.world.time + STORY_RULES.surviveRespawnMs;
        }
        break;
      }
      case 'flag':
        if (e.action === 'taken' && e.slot === me) this.cue('flag');
        if (e.action === 'captured' && e.team === 1 && this.mission.objective.kind === 'flag' && this.mission.objective.limit > 1) this.cue('half');
        break;
      case 'base':
        if (e.team === 0) this.cue('base');
        break;
      case 'matchEnd':
        // the World ended it: the limit (team, flag, bases) or the clock
        if (!this.outcomeValue) {
          if (e.reason === 'time') this.outcomeValue = this.mission.objective.kind === 'survive' ? { result: 'win' } : { result: 'fail', reason: 'time' };
          else if (e.reason === 'score') {
            const won = this.world.teamResult().winner === 0;
            this.outcomeValue = won ? { result: 'win' } : { result: 'fail', reason: 'lost' };
          } else this.outcomeValue = { result: 'fail', reason: 'lost' };
          this.endedAt = this.world.time;
          if (this.outcomeValue.result === 'win') this.cue('win');
        }
        break;
      default:
        break;
    }
  }

  protected override afterStep(): void {
    const w = this.world;
    if (w.phase !== 'active' || this.outcomeValue) return;
    const me = w.players.get(this.localId);
    if (me?.alive && me.hp <= LOW_HP) this.cue('lowHp');
    const o = this.mission.objective;
    if ((o.kind === 'team' || o.kind === 'bases') && w.teamScore[0] >= Math.ceil(o.limit / 2)) this.cue('half');
    if (o.kind !== 'clear') return;
    // «clear»: the next wave once everybody on the field is down, the win when nobody is left
    const standing = [...this.enemyIds].some((id) => w.players.get(id)?.alive);
    if (standing) return;
    if (this.wave + 1 < this.waves.length) {
      if (this.nextWaveAt === 0) this.nextWaveAt = w.time + (this.mission.waveGapMs ?? 1500);
      else if (w.time >= this.nextWaveAt) {
        this.nextWaveAt = 0;
        this.addWave(this.wave + 1);
        // the line about the next wave comes with the last one (the boss's entrance)
        if (this.wave === this.waves.length - 1) this.cue('wave');
      }
      return;
    }
    this.end({ result: 'win' });
  }

  // ── for the HUD, the overlay and the app ───────────────────────────────
  outcome(): StoryOutcome | null {
    return this.outcomeValue;
  }

  /** The lines due since the last call (each moment once). */
  drainCues(): BarkKey[] {
    const c = this.cues;
    this.cues = [];
    return c;
  }

  goal(): StoryGoalState {
    const o = this.mission.objective;
    const w = this.world;
    let left = 0;
    for (const id of this.enemyIds) if (w.players.get(id)?.alive) left++;
    for (let i = this.wave + 1; i < this.waves.length; i++) left += this.waves[i]!.filter((n) => n.side === 'enemy').length;
    const limit = o.kind === 'team' || o.kind === 'flag' || o.kind === 'bases' ? o.limit : 0;
    return { left, score: Math.floor(w.teamScore[0]), limit, lives: this.countsLives ? this.livesLeft : null };
  }

  /** Time in the mission so far (or until it ended), ms. */
  elapsedMs(): number {
    const w = this.world;
    if (!w.matchStartedAt) return 0;
    return Math.max(0, (this.endedAt || w.time) - w.matchStartedAt);
  }

  heroStats(): { kills: number; deaths: number } {
    const me = this.world.players.get(this.localId);
    return { kills: me?.kills ?? 0, deaths: me?.deaths ?? 0 };
  }

  override hud(): HudState {
    return { ...super.hud(), story: { outcome: this.outcomeValue?.result ?? null, reason: this.outcomeValue?.reason ?? null, label: line(MISSION_SCRIPTS[this.mission.id]?.title ?? ['', '']) } };
  }

  /** Not used: a story mission starts again from its ticket (the app makes a new session). */
  override restart(): void {
    throw new Error('a story mission is started anew');
  }
}
