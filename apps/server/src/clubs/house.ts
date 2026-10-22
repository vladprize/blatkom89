/**
 * The house clubs (v0.3): the clubs the game keeps itself so that the club table is never empty and a
 * newcomer has crews to join. The owner's brief: at least twenty, with ratings, not labelled as anything
 * but clubs. Everything about them follows from their seed:
 *
 * - their people: a head and members made like the players who fill a lineup (`fillPersona`), the same
 *   names every time, slowly growing in number and level (a member a week or two, a level a week);
 * - their rating: a slow random walk around a target that itself drifts a little each day, one step per
 *   half hour since the last step (`drift`), so the table moves even on a host that sleeps;
 * - join requests: answered «yes» by their head a few minutes after they were sent (`acceptAfterMs`),
 *   except by the clubs that don't recruit.
 *
 * Real players who join one are ordinary members (club_members); the house people are never stored.
 */
import { fillPersona, hash32, mulberry32, nameKey, CLUB_RULES } from '@blatkom/shared';
import type { ClubEmblem, ClubFlag, ClubMember, EmblemIcon, FlagPattern, NickLang } from '@blatkom/shared';

export interface HouseClub {
  name: string;
  tag: string;
  motto: string;
  lang: NickLang;
  flag: ClubFlag;
  emblem: ClubEmblem;
  /** Where the rating hovers on the first day, and how it drifts (points a day). */
  rating: number;
  trend: number;
  /** People on the first day (head included). */
  size: number;
  recruiting: boolean;
  /** How long ago the club was founded when the table first appeared. */
  ageDays: number;
}

const P = { red: 0, burgundy: 1, black: 2, tobacco: 3, olive: 4, blue: 5, rust: 6, orange: 7, white: 8, gold: 9, green: 10, sky: 11 } as const;
const f = (pattern: FlagPattern, a: number, b: number, c: number): ClubFlag => ({ pattern, colors: [a, b, c] });
const e = (icon: EmblemIcon, color: number): ClubEmblem => ({ icon, color });

export const HOUSE_CLUBS: readonly HouseClub[] = Object.freeze([
  // v0.3: names, tags and mottos in Latin letters, like every club; `lang` only picks the people's names
  { name: 'Courtyard Bosses', tag: 'CB', motto: 'Our yard, our rules, shared benches', lang: 'ru', flag: f('v2', P.red, P.black, P.gold), emblem: e('star', P.gold), rating: 4210, trend: 2, size: 47, recruiting: false, ageDays: 64 },
  { name: 'Garage Co-op 7', tag: 'GC7', motto: 'Gates close at ten sharp', lang: 'ru', flag: f('h3', P.rust, P.black, P.gold), emblem: e('wrench', P.gold), rating: 3820, trend: 3, size: 41, recruiting: true, ageDays: 58 },
  { name: 'Garage Kings', tag: 'GK', motto: 'Built from spare parts', lang: 'en', flag: f('v2', P.rust, P.black, P.white), emblem: e('wrench', P.white), rating: 3700, trend: 2, size: 35, recruiting: true, ageDays: 51 },
  { name: 'Rassvet Video Club', tag: 'RVC', motto: 'Show at ten, bring your own tape', lang: 'ru', flag: f('band', P.black, P.red, P.black), emblem: e('cassette', P.white), rating: 3560, trend: 1, size: 36, recruiting: true, ageDays: 49 },
  { name: 'VHS Pirates', tag: 'VHS', motto: 'Be kind, rewind', lang: 'en', flag: f('h3', P.black, P.red, P.black), emblem: e('cassette', P.gold), rating: 3460, trend: 2, size: 31, recruiting: true, ageDays: 46 },
  { name: 'Night Shift', tag: 'NS', motto: 'While the city sleeps, we work', lang: 'ru', flag: f('diag', P.blue, P.black, P.orange), emblem: e('bolt', P.orange), rating: 3330, trend: 1, size: 33, recruiting: true, ageDays: 44 },
  { name: 'Factory Lads', tag: 'FAC', motto: 'The checkpoint is ours', lang: 'ru', flag: f('h2', P.olive, P.black, P.tobacco), emblem: e('gear', P.tobacco), rating: 3105, trend: 0, size: 44, recruiting: true, ageDays: 61 },
  { name: 'Sodium Lights', tag: 'SOD', motto: 'Orange light, long nights', lang: 'en', flag: f('diag', P.orange, P.black, P.orange), emblem: e('sun', P.black), rating: 3010, trend: 1, size: 26, recruiting: true, ageDays: 37 },
  { name: 'Entrance Six', tag: 'E6', motto: 'We won’t tell you the door code', lang: 'ru', flag: f('frame', P.black, P.tobacco, P.gold), emblem: e('key', P.gold), rating: 2870, trend: 2, size: 18, recruiting: true, ageDays: 33 },
  { name: 'Block 14', tag: 'B14', motto: 'Fourteen floors, one crew', lang: 'en', flag: f('corner', P.tobacco, P.red, P.black), emblem: e('tower', P.black), rating: 2790, trend: 1, size: 20, recruiting: true, ageDays: 31 },
  { name: 'Yard Cats', tag: 'CAT', motto: 'Nine lives, one bench', lang: 'ru', flag: f('solid', P.burgundy, P.burgundy, P.tobacco), emblem: e('paw', P.tobacco), rating: 2715, trend: 2, size: 27, recruiting: true, ageDays: 29 },
  { name: 'Concrete Wolves', tag: 'CW', motto: 'Howl at the street lamps', lang: 'en', flag: f('wedge', P.burgundy, P.black, P.white), emblem: e('paw', P.white), rating: 2640, trend: 1, size: 28, recruiting: true, ageDays: 28 },
  { name: 'Sunbeam Co-op', tag: 'SUN', motto: 'Light at the end of the yard', lang: 'ru', flag: f('corner', P.blue, P.gold, P.white), emblem: e('sun', P.gold), rating: 2560, trend: 0, size: 22, recruiting: true, ageDays: 26 },
  { name: 'North End', tag: 'NE', motto: 'The wind blows from the north. So do we', lang: 'ru', flag: f('h3', P.white, P.sky, P.blue), emblem: e('star', P.white), rating: 2440, trend: 1, size: 29, recruiting: true, ageDays: 24 },
  { name: 'Tape Rewinders', tag: 'RWD', motto: 'Back to ’89 and back again', lang: 'en', flag: f('v3', P.olive, P.tobacco, P.olive), emblem: e('cassette', P.black), rating: 2380, trend: 2, size: 16, recruiting: true, ageDays: 21 },
  { name: 'Still Waters', tag: 'SW', motto: 'We don’t make noise', lang: 'ru', flag: f('wedge', P.black, P.olive, P.sky), emblem: e('eye', P.sky), rating: 2290, trend: 1, size: 15, recruiting: true, ageDays: 20 },
  { name: 'Courtyard Union', tag: 'CU', motto: 'Benches for everyone', lang: 'en', flag: f('band', P.blue, P.white, P.blue), emblem: e('star', P.red), rating: 2205, trend: 1, size: 23, recruiting: true, ageDays: 19 },
  { name: 'Tram Depot', tag: 'TRAM', motto: 'The last tram is ours', lang: 'ru', flag: f('v3', P.red, P.white, P.red), emblem: e('bolt', P.black), rating: 2135, trend: 0, size: 24, recruiting: true, ageDays: 18 },
  { name: 'Young Technicians', tag: 'YT', motto: 'Built from whatever was lying around', lang: 'ru', flag: f('h2', P.sky, P.white, P.red), emblem: e('rocket', P.red), rating: 1980, trend: 2, size: 19, recruiting: true, ageDays: 16 },
  { name: 'Late Arrivals', tag: 'LATE', motto: 'Fashionably late, never lost', lang: 'en', flag: f('solid', P.black, P.black, P.sky), emblem: e('rocket', P.sky), rating: 1920, trend: 1, size: 11, recruiting: true, ageDays: 14 },
  { name: 'Second Gate', tag: 'GATE', motto: 'Only newcomers use the first one', lang: 'ru', flag: f('diag', P.rust, P.tobacco, P.black), emblem: e('crosshair', P.black), rating: 1840, trend: 1, size: 12, recruiting: true, ageDays: 13 },
  { name: 'Northside Co-op', tag: 'NCO', motto: 'Fair shares, fair fights', lang: 'en', flag: f('h3', P.green, P.white, P.green), emblem: e('anchor', P.gold), rating: 1760, trend: 1, size: 14, recruiting: true, ageDays: 12 },
  { name: 'House of Culture', tag: 'HOC', motto: 'Hobby clubs. The hobby is winning', lang: 'ru', flag: f('band', P.burgundy, P.gold, P.burgundy), emblem: e('satellite', P.tobacco), rating: 1695, trend: 1, size: 21, recruiting: true, ageDays: 11 },
  { name: 'Static Noise', tag: 'STN', motto: 'Snow on every channel', lang: 'en', flag: f('diag', P.sky, P.black, P.white), emblem: e('bolt', P.white), rating: 1580, trend: 2, size: 9, recruiting: true, ageDays: 9 },
  { name: 'Rookie Street', tag: 'RKS', motto: 'Everyone starts somewhere', lang: 'en', flag: f('h2', P.gold, P.black, P.black), emblem: e('flame', P.black), rating: 1310, trend: 2, size: 7, recruiting: true, ageDays: 6 },
  { name: 'Fresh Faces', tag: 'NEW', motto: 'Just moved in, already one of us', lang: 'ru', flag: f('v2', P.green, P.tobacco, P.black), emblem: e('flame', P.black), rating: 1240, trend: 3, size: 6, recruiting: true, ageDays: 4 },
]);

/** A house club's seed: stable for its name, 31 bits (the database column is a signed integer). */
export function houseSeed(name: string): number {
  let h = 2166136261;
  for (const ch of nameKey(name)) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619);
  return (h >>> 0) & 0x7fffffff;
}

const DAY = 86_400_000;
/** One drift step every half hour. */
export const DRIFT_STEP_MS = 30 * 60_000;

/** People in a house club on a day: a newcomer every week or two, never over the cap (minus real members). */
export function houseSize(base: number, seed: number, createdAt: Date, now: Date, realMembers: number): number {
  const days = Math.max(0, (now.getTime() - createdAt.getTime()) / DAY);
  const every = 7 + (hash32(seed, 1) % 8);
  return Math.max(1, Math.min(CLUB_RULES.maxMembers - realMembers, base + Math.floor(days / every)));
}

/** The house people, head first: the same names on every call; levels grow a week at a time. */
export function housePeople(seed: number, lang: NickLang, size: number, createdAt: Date, now: Date): ClubMember[] {
  const weeks = Math.floor(Math.max(0, now.getTime() - createdAt.getTime()) / (7 * DAY));
  const taken = new Set<string>();
  const out: ClubMember[] = [];
  for (let i = 0; i < size; i++) {
    const rnd = mulberry32(hash32(seed, 1000 + i));
    // most speak the club's language, a few the other
    const p = fillPersona(rnd, { lang: rnd() < 0.85 ? lang : lang === 'ru' ? 'en' : 'ru', aroundLevel: i === 0 ? 24 : 6 + (hash32(seed, i) % 14), taken });
    taken.add(p.name.toLowerCase());
    out.push({ id: personId(seed, i), name: p.name, level: Math.min(60, p.level + weeks), avatar: p.avatar, character: p.character, role: i === 0 ? 'head' : 'member' });
  }
  return out;
}

/** A stable id for a house person (formatted like every other id). */
function personId(seed: number, i: number): string {
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  const a = hex(hash32(seed, i, 1));
  const b = hex(hash32(seed, i, 2));
  const c = hex(hash32(seed, i, 3));
  const d = hex(hash32(seed, i, 4));
  return `${a}-${b.slice(0, 4)}-4${b.slice(5, 8)}-${(8 + (hash32(seed, i, 5) % 4)).toString(16)}${c.slice(1, 4)}-${c.slice(4)}${d}`;
}

/**
 * The rating after the half-hour steps between `from` and `now`: each step a little noise (bigger for
 * bigger clubs) and a pull towards the target, which moves `trend` points a day. At most a week of
 * steps is applied at once (a host that slept longer just resumes).
 */
export function drift(rating: number, o: { seed: number; base: number; trend: number; size: number; createdAt: Date; from: Date; now: Date }): { rating: number; at: Date } {
  const first = Math.floor(o.from.getTime() / DRIFT_STEP_MS) + 1;
  const last = Math.floor(o.now.getTime() / DRIFT_STEP_MS);
  if (last < first) return { rating, at: o.from };
  let r = rating;
  for (let step = Math.max(first, last - 7 * 48 + 1); step <= last; step++) {
    const at = step * DRIFT_STEP_MS;
    const days = (at - o.createdAt.getTime()) / DAY;
    const target = o.base + o.trend * Math.max(0, days);
    const noise = (hash32(o.seed, step) / 4294967296 - 0.5) * 2 * (5 + o.size / 4);
    r = Math.max(300, Math.round(r + noise + (target - r) * 0.03));
  }
  return { rating: r, at: new Date(last * DRIFT_STEP_MS) };
}

/** How long a house club's head takes to say yes to a request: 2–12 minutes, the same for the same player. */
export function acceptAfterMs(seed: number, userId: string): number {
  let h = seed;
  for (let i = 0; i < userId.length; i++) h = Math.imul(h ^ userId.charCodeAt(i), 16777619);
  return (2 + ((h >>> 0) % 600) / 60) * 60_000;
}
