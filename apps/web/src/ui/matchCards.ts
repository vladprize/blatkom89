/**
 * v0.2.23 — the fighter cards around a match (the owner: «когда ты заходишь в десматч … полный рост аватара;
 * если тебя убил какой-то тип — пока перезагрузка, тоже»):
 * - the line-up: while the countdown runs, every fighter of the match as a card along the bottom of the screen
 *   (over the map's loading picture), in team colours in team modes, the player's own marked;
 * - the killer's card: while the player waits to respawn, who took them down and with what — the weapon in its
 *   skin, big;
 * - for the results: every skin that took the player down this match (once each) and the fighters' last weapons
 *   (the podium shows them).
 * Nothing here takes a tap: the cards let the touches through to the game.
 */
import type { FinishId, Team, WeaponId } from '@blatkom/shared';
import { isWeaponId } from '@blatkom/shared';
import type { GameSession, RenderPlayer } from '../game/session/types.js';
import { hudBus } from '../game/scenes/hudBus.js';
import { FighterCard } from './fighterCard.js';
import type { FighterCardData } from './fighterCard.js';
import { h } from './dom.js';
import { t } from '../i18n/index.js';

/** What the killer's card shows (GameScene sends it when the local player is taken down). */
export interface KillerCardEvent extends FighterCardData {
  slot: number;
}

/** The killer's card from the kill event and the players as they are at that moment. */
export function killerCardData(killer: RenderPlayer, weapon: string): KillerCardEvent {
  // the weapon that did it — a grenade or a mine shows the weapon in hand instead
  const w: WeaponId = isWeaponId(weapon) ? weapon : killer.weapon;
  const finish: FinishId | null = w === killer.weapon ? killer.skin : null;
  return { slot: killer.slot, name: killer.name, character: killer.character, level: killer.level, weapon: w, finish, kills: finish ? (killer.skinKills ?? null) : null, bot: killer.isBot, label: t('Took you down') };
}

const TEAM_COLOR = ['#c8312a', '#3f86cf'] as const;

export class MatchCards {
  private readonly lineupEl: HTMLElement;
  private readonly killerEl: HTMLElement;
  private lineupCards: FighterCard[] = [];
  private killerCard: FighterCard | null = null;
  private lineupState: 'none' | 'shown' | 'gone' = 'none';
  private readonly killersSeen = new Map<string, FighterCardData>();
  private readonly lastGear = new Map<number, { weapon: WeaponId; finish: FinishId | null; level: number | null; kills: number | null }>();
  private timer = 0;
  private killerShownAt = 0;
  private lastPhase: string | null = null;

  constructor(
    private readonly session: GameSession,
    private readonly root: HTMLElement,
  ) {
    this.lineupEl = h('div', { class: 'mcards mcards--lineup', 'data-testid': 'lineup', 'aria-hidden': 'true' });
    this.killerEl = h('div', { class: 'mcards mcards--killer', 'data-testid': 'killer-card', 'aria-live': 'polite' });
    root.append(this.lineupEl, this.killerEl);
    hudBus.on('killer-card', this.onKiller, this);
    this.timer = window.setInterval(() => this.poll(), 100);
    this.poll();
  }

  destroy(): void {
    clearInterval(this.timer);
    hudBus.off('killer-card', this.onKiller, this);
    for (const c of this.lineupCards) c.destroy();
    this.killerCard?.destroy();
    this.lineupEl.remove();
    this.killerEl.remove();
  }

  /** Every skin that took the player down this match, once each, in the order it happened. */
  killers(): FighterCardData[] {
    // the results show the skins that did it (a plain weapon is in the kill feed and the killer's card already)
    return [...this.killersSeen.values()].filter((d) => !!d.finish);
  }

  /** The last weapon (and its skin) seen in each fighter's hands. */
  gear(slot: number): { weapon: WeaponId; finish: FinishId | null; level: number | null; kills: number | null } | null {
    return this.lastGear.get(slot) ?? null;
  }

  private readonly onKiller = (d: KillerCardEvent | null) => {
    if (!d) return this.hideKiller();
    const { slot: _slot, ...card } = d;
    void _slot;
    const key = `${card.name}|${card.weapon}|${card.finish ?? ''}`;
    if (!this.killersSeen.has(key)) this.killersSeen.set(key, { ...card, label: null });
    const { w, h } = this.size();
    // a phone held sideways: smaller, so the card stays clear of the HUD's lines above it
    const width = Math.round(Math.min(440, Math.max(240, w * (h < 500 ? 0.4 : 0.5))));
    if (this.killerCard) this.killerCard.set(card);
    else {
      this.killerCard = new FighterCard(card, { shape: 'wide', width });
      this.killerEl.replaceChildren(this.killerCard.el);
    }
    this.killerEl.classList.add('mcards--on');
    this.killerShownAt = performance.now();
  };

  private hideKiller() {
    this.killerEl.classList.remove('mcards--on');
  }

  /** The screen the cards are laid out on (the UI layer's own size: a match turned sideways turns it). */
  private size(): { w: number; h: number } {
    const w = this.root.clientWidth || window.innerWidth;
    const h = this.root.clientHeight || window.innerHeight;
    return { w, h };
  }

  private poll() {
    const hud = this.session.hud();
    const players = this.session.players();
    // a rematch in the same session: the screen was redrawn (put the layers back) and the new match starts afresh
    if (!this.lineupEl.isConnected) this.root.append(this.lineupEl);
    if (!this.killerEl.isConnected) this.root.append(this.killerEl);
    if ((hud.phase === 'countdown' || hud.phase === 'ready') && (this.lastPhase === 'finished' || this.lastPhase === 'active')) {
      this.lineupState = 'none';
      this.killersSeen.clear();
      this.hideKiller();
    }
    this.lastPhase = hud.phase;
    // as the match ends, the gear stays as it was (the results show it; counters don't move on afterwards)
    if (hud.phase !== 'finished') for (const p of players) this.lastGear.set(p.slot, { weapon: p.weapon, finish: p.skin, level: p.level, kills: p.skinKills ?? null });
    // the killer's card goes when the player is back (or the match is over)
    if (this.killerEl.classList.contains('mcards--on') && (hud.alive || hud.phase === 'finished') && performance.now() - this.killerShownAt > 400) this.hideKiller();
    // the line-up: while the countdown runs
    const counting = hud.phase === 'countdown' || hud.phase === 'ready';
    if (counting && this.lineupState === 'none' && players.length > 0) this.showLineup(players, hud.myTeam);
    else if (!counting && this.lineupState === 'shown') {
      this.lineupState = 'gone';
      this.lineupEl.classList.remove('mcards--on');
      window.setTimeout(() => {
        for (const c of this.lineupCards) c.destroy();
        this.lineupCards = [];
        this.lineupEl.replaceChildren();
      }, 600);
    }
  }

  private showLineup(players: RenderPlayer[], myTeam: Team | null) {
    this.lineupState = 'shown';
    // red first, then blue (team modes); the player's own card first among equals
    const list = [...players].sort((a, b) => (a.team ?? 0) - (b.team ?? 0) || Number(b.isLocal) - Number(a.isLocal) || a.slot - b.slot);
    const n = list.length;
    const { w: vw, h: vh } = this.size();
    const gap = 8;
    // v0.2.25: a short screen (a phone held sideways) leaves room under the cards for the loading screen's controls
    const width = Math.floor(Math.max(56, Math.min(150, (vw - 32 - gap * (n - 1) - (myTeam !== null ? 16 : 0)) / n, (vh * (vh < 500 ? 0.3 : 0.42)) / 1.42)));
    const row = h('div', { class: 'mcards__row' });
    let lastTeam: Team | null | undefined;
    list.forEach((p, i) => {
      if (myTeam !== null && i > 0 && p.team !== lastTeam) row.append(h('div', { class: 'mcards__gap' }));
      lastTeam = p.team;
      const label = p.isLocal ? t('You') : p.team === 0 ? t('Red') : p.team === 1 ? t('Blue') : null;
      const card = new FighterCard(
        { name: p.name, character: p.character, level: p.level, weapon: p.weapon, finish: p.skin, kills: p.skinKills ?? null, bot: p.isBot, label, ...(p.team === 0 || p.team === 1 ? { labelColor: TEAM_COLOR[p.team] } : {}) },
        { shape: 'tall', width },
      );
      card.el.style.animationDelay = `${i * 60}ms`;
      this.lineupCards.push(card);
      row.append(card.el);
    });
    this.lineupEl.replaceChildren(row);
    this.lineupEl.classList.add('mcards--on');
  }
}
