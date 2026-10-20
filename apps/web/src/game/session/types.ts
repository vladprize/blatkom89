import type { FinishId, ArmsId, CharacterId, FlagAction, FlagStatus, GadgetId, GameMode, MapId, MatchPhase, PelletResult, PersonalResult, Standing, Team, TeamResultSummary, WeaponId } from '@blatkom/shared';

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
  /** The finish of the weapon in hand (a weapon skin), null: the plain weapon. */
  skin: FinishId | null;
  /** Blinded by a flashbang for this many more ms. */
  flashedMs: number;
  /** Team matches: 0 red, 1 blue; null in free-for-all. */
  team: Team | null;
  /** Capture the flag: flags captured; base capture: bases captured. */
  objectives: number;
}

/** Capture the flag: one flag per team. */
export interface RenderFlag {
  team: Team;
  status: FlagStatus;
  /** Carrier's slot (-1: nobody); a carried flag is drawn on its carrier. */
  carrier: number;
  x: number;
  y: number;
  standX: number;
  standY: number;
  /** Dropped: ms until it goes home by itself. */
  returnInMs: number;
}

/** Base capture: one per base (A, B, C). */
export interface RenderBase {
  index: number;
  x: number;
  y: number;
  owner: Team | null;
  /** The team whose capture bar is filling (null: empty bar). */
  capturer: Team | null;
  progress: number;
  contested: boolean;
  /** Living players inside: red, blue. */
  inside: [number, number];
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
  | { t: 'matchEnd'; reason: 'time' | 'score' | 'aborted' }
  | { t: 'flag'; action: FlagAction; team: Team; slot: number }
  | { t: 'base'; base: number; team: Team; from: Team | null; slots: number[] };

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
  /** The mode; in team modes the team scores of red and blue and the limit that ends the match. */
  gameMode: GameMode;
  teamScore: [number, number];
  teamScoreLimit: number;
  /** The local player's team (null in free-for-all). */
  myTeam: Team | null;
}

export interface ResultsData {
  matchId: string;
  reason: 'time' | 'score' | 'aborted';
  durationMs: number;
  standings: Standing[];
  mapId: MapId;
  personal: PersonalResult | null;
  /** Match mode (free-for-all when absent) and, for team matches, the team result. */
  gameMode?: GameMode;
  teams?: TeamResultSummary;
}

export interface GameSession {
  readonly mode: 'offline' | 'online';
  readonly mapId: MapId;
  /** Free-for-all, team deathmatch, capture the flag or base capture. */
  readonly gameMode: GameMode;
  localSlot(): number;
  /** One fixed 60 Hz step with the local input (null while the local player is not controlling). */
  step(input: import('@blatkom/shared').InputFrame | null): void;
  /** Called every render frame. */
  frame(nowMs: number): void;
  players(): RenderPlayer[];
  pickups(): RenderPickup[];
  gadgets(): RenderGadget[];
  /** Capture the flag: the two flags (empty in other modes). */
  flags(): RenderFlag[];
  /** Base capture: the bases (empty in other modes). */
  bases(): RenderBase[];
  drainEvents(): SessionEvent[];
  hud(): HudState;
  standings(): Standing[];
  results(): ResultsData | null;
  phase(): MatchPhase;
  /** Server-timeline time the client is currently rendering (for lag compensation). */
  viewTime(): number;
  destroy(): void;
}
