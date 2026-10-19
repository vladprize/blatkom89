/**
 * Game modes in the interface: names, one-line descriptions, rule notes and small pictograms
 * (original inline SVG) for the mode pickers in practice, quick match, rooms and lobbies.
 */
import { BASE_RULES, CTF_RULES, DEFAULT_MATCH_CONFIG, GAME_MODES } from '@blatkom/shared';
import type { GameMode } from '@blatkom/shared';
import { t } from '../i18n/index.js';

export const MODE_ORDER: readonly GameMode[] = GAME_MODES;

export function modeName(m: GameMode): string {
  switch (m) {
    case 'ffa':
      return t('Every man for himself');
    case 'teams':
      return t('Red vs Blue');
    case 'ctf':
      return t('Capture the Flag');
    case 'bases':
      return t('Base Capture');
  }
}

/** Under the name on a mode button. */
export function modeSub(m: GameMode): string {
  switch (m) {
    case 'ffa':
      return t('up to 10 players');
    case 'teams':
      return t('two teams, up to 5 v 5');
    case 'ctf':
      return t('steal their flag, bring it home');
    case 'bases':
      return t('hold bases A, B and C');
  }
}

/** How the mode is won (lobby, practice). */
export function modeRules(m: GameMode, limits: { teamScoreLimit?: number; captureLimit?: number; baseScoreLimit?: number } = {}): string {
  switch (m) {
    case 'ffa':
      return t('Everyone against everyone: the most points wins.');
    case 'teams':
      return t('No friendly fire: bullets, blasts and fire never hurt your own team. The first team to {n} eliminations wins.', { n: limits.teamScoreLimit ?? DEFAULT_MATCH_CONFIG.teamScoreLimit });
    case 'ctf':
      return t('Take the enemy flag from its stand and carry it to yours — it only counts while your own flag is at home. A carrier who goes down drops the flag: touch your own flag to send it home, or it goes back by itself in {s} s. {n} captures win.', {
        s: CTF_RULES.returnMs / 1000,
        n: limits.captureLimit ?? DEFAULT_MATCH_CONFIG.captureLimit,
      });
    case 'bases':
      return t('Stand inside a base to raise your flag on it ({s} s alone, faster together; with both teams inside nobody gains). Every base held brings its team a point a second — {n} points win.', {
        s: BASE_RULES.captureMs / 1000,
        n: limits.baseScoreLimit ?? DEFAULT_MATCH_CONFIG.baseScoreLimit,
      });
  }
}

/** A small pictogram for the mode buttons. */
export function modeIcon(m: GameMode): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('width', '30');
  svg.setAttribute('height', '30');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('modeico');
  const add = (tag: string, attrs: Record<string, string>) => {
    const el = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.append(el);
  };
  switch (m) {
    case 'ffa':
      // a crosshair
      add('circle', { cx: '16', cy: '16', r: '9', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.5' });
      add('path', { d: 'M16 3v8M16 21v8M3 16h8M21 16h8', stroke: 'currentColor', 'stroke-width': '2.5', 'stroke-linecap': 'square' });
      break;
    case 'teams':
      // two halves facing each other
      add('path', { d: 'M3 6h11v20H3z', fill: '#d8392e' });
      add('path', { d: 'M18 6h11v20H18z', fill: '#3d8ee0' });
      add('path', { d: 'M16 4v24', stroke: 'currentColor', 'stroke-width': '2' });
      break;
    case 'ctf':
      // a flag on a pole with a star
      add('path', { d: 'M8 3v27', stroke: 'currentColor', 'stroke-width': '2.5', 'stroke-linecap': 'round' });
      add('path', { d: 'M9 4h17l-4 6 4 6H9z', fill: '#d8392e' });
      add('path', { d: 'M15 7.2l1 2.1 2.3.3-1.7 1.6.4 2.3-2-1.1-2 1.1.4-2.3-1.7-1.6 2.3-.3z', fill: '#ffd36a' });
      break;
    case 'bases':
      // three zones A, B, C
      add('circle', { cx: '7', cy: '16', r: '5', fill: '#d8392e' });
      add('circle', { cx: '16', cy: '16', r: '5', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-dasharray': '3 2' });
      add('circle', { cx: '25', cy: '16', r: '5', fill: '#3d8ee0' });
      break;
  }
  return svg;
}
