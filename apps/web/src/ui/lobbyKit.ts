/**
 * v0.2.25 (the owner: «в лобби ожидания перед игрой должна быть возможность менять оружие»): the player's kit
 * in a sheet over the lobby — the four slots, each a row of what the player owns; a tap puts it on at once (the
 * server checks it and the room re-reads it, so it is what the player spawns with). Buying stays in the Arsenal.
 */
import { GADGET_IDS, MELEE_WEAPONS, PRIMARY_WEAPONS, SIDEARMS } from '@blatkom/shared';
import type { GadgetId, Inventory, Loadout, WeaponId } from '@blatkom/shared';
import { h, toast } from './dom.js';
import { openSheet } from './sheet.js';
import { t } from '../i18n/index.js';
import { gadgetName, weaponName } from '../i18n/content.js';
import { gadgetImg, slotLabel, weaponImg } from './screens/shop.js';
import type { OnlineClient } from '../net/OnlineClient.js';
import { apiErrorText } from '../net/errors.js';
import { sfx } from '../game/audio/Sfx.js';

interface Opt {
  id: string;
  pic: HTMLElement;
  name: string;
  on: boolean;
  pick: () => void;
}

export function openLobbyKit(root: HTMLElement, online: OnlineClient): void {
  let inv: Inventory | null = online.inventory ?? null;
  let busy = false;
  const body = h('div', { class: 'col lobbykit', 'data-testid': 'lobby-kit-sheet' });
  const save = (next: Loadout) => {
    if (busy) return;
    busy = true;
    sfx.play('click');
    void online
      .setLoadout(next)
      .then((i) => {
        inv = i;
        toast(t('Saved — applies from your next spawn'));
      })
      .catch((e: Error) => toast(apiErrorText(e)))
      .finally(() => {
        busy = false;
        draw();
      });
  };
  const none = () => h('span', { class: 'none' }, '—');
  const row = (slot: 1 | 2 | 3 | 4, opts: Opt[]) =>
    h(
      'div',
      { class: 'lobbykit__slot', 'data-slot': String(slot) },
      h('span', { class: 'chiplabel' }, `${slot} · ${slotLabel(slot)}`),
      h('div', { class: 'lobbykit__list' }, ...opts.map((o) => h('button', { class: `wbtn slotopt lobbykit__opt ${o.on ? 'on' : ''}`, 'aria-pressed': String(o.on), 'data-opt': o.id, disabled: busy, onclick: () => !o.on && o.pick() }, o.pic, h('span', null, o.name)))),
    );
  const draw = () => {
    if (!inv) return void body.replaceChildren(h('div', { class: 'spinner' }));
    const l = inv.loadout;
    const owns = (w: WeaponId) => inv!.weapons.includes(w);
    const weapon = (w: WeaponId, on: boolean, next: Loadout): Opt => ({ id: w, pic: weaponImg(w, 'small', l.skins?.[w] ?? null), name: weaponName(w), on, pick: () => save(next) });
    body.replaceChildren(
      row(1, SIDEARMS.filter(owns).map((w) => weapon(w, l.sidearm === w, { ...l, sidearm: w }))),
      row(2, MELEE_WEAPONS.filter(owns).map((w) => weapon(w, l.melee === w, { ...l, melee: w }))),
      row(3, [
        ...PRIMARY_WEAPONS.filter(owns).map((w) => weapon(w, l.primary === w, { ...l, primary: w })),
        { id: 'none', pic: none(), name: t('Sidearm only'), on: l.primary === null, pick: () => save({ ...l, primary: null }) },
      ]),
      row(4, [
        ...GADGET_IDS.filter((g: GadgetId) => inv!.gadgets.includes(g)).map((g) => ({ id: g, pic: gadgetImg(g, 'small'), name: gadgetName(g), on: l.gadget === g, pick: () => save({ ...l, gadget: g }) })),
        { id: 'none', pic: none(), name: t('No equipment'), on: l.gadget === null, pick: () => save({ ...l, gadget: null }) },
      ]),
      h('div', { class: 'muted lobbykit__note' }, t('More weapons and their skins are in the Arsenal.')),
    );
  };
  draw();
  if (!inv)
    void online
      .loadInventory()
      .then((i) => {
        inv = i;
        draw();
      })
      .catch((e: Error) => toast(apiErrorText(e)));
  openSheet(root, { title: t('Weapons'), body, testid: 'lobby-kit', cls: 'sheet--kit' });
}
