import { h, portrait, toast } from '../dom.js';
import { MAP_ORDER, getMap, CHARACTERS } from '@blatkom/shared';
import type { CharacterId, MapId } from '@blatkom/shared';
import type { LobbyState } from '../../net/OnlineClient.js';
import { shareInvite } from '../../telegram/tg.js';

export function renderLobby(o: {
  state: LobbyState;
  character: CharacterId;
  onReady: (r: boolean) => void;
  onStart: () => void;
  onMap: (m: MapId) => void;
  onCharacter: () => void;
  onLeave: () => void;
  inTelegram: boolean;
}): HTMLElement {
  const s = o.state;
  const me = s.players.find((p) => p.id === s.myId);
  const connected = s.players.filter((p) => p.connected).length;
  const allReady = s.players.filter((p) => p.connected).every((p) => p.ready);
  const invite = s.inviteUrl;
  const copy = async () => {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite);
      toast('Ссылка скопирована');
    } catch {
      toast(invite);
    }
  };
  const players = h(
    'div',
    { class: 'list' },
    ...s.players.map((p) =>
      h(
        'div',
        { class: 'player' },
        portrait(p.character, true),
        h('div', { class: 'n' }, p.name, ' ', h('span', { class: 'muted', style: 'font-size:14px' }, `${CHARACTERS[p.character].name} · ур. ${p.level}`)),
        p.isHost ? h('span', { class: 'badge badge--host' }, 'хозяин') : null,
        !p.connected ? h('span', { class: 'badge badge--off' }, 'нет связи') : p.ready ? h('span', { class: 'badge badge--ok' }, 'готов') : h('span', { class: 'badge' }, 'не готов'),
      ),
    ),
    ...Array.from({ length: Math.max(0, s.maxPlayers - s.players.length) }, () => h('div', { class: 'player muted', style: 'opacity:.45' }, h('div', { class: 'n' }, 'Свободное место'))),
  );
  const maps = h(
    'div',
    { class: 'seg' },
    ...MAP_ORDER.map((m) => h('button', { 'aria-pressed': String(m === s.mapId), disabled: !s.isHost, onclick: () => s.isHost && o.onMap(m) }, getMap(m).name)),
  );
  return h(
    'div',
    { class: 'screen screen--dim' },
    h(
      'div',
      { class: 'wrap' },
      h('div', { class: 'topbar' }, h('button', { class: 'back', onclick: o.onLeave }, '← Выйти'), h('h1', { class: 'h1' }, s.isPrivate ? 'Комната' : 'Быстрая игра')),
      s.isPrivate && invite
        ? h(
            'div',
            { class: 'panel col' },
            h('span', { class: 'tag' }, 'Приглашение'),
            s.inviteCode ? h('div', { class: 'code' }, s.inviteCode) : null,
            h('div', { class: 'muted', style: 'word-break:break-all;font-size:14px' }, invite),
            h(
              'div',
              { class: 'row' },
              h('button', { class: 'btn btn--red grow', onclick: () => (shareInvite(invite, 'Районные дела ждут. Заходи в БЛАТКОМ ’89!') ? null : void copy()) }, o.inTelegram ? 'Позвать друзей' : 'Поделиться'),
              h('button', { class: 'btn grow', onclick: () => void copy() }, 'Копировать'),
            ),
          )
        : null,
      h('div', { class: 'panel col' }, h('span', { class: 'tag' }, `Игроки ${connected}/${s.maxPlayers}`), players),
      h('div', { class: 'panel col' }, h('span', { class: 'tag' }, 'Карта'), maps, h('div', { class: 'muted' }, s.isHost ? 'Вы хозяин комнаты: выбираете карту и запускаете матч.' : 'Карту выбирает хозяин комнаты.')),
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn grow', onclick: o.onCharacter }, 'Персонаж: ', CHARACTERS[o.character].name),
        h('button', { class: `btn grow ${me?.ready ? '' : 'btn--red'}`, onclick: () => o.onReady(!me?.ready) }, me?.ready ? 'Не готов' : 'Готов'),
        s.isHost ? h('button', { class: 'btn btn--red grow', disabled: connected < 2, onclick: o.onStart }, connected < 2 ? 'Ждём игроков…' : allReady ? 'Начать' : 'Начать без ожидания') : null,
      ),
      h('div', { class: 'muted center' }, connected < 2 ? 'Нужно минимум 2 игрока.' : allReady ? 'Все готовы — матч начнётся автоматически.' : 'Матч начнётся, когда все будут готовы.'),
    ),
  );
}
