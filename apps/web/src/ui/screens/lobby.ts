import { h, toast } from '../dom.js';
import { isTeamMode } from '@blatkom/shared';
import type { CharacterId, GameMode, MapId, RosterEntry, Team } from '@blatkom/shared';
import type { LobbyState } from '../../net/OnlineClient.js';
import { shareInvite } from '../../telegram/tg.js';
import { t } from '../../i18n/index.js';
import { charName } from '../../i18n/content.js';
import { mapPicker } from '../maps.js';
import { avatarImg } from '../avatars.js';
import { MODE_ORDER, modeIcon, modeName, modeRules, modeSub } from '../modes.js';

/** The game modes as a 2×2 switch (disabled for room guests). */
export function modeSwitch(o: { mode: GameMode; onMode?: (m: GameMode) => void }): HTMLElement {
  let cur = o.mode;
  const box = h('div', { class: 'seg seg--modes', role: 'radiogroup', 'aria-label': t('Mode') });
  const draw = () =>
    box.replaceChildren(
      ...MODE_ORDER.map((m) =>
        h(
          'button',
          {
            class: `modebtn modebtn--${m}`,
            role: 'radio',
            'aria-checked': String(m === cur),
            'aria-pressed': String(m === cur),
            'data-mode': m,
            disabled: !o.onMode,
            onclick: () => {
              if (!o.onMode || m === cur) return;
              cur = m;
              draw();
              o.onMode(m);
            },
          },
          modeIcon(m),
          h('span', { class: 'modebtn__txt' }, h('b', null, modeName(m)), h('small', null, modeSub(m))),
        ),
      ),
    );
  draw();
  return box;
}

function playerRow(p: RosterEntry): HTMLElement {
  return h(
    'div',
    { class: `player ${p.team === 0 ? 'player--red' : p.team === 1 ? 'player--blue' : ''}` },
    avatarImg(p.avatar, p.character),
    h('div', { class: 'n' }, p.name, ' ', h('span', { class: 'muted', style: 'font-size:14px' }, `${charName(p.character)} · ${t('lvl')} ${p.level}`)),
    p.isHost ? h('span', { class: 'badge badge--host' }, t('host')) : null,
    !p.connected ? h('span', { class: 'badge badge--off' }, t('no signal')) : p.ready ? h('span', { class: 'badge badge--ok' }, t('ready')) : h('span', { class: 'badge' }, t('not ready')),
  );
}

const freeSeat = () => h('div', { class: 'player muted', style: 'opacity:.45' }, h('div', { class: 'n' }, t('Free seat')));

export function renderLobby(o: {
  state: LobbyState;
  character: CharacterId;
  onReady: (r: boolean) => void;
  onStart: () => void;
  onMap: (m: MapId) => void;
  onMode: (m: GameMode) => void;
  onTeam: (team: Team) => void;
  onCharacter: () => void;
  onLeave: () => void;
  inTelegram: boolean;
}): HTMLElement {
  const s = o.state;
  const me = s.players.find((p) => p.id === s.myId);
  const connected = s.players.filter((p) => p.connected).length;
  const allReady = s.players.filter((p) => p.connected).every((p) => p.ready);
  const invite = s.inviteUrl;
  const teams = isTeamMode(s.mode);
  const copy = async () => {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite);
      toast(t('Link copied'));
    } catch {
      toast(invite);
    }
  };
  let players: HTMLElement;
  if (teams) {
    const col = (team: Team) => {
      const list = s.players.filter((p) => p.team === team);
      const seats = Math.max(0, Math.ceil(s.maxPlayers / 2) - list.length);
      const mine = me?.team === team;
      return h(
        'div',
        { class: `teamcol teamcol--${team === 0 ? 'red' : 'blue'}` },
        h('div', { class: 'teamcol__head' }, h('b', null, team === 0 ? t('RED TEAM') : t('BLUE TEAM')), h('span', null, `${list.length}`)),
        h('div', { class: 'list' }, ...list.map(playerRow), ...Array.from({ length: seats }, freeSeat)),
        me && !mine ? h('button', { class: 'btn btn--small', 'data-team': String(team), onclick: () => o.onTeam(team) }, team === 0 ? t('Join the red team') : t('Join the blue team')) : null,
      );
    };
    players = h('div', { class: 'teams' }, col(0), col(1));
  } else {
    players = h('div', { class: 'list' }, ...s.players.map(playerRow), ...Array.from({ length: Math.max(0, s.maxPlayers - s.players.length) }, freeSeat));
  }
  return h(
    'div',
    { class: 'screen screen--dim' },
    h(
      'div',
      { class: 'wrap' },
      h('div', { class: 'topbar' }, h('button', { class: 'back', onclick: o.onLeave }, t('← Leave')), h('h1', { class: 'h1' }, s.isPrivate ? t('Room') : t('Quick game'))),
      s.isPrivate && invite
        ? h(
            'div',
            { class: 'panel col' },
            h('span', { class: 'tag' }, t('Invitation')),
            s.inviteCode ? h('div', { class: 'code' }, s.inviteCode) : null,
            h('div', { class: 'muted', style: 'word-break:break-all;font-size:14px' }, invite),
            h(
              'div',
              { class: 'row' },
              h('button', { class: 'btn btn--red grow', onclick: () => (shareInvite(invite, t('District business won’t wait. Come on down to BLATKOM ’89!')) ? null : void copy()) }, o.inTelegram ? t('Call the lads') : t('Share')),
              h('button', { class: 'btn grow', onclick: () => void copy() }, t('Copy')),
            ),
          )
        : null,
      h(
        'div',
        { class: 'panel col' },
        h('span', { class: 'tag' }, t('Mode')),
        modeSwitch({ mode: s.mode, ...(s.isHost ? { onMode: o.onMode } : {}) }),
        h('div', { class: 'muted', 'data-testid': 'mode-rules' }, modeRules(s.mode, s.limits)),
      ),
      h('div', { class: 'panel col' }, h('span', { class: 'tag' }, t('Players {n}/{max}', { n: connected, max: s.maxPlayers })), players),
      h(
        'div',
        { class: 'panel col' },
        h('span', { class: 'tag' }, t('Map')),
        mapPicker({ selected: s.mapId, ...(s.isHost ? { onPick: o.onMap } : {}) }),
        h('div', { class: 'muted' }, s.isHost ? t('You host the room: you pick the map and the mode and start the match.') : t('The host picks the map and the mode.')),
      ),
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn grow', onclick: o.onCharacter }, t('Character: {name}', { name: charName(o.character) })),
        h('button', { class: `btn grow ${me?.ready ? '' : 'btn--red'}`, onclick: () => o.onReady(!me?.ready) }, me?.ready ? t('Not ready') : t('Ready')),
        s.isHost ? h('button', { class: 'btn btn--red grow', disabled: connected < 2, onclick: o.onStart }, connected < 2 ? t('Waiting for players…') : allReady ? t('Start') : t('Start without waiting')) : null,
      ),
      h('div', { class: 'muted center' }, connected < 2 ? t('At least 2 players needed.') : allReady ? t('Everyone’s ready — the match starts by itself.') : t('The match starts when everyone is ready.')),
    ),
  );
}
