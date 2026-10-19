/**
 * Centralized weapon configuration. Every combat number lives here and is used verbatim by the
 * authoritative server, the offline simulation and client-side prediction.
 *
 * Balance follows classic shooters (100 HP): pistols kill in 3–5 body hits, rifles in 4–5,
 * SMGs trade damage for fire rate, shotguns kill in 1–2 point-blank blasts, rifles with scopes in
 * 2 hits but fire slowly and slow the carrier down. Paid and rare weapons are sidegrades with a
 * different feel — never strictly better than the free ones (see docs/ECONOMY.md).
 *
 * The shop roster follows the product owner's «Новый арсенал» sheet (references/17-arsenal.png);
 * brand names are replaced by game names (Desert Eagle → «Дигл», Beretta 92 → «P92»,
 * Saiga-12 → «С-12К»).
 *
 * Inventory slots: 1 = sidearm (infinite reserve), 2 = melee, 3 = primary (loadout or map pickup),
 * 4 = equipment (grenades and gadgets, see gadgets.ts).
 */
export const WEAPON_IDS = [
  // base (free)
  'pistol',
  'montirovka',
  'obrez',
  'avtomat',
  // shop: sidearms
  'tt',
  'p92',
  'deagle',
  // shop: melee
  'nozh',
  'bita',
  'topor',
  // shop: primaries
  'uzi',
  'ppsh',
  'mp5',
  's12',
  'ksyuha',
  'm4',
  'g36',
  'svd',
  'awm',
  'm24',
  'rpg',
  'm249',
  // rare (cases)
  'mauser',
  'kuvalda',
  'zolotoy',
  'tommy',
  'tulka',
  'ognemet',
  'arbalet',
  'gvozdomet',
  'muha',
  'granatomet',
] as const;
export type WeaponId = (typeof WEAPON_IDS)[number];

/** Pose classes of the character art: how a weapon is held (see tools/art). */
export type WeaponPose = 'pistol' | 'long' | 'melee';
/** Where a weapon comes from: free for everyone, the shop, or cases. */
export type WeaponTier = 'base' | 'shop' | 'rare';
export type WeaponSound = 'pistol' | 'silenced' | 'revolver' | 'smg' | 'avtomat' | 'lmg' | 'rifle' | 'obrez' | 'shotgun' | 'rocket' | 'flame' | 'bow' | 'nail' | 'swing' | 'heavySwing';

export interface ProjectileDef {
  /** px per second */
  speed: number;
  /** Explosion radius (px). */
  radius: number;
  /** Damage at the centre; falls to 30 % at the edge. */
  splash: number;
  /** Share of splash damage the shooter takes from their own explosion. */
  selfFactor: number;
}

export interface WeaponDef {
  id: WeaponId;
  index: number;
  name: string;
  /** Short shop/HUD description. */
  blurb: string;
  /** Inventory slot shown in the HUD (1 = sidearm, 2 = melee, 3 = primary). */
  slot: 1 | 2 | 3;
  pose: WeaponPose;
  tier: WeaponTier;
  kind: 'hitscan' | 'melee' | 'projectile';
  /** Damage per pellet (hitscan), per swing (melee) or of a direct rocket hit (projectile, added to splash). */
  damage: number;
  pellets: number;
  fireIntervalMs: number;
  /** Fire continues while the trigger is held. */
  automatic: boolean;
  range: number;
  falloffStart: number;
  minDamageFactor: number;
  /** Half-angle of the random cone in radians. */
  spread: number;
  spreadPerShot: number;
  spreadMax: number;
  /** Radians per second recovered while not firing. */
  spreadRecovery: number;
  magazine: number;
  /** -1 = infinite reserve. */
  reserveMax: number;
  /** Reserve when picked up on the map / given by the loadout at spawn. */
  reserveOnPickup: number;
  reloadMs: number;
  /** Melee only. */
  meleeArc: number;
  meleeRange: number;
  projectile: ProjectileDef | null;
  /** Movement speed multiplier while this weapon is in hand. */
  moveSpeed: number;
  /** Silenced: quiet, and the shooter does not appear on opponents' minimap radar. */
  silenced: boolean;
  /** Laser sight: everyone sees the beam (modification). */
  laser: boolean;
  /** Time after switching to this weapon before it can fire. */
  drawMs: number;
  /** Camera shake strength for the shooter (0..1). */
  shake: number;
  sound: WeaponSound;
  /** Muzzle flash sprite family. */
  flash: 'pistol' | 'avtomat' | 'obrez' | 'none';
}

const base = {
  pellets: 1,
  falloffStart: 9999,
  minDamageFactor: 1,
  spreadPerShot: 0,
  spreadMax: 0,
  spreadRecovery: 0,
  meleeArc: 0,
  meleeRange: 0,
  reserveOnPickup: 0,
  projectile: null,
  moveSpeed: 1,
  silenced: false,
  laser: false,
  drawMs: 150,
  automatic: true,
};

type Def = Omit<WeaponDef, 'id' | 'index'>;
const sidearm = (d: Partial<Def> & Pick<Def, 'name' | 'blurb' | 'tier' | 'damage' | 'fireIntervalMs' | 'magazine' | 'reloadMs' | 'spread' | 'range'>): Def => ({
  ...base,
  slot: 1,
  pose: 'pistol',
  kind: 'hitscan',
  reserveMax: -1,
  falloffStart: 280,
  minDamageFactor: 0.75,
  shake: 0.15,
  sound: 'pistol',
  flash: 'pistol',
  ...d,
});
const melee = (d: Partial<Def> & Pick<Def, 'name' | 'blurb' | 'tier' | 'damage' | 'fireIntervalMs' | 'meleeRange' | 'meleeArc'>): Def => ({
  ...base,
  slot: 2,
  pose: 'melee',
  kind: 'melee',
  range: d.meleeRange,
  spread: 0,
  magazine: 0,
  reserveMax: 0,
  reloadMs: 0,
  shake: 0.2,
  sound: 'swing',
  flash: 'none',
  ...d,
});
const primary = (d: Partial<Def> & Pick<Def, 'name' | 'blurb' | 'tier' | 'damage' | 'fireIntervalMs' | 'magazine' | 'reserveMax' | 'reserveOnPickup' | 'reloadMs' | 'spread' | 'range'>): Def => ({
  ...base,
  slot: 3,
  pose: 'long',
  kind: 'hitscan',
  shake: 0.22,
  sound: 'avtomat',
  flash: 'avtomat',
  ...d,
});

const DEFS: Record<WeaponId, Def> = {
  // ── base ──────────────────────────────────────────────────────────────────
  pistol: sidearm({ name: 'Makarov (PM)', blurb: 'The trusty Makarov. Always on you, never runs out of ammo.', tier: 'base', damage: 25, fireIntervalMs: 260, magazine: 8, reloadMs: 1100, spread: 0.028, range: 520 }),
  montirovka: melee({ name: 'Crowbar', blurb: 'Two swings and the conversation is over.', tier: 'base', damage: 55, fireIntervalMs: 460, meleeRange: 36, meleeArc: (115 * Math.PI) / 180 }),
  obrez: primary({
    name: 'Sawn-off',
    blurb: 'Two barrels point-blank settle any argument.',
    tier: 'shop',
    damage: 14,
    pellets: 8,
    fireIntervalMs: 650,
    range: 260,
    falloffStart: 70,
    minDamageFactor: 0.3,
    spread: 0.2,
    magazine: 2,
    reserveMax: 16,
    reserveOnPickup: 10,
    reloadMs: 1700,
    shake: 0.55,
    sound: 'obrez',
    flash: 'obrez',
  }),
  avtomat: primary({
    name: 'AK-47',
    blurb: 'The classic: four hits, thirty rounds.',
    tier: 'base',
    damage: 27,
    fireIntervalMs: 100,
    range: 650,
    falloffStart: 400,
    minDamageFactor: 0.7,
    spread: 0.025,
    spreadPerShot: 0.01,
    spreadMax: 0.11,
    spreadRecovery: 0.3,
    magazine: 30,
    reserveMax: 90,
    reserveOnPickup: 60,
    reloadMs: 2200,
  }),
  // ── shop: sidearms ─────────────────────────────────────────────────────────
  tt: sidearm({ name: 'TT', blurb: 'The Tula Tokarev: three hits up close, but a stiff action.', tier: 'shop', damage: 34, fireIntervalMs: 340, magazine: 8, reloadMs: 1300, spread: 0.022, range: 580, falloffStart: 300, sound: 'revolver', shake: 0.2 }),
  p92: sidearm({ name: 'P92', blurb: 'An imported nine-millimetre: fifteen rounds, quick, but weaker.', tier: 'shop', damage: 20, fireIntervalMs: 200, magazine: 15, reloadMs: 1500, spread: 0.03, range: 500, falloffStart: 260 }),
  deagle: sidearm({ name: 'Deagle', blurb: 'A hand cannon from the desert: two hits, but heavy recoil and seven rounds.', tier: 'shop', damage: 50, fireIntervalMs: 560, magazine: 7, reloadMs: 1900, spread: 0.026, range: 620, falloffStart: 340, minDamageFactor: 0.7, sound: 'revolver', shake: 0.32 }),
  // ── shop: melee ───────────────────────────────────────────────────────────
  nozh: melee({ name: 'Knife', blurb: 'Short, fast and quiet. You run lighter with it.', tier: 'shop', damage: 40, fireIntervalMs: 300, meleeRange: 30, meleeArc: (90 * Math.PI) / 180, moveSpeed: 1.04 }),
  bita: melee({ name: 'Bat', blurb: 'A wide swing and a heavy hit.', tier: 'shop', damage: 65, fireIntervalMs: 600, meleeRange: 40, meleeArc: (130 * Math.PI) / 180, sound: 'heavySwing' }),
  topor: melee({ name: 'Axe', blurb: 'Two swings like the crowbar, but a longer wind-up.', tier: 'shop', damage: 70, fireIntervalMs: 640, meleeRange: 38, meleeArc: (110 * Math.PI) / 180, moveSpeed: 0.97, sound: 'heavySwing', shake: 0.3 }),
  // ── shop: primaries ───────────────────────────────────────────────────────
  uzi: primary({ name: 'Uzi', blurb: 'A thousand rounds a minute, but weak at range.', tier: 'shop', damage: 15, fireIntervalMs: 60, range: 430, falloffStart: 200, minDamageFactor: 0.55, spread: 0.05, spreadPerShot: 0.01, spreadMax: 0.13, spreadRecovery: 0.4, magazine: 32, reserveMax: 128, reserveOnPickup: 64, reloadMs: 1700, sound: 'smg' }),
  ppsh: primary({ name: 'PPSh-41', blurb: 'A 71-round drum. Reloading takes ages — better not miss.', tier: 'shop', damage: 17, fireIntervalMs: 70, range: 460, falloffStart: 230, minDamageFactor: 0.6, spread: 0.05, spreadPerShot: 0.008, spreadMax: 0.13, spreadRecovery: 0.3, magazine: 71, reserveMax: 142, reserveOnPickup: 71, reloadMs: 3200, moveSpeed: 0.95, sound: 'smg' }),
  mp5: primary({ name: 'MP5', blurb: 'An accurate submachine gun: tight groups, modest damage.', tier: 'shop', damage: 18, fireIntervalMs: 75, range: 500, falloffStart: 260, minDamageFactor: 0.6, spread: 0.028, spreadPerShot: 0.007, spreadMax: 0.1, spreadRecovery: 0.4, magazine: 30, reserveMax: 120, reserveOnPickup: 60, reloadMs: 1900, sound: 'smg' }),
  s12: primary({ name: 'S-12K', blurb: 'A self-loading shotgun: fast, but a wider spread than the sawn-off.', tier: 'shop', damage: 11, pellets: 8, fireIntervalMs: 330, range: 270, falloffStart: 80, minDamageFactor: 0.3, spread: 0.17, magazine: 8, reserveMax: 24, reserveOnPickup: 16, reloadMs: 2600, sound: 'shotgun', flash: 'obrez', shake: 0.45 }),
  ksyuha: primary({ name: 'AKS-74U', blurb: 'The “Ksyukha”: fires faster, hits worse at range.', tier: 'shop', damage: 22, fireIntervalMs: 80, range: 520, falloffStart: 300, minDamageFactor: 0.65, spread: 0.035, spreadPerShot: 0.011, spreadMax: 0.12, spreadRecovery: 0.32, magazine: 30, reserveMax: 120, reserveOnPickup: 60, reloadMs: 2000 }),
  m4: primary({ name: 'M4A1', blurb: 'Fast and accurate, but five hits instead of four.', tier: 'shop', damage: 24, fireIntervalMs: 80, range: 680, falloffStart: 420, minDamageFactor: 0.7, spread: 0.02, spreadPerShot: 0.008, spreadMax: 0.09, spreadRecovery: 0.35, magazine: 30, reserveMax: 90, reserveOnPickup: 60, reloadMs: 2000 }),
  g36: primary({ name: 'G36', blurb: 'A tight-grouping rifle with built-in optics. Heavier and slower to reload.', tier: 'shop', damage: 26, fireIntervalMs: 100, range: 720, falloffStart: 450, minDamageFactor: 0.7, spread: 0.016, spreadPerShot: 0.008, spreadMax: 0.09, spreadRecovery: 0.3, magazine: 30, reserveMax: 90, reserveOnPickup: 60, reloadMs: 2600, moveSpeed: 0.95 }),
  svd: primary({ name: 'SVD', blurb: 'The Dragunov self-loading sniper rifle: two hits.', tier: 'shop', damage: 70, fireIntervalMs: 600, range: 950, spread: 0.006, magazine: 10, reserveMax: 30, reserveOnPickup: 20, reloadMs: 2600, moveSpeed: 0.9, sound: 'rifle', shake: 0.4, drawMs: 300 }),
  awm: primary({ name: 'AWM', blurb: 'Finishes a wounded target in one shot. The bolt and the weight are the price.', tier: 'shop', damage: 95, fireIntervalMs: 1450, range: 1050, spread: 0.002, magazine: 5, reserveMax: 20, reserveOnPickup: 10, reloadMs: 3200, moveSpeed: 0.86, sound: 'rifle', shake: 0.55, drawMs: 400 }),
  m24: primary({ name: 'M24', blurb: 'A bolt-action rifle: two hits, a faster bolt than the AWM.', tier: 'shop', damage: 85, fireIntervalMs: 1150, range: 980, spread: 0.003, magazine: 5, reserveMax: 25, reserveOnPickup: 10, reloadMs: 2600, moveSpeed: 0.92, sound: 'rifle', shake: 0.45, drawMs: 350 }),
  rpg: primary({
    name: 'RPG-7',
    blurb: 'The blast catches everyone nearby — you included.',
    tier: 'shop',
    kind: 'projectile',
    damage: 30,
    fireIntervalMs: 900,
    range: 800,
    spread: 0.01,
    magazine: 1,
    reserveMax: 4,
    reserveOnPickup: 3,
    reloadMs: 2800,
    projectile: { speed: 520, radius: 70, splash: 110, selfFactor: 0.5 },
    moveSpeed: 0.85,
    sound: 'rocket',
    flash: 'obrez',
    shake: 0.6,
    drawMs: 350,
  }),
  m249: primary({ name: 'M249', blurb: 'A hundred rounds in the box. Heavy: you move slower.', tier: 'shop', damage: 23, fireIntervalMs: 80, range: 700, falloffStart: 450, minDamageFactor: 0.7, spread: 0.04, spreadPerShot: 0.008, spreadMax: 0.14, spreadRecovery: 0.25, magazine: 100, reserveMax: 100, reserveOnPickup: 100, reloadMs: 4400, moveSpeed: 0.82, sound: 'lmg', shake: 0.3, drawMs: 350 }),
  // ── rare (cases) ──────────────────────────────────────────────────────────
  mauser: sidearm({ name: 'Commissar’s Mauser', blurb: 'A wooden holster, ten rounds and a temper.', tier: 'rare', damage: 34, fireIntervalMs: 360, magazine: 10, reloadMs: 1700, spread: 0.02, range: 600, falloffStart: 360, sound: 'revolver', shake: 0.22 }),
  kuvalda: melee({ name: 'Udarnik Sledgehammer', blurb: 'One blow, one elimination — if you land it: a long wind-up and a short reach.', tier: 'rare', damage: 100, fireIntervalMs: 1050, meleeRange: 33, meleeArc: (100 * Math.PI) / 180, moveSpeed: 0.9, sound: 'heavySwing', shake: 0.45 }),
  zolotoy: primary({ name: 'Golden Kalash', blurb: 'The same AK-47, only gold-plated and with a 35-round magazine.', tier: 'rare', damage: 27, fireIntervalMs: 100, range: 660, falloffStart: 400, minDamageFactor: 0.7, spread: 0.024, spreadPerShot: 0.0095, spreadMax: 0.105, spreadRecovery: 0.32, magazine: 35, reserveMax: 105, reserveOnPickup: 70, reloadMs: 2200 }),
  tommy: primary({ name: 'Chicago Tommy Gun', blurb: 'A 50-round drum. Contraband with a sense of humour.', tier: 'rare', damage: 19, fireIntervalMs: 66, range: 480, falloffStart: 250, minDamageFactor: 0.6, spread: 0.045, spreadPerShot: 0.009, spreadMax: 0.13, spreadRecovery: 0.3, magazine: 50, reserveMax: 100, reserveOnPickup: 50, reloadMs: 3000, moveSpeed: 0.95, sound: 'smg' }),
  tulka: primary({ name: 'Engraved Tulka', blurb: 'A master’s double-barrel: tighter and longer-reaching than the sawn-off, weaker point-blank.', tier: 'rare', damage: 12, pellets: 8, fireIntervalMs: 420, range: 320, falloffStart: 110, minDamageFactor: 0.35, spread: 0.11, magazine: 2, reserveMax: 20, reserveOnPickup: 12, reloadMs: 2200, sound: 'obrez', flash: 'obrez', shake: 0.5 }),
  ognemet: primary({ name: 'Plamya-84 Flamethrower', blurb: 'A jet of fire up close. Keep your distance.', tier: 'rare', damage: 6, pellets: 3, fireIntervalMs: 100, range: 160, falloffStart: 60, minDamageFactor: 0.4, spread: 0.25, magazine: 60, reserveMax: 120, reserveOnPickup: 60, reloadMs: 3000, moveSpeed: 0.9, sound: 'flame', flash: 'none', shake: 0.12 }),
  arbalet: primary({ name: 'The Beat Cop’s Crossbow', blurb: 'A silent bolt: 90 damage, reload after every shot.', tier: 'rare', damage: 90, fireIntervalMs: 400, range: 800, spread: 0.003, magazine: 1, reserveMax: 20, reserveOnPickup: 12, reloadMs: 1100, silenced: true, sound: 'bow', flash: 'none', shake: 0.15 }),
  gvozdomet: primary({ name: 'Stroyka Nail Gun', blurb: 'Forty nails in a row. Labour valour!', tier: 'rare', damage: 14, fireIntervalMs: 85, range: 450, falloffStart: 250, minDamageFactor: 0.6, spread: 0.03, spreadPerShot: 0.006, spreadMax: 0.08, spreadRecovery: 0.4, magazine: 40, reserveMax: 120, reserveOnPickup: 80, reloadMs: 2400, sound: 'nail', flash: 'pistol', shake: 0.12 }),
  muha: primary({
    name: 'Mukha RPG',
    blurb: 'A light disposable launcher: faster than the RPG, a smaller blast.',
    tier: 'rare',
    kind: 'projectile',
    damage: 25,
    fireIntervalMs: 700,
    range: 760,
    spread: 0.012,
    magazine: 1,
    reserveMax: 3,
    reserveOnPickup: 3,
    reloadMs: 2000,
    projectile: { speed: 600, radius: 60, splash: 95, selfFactor: 0.5 },
    moveSpeed: 0.92,
    sound: 'rocket',
    flash: 'obrez',
    shake: 0.5,
  }),
  granatomet: primary({
    name: 'GM-94 Grenade Launcher',
    blurb: 'Three grenades in the magazine. Smaller blasts, but more often.',
    tier: 'rare',
    kind: 'projectile',
    damage: 20,
    fireIntervalMs: 700,
    range: 620,
    spread: 0.02,
    magazine: 3,
    reserveMax: 9,
    reserveOnPickup: 6,
    reloadMs: 3200,
    projectile: { speed: 420, radius: 56, splash: 75, selfFactor: 0.5 },
    moveSpeed: 0.88,
    sound: 'rocket',
    flash: 'obrez',
    shake: 0.45,
  }),
};

export const WEAPONS: Record<WeaponId, WeaponDef> = Object.fromEntries(WEAPON_IDS.map((id, index) => [id, { ...DEFS[id], id, index }])) as Record<WeaponId, WeaponDef>;

export const WEAPON_BY_INDEX: readonly WeaponId[] = WEAPON_IDS;

export const SIDEARMS: readonly WeaponId[] = WEAPON_IDS.filter((w) => DEFS[w].slot === 1);
export const MELEE_WEAPONS: readonly WeaponId[] = WEAPON_IDS.filter((w) => DEFS[w].slot === 2);
export const PRIMARY_WEAPONS: readonly WeaponId[] = WEAPON_IDS.filter((w) => DEFS[w].slot === 3);

/** Weapons that can lie on the map (slot 3). Kept as an alias for older call sites. */
export type HeavyWeaponId = WeaponId;

export function isWeaponId(v: unknown): v is WeaponId {
  return typeof v === 'string' && (WEAPON_IDS as readonly string[]).includes(v);
}

/** Slot-3 weapons are dropped on death and can be picked up from the map. */
export function isHeavy(id: WeaponId): boolean {
  return WEAPONS[id].slot === 3;
}

/** Damage multiplier for a hit at distance `d`. */
export function damageFalloff(w: WeaponDef, d: number): number {
  if (d <= w.falloffStart) return 1;
  if (d >= w.range) return w.minDamageFactor;
  const t = (d - w.falloffStart) / (w.range - w.falloffStart);
  return 1 + (w.minDamageFactor - 1) * t;
}

// ── Modifications (attachments) ──────────────────────────────────────────
/*
 * Bought with tokens for a specific weapon; one per mount point. Every modification has a plus and
 * a minus, so a modified weapon plays differently but never kills in fewer hits.
 */
export const MOD_IDS = ['silencer', 'reddot', 'scope', 'laser', 'grip', 'extmag'] as const;
export type ModId = (typeof MOD_IDS)[number];
/** Mount point: one modification per mount on a weapon. */
export type ModMount = 'muzzle' | 'optic' | 'rail' | 'mag';

export interface ModDef {
  id: ModId;
  name: string;
  mount: ModMount;
  plus: string;
  minus: string;
}

export const MODS: Record<ModId, ModDef> = {
  silencer: { id: 'silencer', name: 'Silencer', mount: 'muzzle', plus: 'Quiet: you don’t show on the enemies’ minimap', minus: 'Range −15%' },
  reddot: { id: 'reddot', name: 'Red Dot', mount: 'optic', plus: 'Spread −25%', minus: 'Slower to draw: +0.06 s' },
  scope: { id: 'scope', name: 'Scope', mount: 'optic', plus: 'Range +25%, spread −15%', minus: 'Speed −5%, draw +0.15 s' },
  laser: { id: 'laser', name: 'Laser', mount: 'rail', plus: 'Spread −30%, recoil −20%', minus: 'Every enemy sees the beam' },
  grip: { id: 'grip', name: 'Grip', mount: 'rail', plus: 'Recoil −40%, settles faster', minus: 'Reload +10%' },
  extmag: { id: 'extmag', name: 'Extended Mag', mount: 'mag', plus: 'Magazine +50%', minus: 'Reload +25%' },
};

/** Equipped modifications of one weapon (at most one per mount). */
export type WeaponMods = readonly ModId[];

export function isModId(v: unknown): v is ModId {
  return typeof v === 'string' && (MOD_IDS as readonly string[]).includes(v);
}

/** Which modifications fit a weapon (melee, launchers and the flamethrower take none). */
export function modsFor(w: WeaponDef): ModId[] {
  if (w.kind !== 'hitscan' || w.sound === 'flame') return [];
  if (w.id === 'arbalet') return ['reddot', 'scope'];
  const out: ModId[] = [];
  if (!w.silenced) out.push('silencer');
  out.push('reddot');
  if (w.pose === 'long' && w.pellets === 1) out.push('scope');
  out.push('laser');
  if (w.pose === 'long') out.push('grip');
  if (w.magazine >= 5) out.push('extmag');
  return out;
}

/** Valid equipped set for a weapon: known, fitting, one per mount (the first one wins), canonical order. */
export function sanitizeMods(raw: unknown, weapon: WeaponId): ModId[] {
  if (!Array.isArray(raw)) return [];
  const fit = modsFor(WEAPONS[weapon]);
  const mounts = new Set<ModMount>();
  const picked = new Set<ModId>();
  for (const m of raw) {
    if (!isModId(m) || !fit.includes(m) || mounts.has(MODS[m].mount)) continue;
    mounts.add(MODS[m].mount);
    picked.add(m);
  }
  return MOD_IDS.filter((m) => picked.has(m));
}

/** Effective weapon stats with modifications applied (pure; callers may cache). */
export function applyMods(w: WeaponDef, mods: WeaponMods | undefined): WeaponDef {
  if (!mods || mods.length === 0) return w;
  const fit = modsFor(w);
  const on = (m: ModId) => mods.includes(m) && fit.includes(m);
  if (!MOD_IDS.some(on)) return w;
  const d: WeaponDef = { ...w };
  if (on('silencer')) {
    d.silenced = true;
    d.range = Math.round(d.range * 0.85);
    if (d.falloffStart < 9999) d.falloffStart = Math.round(d.falloffStart * 0.85);
    d.flash = 'none';
    if (d.sound !== 'shotgun' && d.sound !== 'obrez') d.sound = 'silenced';
  }
  if (on('reddot')) {
    d.spread *= 0.75;
    d.drawMs += 60;
  }
  if (on('scope')) {
    d.range = Math.round(d.range * 1.25);
    if (d.falloffStart < 9999) d.falloffStart = Math.round(d.falloffStart * 1.25);
    d.spread *= 0.85;
    d.moveSpeed *= 0.95;
    d.drawMs += 150;
  }
  if (on('laser')) {
    d.spread *= 0.7;
    d.spreadMax *= 0.8;
    d.laser = true;
  }
  if (on('grip')) {
    d.spreadPerShot *= 0.6;
    d.spreadRecovery *= 1.3;
    d.reloadMs = Math.round(d.reloadMs * 1.1);
  }
  if (on('extmag')) {
    d.magazine = Math.ceil(d.magazine * 1.5);
    d.reloadMs = Math.round(d.reloadMs * 1.25);
  }
  return d;
}
