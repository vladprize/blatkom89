/**
 * v0.2.18 — grades: one scale for characters and weapon skins, shown everywhere as a coloured label.
 * The owner: «обычный / редкий / эпический / легендарный» in grey / red / purple / gold.
 *
 * The first grade's id stays `common` (the skins' rarity since v0.23, stored in `case_openings`); the
 * game shows it as «Regular» / «Обычный».
 */
export const GRADES = ['common', 'rare', 'epic', 'legendary'] as const;
export type Grade = (typeof GRADES)[number];

export function isGrade(v: unknown): v is Grade {
  return typeof v === 'string' && (GRADES as readonly string[]).includes(v);
}

/** The label colours (hex): grey, red, purple, gold. */
export const GRADE_COLORS: Readonly<Record<Grade, string>> = Object.freeze({
  common: '#a7a49c',
  rare: '#e2463b',
  epic: '#a85ee6',
  legendary: '#f2b632',
});

/** Higher grades sort first in lists that put the best on top. */
export const GRADE_RANK: Readonly<Record<Grade, number>> = Object.freeze({ common: 0, rare: 1, epic: 2, legendary: 3 });
