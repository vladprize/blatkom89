/**
 * Centralized weapon configuration. Every combat number lives here and is used verbatim by the
 * authoritative server, the offline simulation and client-side prediction.
 *
 * Balance follows classic shooters (100 HP): pistols kill in 4–5 body hits, rifles in 4–5,
 * SMGs trade damage for fire rate, shotguns kill in 1–2 point-blank blasts, rifles with scopes in
 * 1–2 hits but fire slowly and slow the carrier down. Paid and rare weapons are sidegrades with a
 * different feel — never strictly better than the free ones (see docs/ECONOMY.md).
 *
 * Inventory slots: 1 = sidearm (infinite reserve), 2 = melee, 3 = primary (loadout or map pickup).
 */
export const WEAPON_IDS = [
  // base (free)
  'pistol',
  'montirovka',
  'obrez',
  'avtomat',
  // shop: sidearms
  'pb',
  'nagan',
  'stechkin',
  // shop: melee
  'finka',
  'bita',
  'lopata',
  // shop: primaries
  'uzi',
  'ksyuha',
  'toz',
  'mosinka',
  'pkm',
  'svd',
  'rpg',
  'val',
  'sayga',
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
  pistol: sidearm({ name: 'Пистолет ПМ', blurb: 'Надёжный «Макаров». Всегда с собой, патроны не кончаются.', tier: 'base', damage: 25, fireIntervalMs: 260, magazine: 8, reloadMs: 1100, spread: 0.028, range: 520 }),
  montirovka: melee({ name: 'Монтировка', blurb: 'Два удара — и разговор окончен.', tier: 'base', damage: 55, fireIntervalMs: 460, meleeRange: 36, meleeArc: (115 * Math.PI) / 180 }),
  obrez: primary({
    name: 'Обрез',
    blurb: 'Два ствола в упор решают любой спор.',
    tier: 'base',
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
    name: 'Калашников',
    blurb: 'Классика: четыре попадания, тридцать патронов.',
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
  pb: sidearm({ name: 'ПБ с глушителем', blurb: 'Тихо. Стрелка не видно на мини-карте соперников.', tier: 'shop', damage: 24, fireIntervalMs: 280, magazine: 8, reloadMs: 1200, spread: 0.025, range: 480, silenced: true, sound: 'silenced', flash: 'none' }),
  nagan: sidearm({ name: 'Наган', blurb: 'Тяжёлая пуля, долгая перезарядка барабана.', tier: 'shop', damage: 45, fireIntervalMs: 520, magazine: 7, reloadMs: 2400, spread: 0.018, range: 560, falloffStart: 340, sound: 'revolver', shake: 0.25 }),
  stechkin: sidearm({ name: 'Стечкин', blurb: 'Автоматический пистолет: шквал на ближней дистанции.', tier: 'shop', damage: 14, fireIntervalMs: 80, magazine: 20, reloadMs: 1500, spread: 0.05, spreadPerShot: 0.012, spreadMax: 0.12, spreadRecovery: 0.35, range: 420, falloffStart: 220, minDamageFactor: 0.6, sound: 'smg' }),
  // ── shop: melee ───────────────────────────────────────────────────────────
  finka: melee({ name: 'Финка', blurb: 'Короткая, быстрая, тихая.', tier: 'shop', damage: 40, fireIntervalMs: 300, meleeRange: 30, meleeArc: (90 * Math.PI) / 180, moveSpeed: 1.04 }),
  bita: melee({ name: 'Бита', blurb: 'Широкий замах, тяжёлый удар.', tier: 'shop', damage: 65, fireIntervalMs: 600, meleeRange: 40, meleeArc: (130 * Math.PI) / 180, sound: 'heavySwing' }),
  lopata: melee({ name: 'Сапёрная лопатка', blurb: 'Армейская классика: достаёт дальше монтировки.', tier: 'shop', damage: 50, fireIntervalMs: 480, meleeRange: 42, meleeArc: (120 * Math.PI) / 180 }),
  // ── shop: primaries ───────────────────────────────────────────────────────
  uzi: primary({ name: 'Узи', blurb: 'Тысяча выстрелов в минуту, но слабый на дистанции.', tier: 'shop', damage: 15, fireIntervalMs: 60, range: 430, falloffStart: 200, minDamageFactor: 0.55, spread: 0.05, spreadPerShot: 0.01, spreadMax: 0.13, spreadRecovery: 0.4, magazine: 32, reserveMax: 128, reserveOnPickup: 64, reloadMs: 1700, sound: 'smg' }),
  ksyuha: primary({ name: 'Ксюха', blurb: 'Укороченный автомат: быстрее стреляет, хуже вдаль.', tier: 'shop', damage: 22, fireIntervalMs: 80, range: 520, falloffStart: 300, minDamageFactor: 0.65, spread: 0.035, spreadPerShot: 0.011, spreadMax: 0.12, spreadRecovery: 0.32, magazine: 30, reserveMax: 120, reserveOnPickup: 60, reloadMs: 2000 }),
  toz: primary({ name: 'Помповое ружьё', blurb: 'Шесть патронов, каждый — половина дела.', tier: 'shop', damage: 12, pellets: 9, fireIntervalMs: 850, range: 300, falloffStart: 90, minDamageFactor: 0.3, spread: 0.15, magazine: 6, reserveMax: 24, reserveOnPickup: 12, reloadMs: 2800, sound: 'shotgun', flash: 'obrez', shake: 0.5 }),
  mosinka: primary({ name: 'Мосинка', blurb: 'Почти всегда с одного выстрела. Затвор не торопится.', tier: 'shop', damage: 95, fireIntervalMs: 1300, range: 950, spread: 0.004, magazine: 5, reserveMax: 25, reserveOnPickup: 10, reloadMs: 2600, moveSpeed: 0.92, sound: 'rifle', shake: 0.45 }),
  pkm: primary({ name: 'Пулемёт ПК', blurb: 'Сто патронов в ленте. Тяжёлый: двигаетесь медленнее.', tier: 'shop', damage: 24, fireIntervalMs: 85, range: 700, falloffStart: 450, minDamageFactor: 0.7, spread: 0.04, spreadPerShot: 0.008, spreadMax: 0.14, spreadRecovery: 0.25, magazine: 100, reserveMax: 100, reserveOnPickup: 100, reloadMs: 4200, moveSpeed: 0.82, sound: 'lmg', shake: 0.3 }),
  svd: primary({ name: 'СВД', blurb: 'Самозарядная снайперская: два попадания.', tier: 'shop', damage: 70, fireIntervalMs: 600, range: 950, spread: 0.006, magazine: 10, reserveMax: 30, reserveOnPickup: 20, reloadMs: 2600, moveSpeed: 0.9, sound: 'rifle', shake: 0.4 }),
  rpg: primary({
    name: 'РПГ-7',
    blurb: 'Взрыв задевает всех рядом — и вас тоже.',
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
  }),
  val: primary({ name: 'Вал', blurb: 'Бесшумный автомат: не виден на мини-карте.', tier: 'shop', damage: 25, fireIntervalMs: 100, range: 520, falloffStart: 260, minDamageFactor: 0.6, spread: 0.022, spreadPerShot: 0.009, spreadMax: 0.09, spreadRecovery: 0.35, magazine: 20, reserveMax: 80, reserveOnPickup: 40, reloadMs: 2000, silenced: true, sound: 'silenced', flash: 'none' }),
  sayga: primary({ name: 'Сайга-12', blurb: 'Самозарядный дробовик: быстро, но кучность хуже.', tier: 'shop', damage: 11, pellets: 8, fireIntervalMs: 330, range: 270, falloffStart: 80, minDamageFactor: 0.3, spread: 0.17, magazine: 8, reserveMax: 24, reserveOnPickup: 16, reloadMs: 2600, sound: 'shotgun', flash: 'obrez', shake: 0.45 }),
  // ── rare (cases) ──────────────────────────────────────────────────────────
  mauser: sidearm({ name: 'Маузер комиссара', blurb: 'Деревянная кобура, десять патронов и характер.', tier: 'rare', damage: 34, fireIntervalMs: 360, magazine: 10, reloadMs: 1700, spread: 0.02, range: 600, falloffStart: 360, sound: 'revolver', shake: 0.22 }),
  kuvalda: melee({ name: 'Кувалда «Ударник»', blurb: 'Один удар — одно устранение. Если попадёте: замах долгий, достаёт недалеко.', tier: 'rare', damage: 100, fireIntervalMs: 1050, meleeRange: 33, meleeArc: (100 * Math.PI) / 180, moveSpeed: 0.9, sound: 'heavySwing', shake: 0.45 }),
  zolotoy: primary({ name: 'Золотой Калаш', blurb: 'Тот же Калашников, только из золота и с магазином на 35.', tier: 'rare', damage: 27, fireIntervalMs: 100, range: 660, falloffStart: 400, minDamageFactor: 0.7, spread: 0.024, spreadPerShot: 0.0095, spreadMax: 0.105, spreadRecovery: 0.32, magazine: 35, reserveMax: 105, reserveOnPickup: 70, reloadMs: 2200 }),
  tommy: primary({ name: 'Томми-ган «Чикаго»', blurb: 'Дисковый магазин на 50 патронов. Контрабанда с юмором.', tier: 'rare', damage: 19, fireIntervalMs: 66, range: 480, falloffStart: 250, minDamageFactor: 0.6, spread: 0.045, spreadPerShot: 0.009, spreadMax: 0.13, spreadRecovery: 0.3, magazine: 50, reserveMax: 100, reserveOnPickup: 50, reloadMs: 3000, moveSpeed: 0.95, sound: 'smg' }),
  tulka: primary({ name: 'Тулка с гравировкой', blurb: 'Двустволка мастера: кучнее обреза и бьёт дальше, но в упор слабее.', tier: 'rare', damage: 12, pellets: 8, fireIntervalMs: 420, range: 320, falloffStart: 110, minDamageFactor: 0.35, spread: 0.11, magazine: 2, reserveMax: 20, reserveOnPickup: 12, reloadMs: 2200, sound: 'obrez', flash: 'obrez', shake: 0.5 }),
  ognemet: primary({ name: 'Огнемёт «Пламя-84»', blurb: 'Струя огня на 160 пикселей. Близко не подходить.', tier: 'rare', damage: 6, pellets: 3, fireIntervalMs: 100, range: 160, falloffStart: 60, minDamageFactor: 0.4, spread: 0.25, magazine: 60, reserveMax: 120, reserveOnPickup: 60, reloadMs: 3000, moveSpeed: 0.9, sound: 'flame', flash: 'none', shake: 0.12 }),
  arbalet: primary({ name: 'Арбалет участкового', blurb: 'Бесшумный болт: 90 урона, перезарядка после каждого выстрела.', tier: 'rare', damage: 90, fireIntervalMs: 400, range: 800, spread: 0.003, magazine: 1, reserveMax: 20, reserveOnPickup: 12, reloadMs: 1100, silenced: true, sound: 'bow', flash: 'none', shake: 0.15 }),
  gvozdomet: primary({ name: 'Гвоздомёт «Стройка»', blurb: 'Сорок гвоздей подряд. Трудовая доблесть.', tier: 'rare', damage: 14, fireIntervalMs: 85, range: 450, falloffStart: 250, minDamageFactor: 0.6, spread: 0.03, spreadPerShot: 0.006, spreadMax: 0.08, spreadRecovery: 0.4, magazine: 40, reserveMax: 120, reserveOnPickup: 80, reloadMs: 2400, sound: 'nail', flash: 'pistol', shake: 0.12 }),
  muha: primary({
    name: 'РПГ «Муха»',
    blurb: 'Лёгкий одноразовый гранатомёт: быстрее РПГ, взрыв поменьше.',
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
    name: 'Гранатомёт ГМ-94',
    blurb: 'Три гранаты в магазине. Взрыв меньше, зато чаще.',
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

// ── Upgrades ──────────────────────────────────────────────────────────────

export const UPGRADE_STATS = ['dmg', 'rate', 'reload', 'mag'] as const;
export type UpgradeStat = (typeof UPGRADE_STATS)[number];
export const UPGRADE_MAX_LEVEL = 3;
/** Effect per level (index = level). Capped so that an upgraded weapon stays within its class. */
export const UPGRADE_EFFECT: Record<UpgradeStat, readonly number[]> = {
  dmg: [0, 0.04, 0.08, 0.12],
  rate: [0, 0.04, 0.08, 0.12],
  reload: [0, 0.08, 0.16, 0.24],
  mag: [0, 0.1, 0.2, 0.3],
};
export type WeaponMods = Partial<Record<UpgradeStat, number>>;

/** Which upgrade stats make sense for a weapon. */
export function upgradeStatsFor(w: WeaponDef): UpgradeStat[] {
  if (w.kind === 'melee') return ['dmg', 'rate'];
  if (w.magazine < 5) return ['dmg', 'rate', 'reload'];
  return ['dmg', 'rate', 'reload', 'mag'];
}

const clampLevel = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(UPGRADE_MAX_LEVEL, Math.floor(n))) : 0);

/** Effective weapon stats with upgrades applied (pure; callers may cache). */
export function applyMods(w: WeaponDef, mods: WeaponMods | undefined): WeaponDef {
  if (!mods) return w;
  const allowed = upgradeStatsFor(w);
  const lv = (s: UpgradeStat) => (allowed.includes(s) ? clampLevel(mods[s]) : 0);
  const d = lv('dmg');
  const r = lv('rate');
  const rl = lv('reload');
  const m = lv('mag');
  if (!d && !r && !rl && !m) return w;
  return {
    ...w,
    damage: w.damage * (1 + UPGRADE_EFFECT.dmg[d]!),
    projectile: w.projectile ? { ...w.projectile, splash: w.projectile.splash * (1 + UPGRADE_EFFECT.dmg[d]!) } : null,
    fireIntervalMs: Math.round(w.fireIntervalMs * (1 - UPGRADE_EFFECT.rate[r]!)),
    reloadMs: Math.round(w.reloadMs * (1 - UPGRADE_EFFECT.reload[rl]!)),
    magazine: m > 0 ? w.magazine + Math.ceil(w.magazine * UPGRADE_EFFECT.mag[m]!) : w.magazine,
  };
}

export function sanitizeMods(raw: unknown): WeaponMods {
  const out: WeaponMods = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const s of UPGRADE_STATS) {
    const v = clampLevel((raw as Record<string, unknown>)[s]);
    if (v > 0) out[s] = v;
  }
  return out;
}
