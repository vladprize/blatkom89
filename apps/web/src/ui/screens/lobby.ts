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
      toast('Link copied');
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
        h('div', { class: 'n' }, p.name, ' ', h('span', { class: 'muted', style: 'font-size:14px' }, `${CHARACTERS[p.character].name} · lvl ${p.level}`)),
        p.isHost ? h('span', { class: 'badge badge--host' }, 'host') : null,
        !p.connected ? h('span', { class: 'badge badge--off' }, 'no signal') : p.ready ? h('span', { class: 'badge badge--ok' }, 'ready') : h('span', { class: 'badge' }, 'not ready'),
      ),
    ),
    ...Array.from({ length: Math.max(0, s.maxPlayers - s.players.length) }, () => h('div', { class: 'player muted', style: 'opacity:.45' }, h('div', { class: 'n' }, 'Free seat'))),
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
      h('div', { class: 'topbar' }, h('button', { class: 'back', onclick: o.onLeave }, '← Leave'), h('h1', { class: 'h1' }, s.isPrivate ? 'Room' : 'Quick game')),
      s.isPrivate && invite
        ? h(
            'div',
            { class: 'panel col' },
            h('span', { class: 'tag' }, 'Invitation'),
            s.inviteCode ? h('div', { class: 'code' }, s.inviteCode) : null,
            h('div', { class: 'muted', style: 'word-break:break-all;font-size:14px' }, invite),
            h(
              'div',
              { class: 'row' },
              h('button', { class: 'btn btn--red grow', onclick: () => (shareInvite(invite, 'District business won’t wait. Come on down to BLATKOM ’89!') ? null : void copy()) }, o.inTelegram ? 'Call the lads' : 'Share'),
              h('button', { class: 'btn grow', onclick: () => void copy() }, 'Copy'),
            ),
          )
        : null,
      h('div', { class: 'panel col' }, h('span', { class: 'tag' }, `Players ${connected}/${s.maxPlayers}`), players),
      h('div', { class: 'panel col' }, h('span', { class: 'tag' }, 'Map'), maps, h('div', { class: 'muted' }, s.isHost ? 'You host the room: you pick the map and start the match.' : 'The host picks the map.')),
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn grow', onclick: o.onCharacter }, 'Character: ', CHARACTERS[o.character].name),
        h('button', { class: `btn grow ${me?.ready ? '' : 'btn--red'}`, onclick: () => o.onReady(!me?.ready) }, me?.ready ? 'Not ready' : 'Ready'),
        s.isHost ? h('button', { class: 'btn btn--red grow', disabled: connected < 2, onclick: o.onStart }, connected < 2 ? 'Waiting for players…' : allReady ? 'Start' : 'Start without waiting') : null,
      ),
      h('div', { class: 'muted center' }, connected < 2 ? 'At least 2 players needed.' : allReady ? 'Everyone’s ready — the match starts by itself.' : 'The match starts when everyone is ready.'),
    ),
  );
}
