import type { ArmsId, CharacterId, GadgetId, MapId, MatchPhase, PelletResult, PersonalResult, Standing, WeaponId } from '@blatkom/shared';

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
  /** The weapon in hand has a laser sight: everyone sees the beam. */
  laser: boolean;
  /** Blinded by a flashbang for this many more ms. */
  flashedMs: number;
}

/** Equipment in the world (thrown grenades, fire, smoke, mines, C4, turrets). */
export interface RenderGadget {
  id: number;
  kind: GadgetId;
  /** Owner's slot. */
  owner: number;
  phase: 'moving' | 'armed' | 'active';
  triggered: boolean;
  x: number;
  y: number;
  aim: number;
  hp: number;
  /** Time left in the current phase (ms). */
  leftMs: number;
}

export interface RenderPickup {
  id: number;
  /** Slot-3 weapon; null for a first-aid kit. */
  weapon: WeaponId | null;
  medkit: boolean;
  x: number;
  y: number;
  active: boolean;
  dropped: boolean;
  /** «Дефицит» supply crate. */
  supply: boolean;
}

export type SessionEvent =
  | { t: 'shot'; shooter: number; weapon: ArmsId; ox: number; oy: number; aim: number; pellets: PelletResult[]; predicted: boolean; turret?: boolean; silenced?: boolean }
  | { t: 'melee'; shooter: number; angle: number; hit: number; predicted: boolean }
  | { t: 'damage'; victim: number; attacker: number; amount: number; hp: number; weapon: ArmsId }
  | { t: 'kill'; killer: number; victim: number; weapon: ArmsId; assists: number[] }
  | { t: 'respawn'; slot: number; x: number; y: number }
  | { t: 'pickup'; slot: number; weapon: WeaponId; ammoOnly: boolean }
  | { t: 'drop'; slot: number; weapon: WeaponId }
  | { t: 'supply'; x: number; y: number; weapon: WeaponId }
  | { t: 'heal'; slot: number; amount: number; x: number; y: number }
  /** A rocket / grenade launched; `age` = ms it has already flown when the client learns about it. */
  | { t: 'rocket'; id: number; shooter: number; weapon: WeaponId; x: number; y: number; angle: number; speed: number; range: number; age?: number }
  | { t: 'boom'; id: number; shooter: number; weapon: ArmsId; x: number; y: number; radius: number }
  | { t: 'gadget'; id: number; kind: GadgetId; slot: number; x: number; y: number }
  | { t: 'flashbang'; x: number; y: number }
  | { t: 'ignite'; id: number; x: number; y: number; radius: number }
  | { t: 'smoke'; id: number; x: number; y: number; radius: number }
  | { t: 'beep'; id: number; x: number; y: number }
  | { t: 'turretDown'; id: number; x: number; y: number }
  | { t: 'reload'; slot: number; weapon: WeaponId }
  | { t: 'dry'; slot: number }
  | { t: 'phase'; phase: MatchPhase }
  | { t: 'matchEnd'; reason: 'time' | 'score' | 'aborted' };

export interface HudState {
  hp: number;
  alive: boolean;
  respawnInMs: number;
  weapon: WeaponId;
  /** Loadout slots 1 and 2, and the slot-3 weapon carried (if any). */
  sidearm: WeaponId;
  melee: WeaponId;
  heavy: WeaponId | null;
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
  pickupPrompt: WeaponId | null;
  killedBy: string | null;
  /** Equipment (slot 4): type, charges left, and whether a placed C4 is waiting for the detonator. */
  gadget: GadgetId | null;
  gadgetCharges: number;
  c4Armed: boolean;
  /** Blinded by a flashbang for this many more ms (white screen). */
  flashedMs: number;
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
  gadgets(): RenderGadget[];
  drainEvents(): SessionEvent[];
  hud(): HudState;
  standings(): Standing[];
  results(): ResultsData | null;
  phase(): MatchPhase;
  /** Server-timeline time the client is currently rendering (for lag compensation). */
  viewTime(): number;
  destroy(): void;
}
