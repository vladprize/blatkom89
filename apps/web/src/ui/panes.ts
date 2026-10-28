/**
 * v0.2.17 (the owner: «все экраны, на компьютере и на телефоне, без прокрутки»): a long screen on a
 * narrow window shows one part at a time. The parts are the root's children marked `data-pane-of="a"`
 * ("a b" for a part that belongs to two); the tabs set the root's `data-pane`, and the CSS (`.panes`)
 * hides the other parts while the window is narrow (`.panes` ≤ 760 px, `.panes--tablet` ≤ 999 px). Wide
 * windows show every part and hide the tabs. The choice is kept per screen for the session.
 */
import { h } from './dom.js';

export type PaneId = 'a' | 'b' | 'c' | 'd';
export interface PaneDef {
  id: PaneId;
  label: string;
  testid?: string;
}

const chosen = new Map<string, PaneId>();

/** The tabs for `root`'s parts; `root` gets the `panes` class and the current part. */
export function paneTabs(root: HTMLElement, key: string, defs: readonly PaneDef[], o: { tablet?: boolean } = {}): HTMLElement {
  const first = defs[0]!.id;
  const cur = defs.some((d) => d.id === chosen.get(key)) ? chosen.get(key)! : first;
  root.classList.add('panes');
  if (o.tablet) root.classList.add('panes--tablet');
  root.dataset.pane = cur;
  const tabs = h('div', { class: 'seg panetabs', role: 'tablist' });
  const pick = (id: PaneId) => {
    chosen.set(key, id);
    root.dataset.pane = id;
    for (const b of tabs.querySelectorAll<HTMLButtonElement>('button')) b.setAttribute('aria-pressed', String(b.dataset.paneTab === id));
  };
  tabs.append(
    ...defs.map((d) =>
      h(
        'button',
        { type: 'button', role: 'tab', 'aria-pressed': String(d.id === cur), 'data-pane-tab': d.id, 'data-testid': d.testid ?? null, onclick: () => pick(d.id) },
        d.label,
      ),
    ),
  );
  return tabs;
}

/** Marks a part: which pane (or panes) it is shown in on a narrow window. */
export function inPane<T extends HTMLElement>(el: T, ...ids: PaneId[]): T {
  el.dataset.paneOf = ids.join(' ');
  return el;
}
