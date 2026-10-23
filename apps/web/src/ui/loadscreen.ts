/**
 * A map's loading screen (the owner's art, story/scenes.ts) over the countdown of a match: the place on
 * the whole screen, its name, the mode and a bar that fills until the countdown is nearly over — then it
 * fades and the player has the last moment of the countdown to look around. A tap hides it at once.
 * Maps without their picture start as before.
 */
import type { GameSession } from '../game/session/types.js';
import { mapName } from '../i18n/content.js';
import { SCENE_FOCUS, sceneForMap, sceneUrl } from '../story/scenes.js';
import { h } from './dom.js';
import { modeName } from './modes.js';

/** The countdown left when the screen fades (time enough to see where you stand). */
const FADE_AT_MS = 900;

/** Shows the screen over `root` for `session`; returns a function that removes it (null: no picture). */
export function showLoadScreen(root: HTMLElement, session: GameSession): (() => void) | null {
  const sc = sceneForMap(session.mapId);
  if (!sc) return null;
  const [fx, fy] = SCENE_FOCUS[sc];
  const first = session.hud();
  const fillMs = first.phase === 'countdown' ? Math.max(800, first.phaseRemainingMs - FADE_AT_MS) : 2000;
  const el = h(
    'div',
    { class: 'loadscr', 'data-testid': 'loadscreen', 'data-scene': sc, style: `--fx:${fx}%;--fy:${fy}%;--load-ms:${fillMs}ms` },
    h('img', { src: sceneUrl(sc), alt: '', draggable: 'false' }),
    h(
      'div',
      { class: 'loadscr__bar' },
      h('div', { class: 'loadscr__name', 'data-testid': 'loadscreen-name' }, mapName(session.mapId)),
      h('div', { class: 'loadscr__sub' }, modeName(session.gameMode)),
      h('div', { class: 'loadscr__track' }, h('div', { class: 'loadscr__fill' })),
    ),
  );
  const started = performance.now();
  let done = false;
  const hide = () => {
    if (done) return;
    done = true;
    el.classList.add('loadscr--out');
    setTimeout(() => el.remove(), 520);
  };
  const tick = () => {
    if (done) return;
    if (!el.isConnected) {
      done = true;
      return;
    }
    const hud = session.hud();
    const age = performance.now() - started;
    const ready = hud.phase === 'active' || hud.phase === 'finished' || (hud.phase === 'countdown' && hud.phaseRemainingMs < FADE_AT_MS);
    if ((ready && age > 700) || age > 7000) return hide();
    requestAnimationFrame(tick);
  };
  el.addEventListener('click', hide);
  root.append(el);
  requestAnimationFrame(tick);
  return () => {
    done = true;
    el.remove();
  };
}
