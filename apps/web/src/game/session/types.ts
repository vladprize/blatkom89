import type { CharacterId, HeavyWeaponId, MapId, MatchPhase, PelletResult, PersonalResult, Standing, WeaponId } from '@blatkom/shared';

export interface RenderPlayer {
  slot: number;
  id: string;
  name: string;
  character: CharacterId;
  isLocal: boolean;
  isBot: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  aim: number;
  hp: number;
  alive: boolean;
  weapon: WeaponId;
  reloading: boolean;
  invulnerable: boolean;
  walking: boolean;
  connected: boolean;
  kills: number;
  assists: number;
  deaths: number;
  score: number;
  /** Profile level when known (online roster, local profile, practice bots). */
  level: number | null;
}

export interface RenderPickup {
  id: number;
  weapon: HeavyWeaponId;
  x: number;
  y: number;
  active: boolean;
  dropped: boolean;
  /** «Дефицит» supply crate. */
  supply: boolean;
}

export type SessionEvent =
  | { t: 'shot'; shooter: number; weapon: WeaponId; ox: number; oy: number; aim: number; pellets: PelletResult[]; predicted: boolean }
  | { t: 'melee'; shooter: number; angle: number; hit: number; predicted: boolean }
  | { t: 'damage'; victim: number; attacker: number; amount: number; hp: number; weapon: WeaponId }
  | { t: 'kill'; killer: number; victim: number; weapon: WeaponId; assists: number[] }
  | { t: 'respawn'; slot: number; x: number; y: number }
  | { t: 'pickup'; slot: number; weapon: HeavyWeaponId; ammoOnly: boolean }
  | { t: 'drop'; slot: number; weapon: HeavyWeaponId }
  | { t: 'supply'; x: number; y: number; weapon: HeavyWeaponId }
  | { t: 'reload'; slot: number; weapon: WeaponId }
  | { t: 'dry'; slot: number }
  | { t: 'phase'; phase: MatchPhase }
  | { t: 'matchEnd'; reason: 'time' | 'score' | 'aborted' };

export interface HudState {
  hp: number;
  alive: boolean;
  respawnInMs: number;
  weapon: WeaponId;
  heavy: HeavyWeaponId | null;
  mag: number;
  /** -1 = infinite */
  reserve: number;
  reloading: boolean;
  reloadProgress: number;
  phase: MatchPhase;
  phaseRemainingMs: number;
  timeLeftMs: number;
  scoreLimit: number;
  ping: number | null;
  connection: 'offline' | 'online' | 'reconnecting' | 'lost';
  pickupPrompt: HeavyWeaponId | null;
  killedBy: string | null;
}

export interface ResultsData {
  matchId: string;
  reason: 'time' | 'score' | 'aborted';
  durationMs: number;
  standings: Standing[];
  mapId: MapId;
  personal: PersonalResult | null;
}

export interface GameSession {
  readonly mode: 'offline' | 'online';
  readonly mapId: MapId;
  localSlot(): number;
  /** One fixed 60 Hz step with the local input (null while the local player is not controlling). */
  step(input: import('@blatkom/shared').InputFrame | null): void;
  /** Called every render frame. */
  frame(nowMs: number): void;
  players(): RenderPlayer[];
  pickups(): RenderPickup[];
  drainEvents(): SessionEvent[];
  hud(): HudState;
  standings(): Standing[];
  results(): ResultsData | null;
  phase(): MatchPhase;
  /** Server-timeline time the client is currently rendering (for lag compensation). */
  viewTime(): number;
  destroy(): void;
}
