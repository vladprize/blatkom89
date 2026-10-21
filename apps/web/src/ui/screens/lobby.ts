import { h, toast } from '../dom.js';
import { isTeamMode } from '@blatkom/shared';
import type { CharacterId, GameMode, MapId, RosterEntry, Team } from '@blatkom/shared';
import type { LobbyState } from '../../net/OnlineClient.js';
import { shareInvite } from '../../telegram/tg.js';
import { t } from '../../i18n/index.js';
import { charName } from '../../i18n/content.js';
import { mapField, mapPicker } from '../maps.js';
import { openSheet } from '../sheet.js';
import { avatarImg } from '../avatars.js';
import { MODE_ORDER, modeIcon, modeName, modeRules, modeShort, modeSub } from '../modes.js';

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
          h('span', { class: 'modebtn__txt' }, h('b', { class: 'modebtn__long' }, modeName(m)), h('b', { class: 'modebtn__short' }, modeShort(m)), h('small', null, modeSub(m))),
        ),
      ),
    );
  draw();
  return box;
}

function playerRow(p: RosterEntry): HTMLElement {
  const state = !p.connected ? 'off' : p.ready ? 'ok' : 'wait';
  const stateText = !p.connected ? t('no signal') : p.ready ? t('ready') : t('not ready');
  return h(
    'div',
    { class: `player ${p.team === 0 ? 'player--red' : p.team === 1 ? 'player--blue' : ''}` },
    avatarImg(p.avatar, p.character),
    h('div', { class: 'n' }, h('span', { class: 'player__name' }, p.name), ' ', h('span', { class: 'muted player__meta', style: 'font-size:14px' }, `${charName(p.character)} · ${t('lvl')} ${p.level}`)),
    p.isHost ? h('span', { class: 'badge badge--host' }, t('host')) : null,
    h('span', { class: `badge ${state === 'off' ? 'badge--off' : state === 'ok' ? 'badge--ok' : ''}` }, stateText),
    // phones: the same as two small marks (a star for the host, a coloured dot for the state)
    p.isHost ? h('span', { class: 'pstar', title: t('host'), 'aria-hidden': 'true' }, '★') : null,
    h('span', { class: `pdot pdot--${state}`, title: stateText, 'aria-hidden': 'true' }),
  );
}

const freeSeat = () => h('div', { class: 'player player--free muted' }, h('div', { class: 'n' }, t('Free seat')));

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
  /** Online: the «invite friends» panel (under the players). */
  extra?: HTMLElement | null;
  /** Online: the room chat (under the players). */
  chat?: HTMLElement | null;
}): HTMLElement {
  const s = o.state;
  const me = s.players.find((p) => p.id === s.myId);
  const connected = s.players.filter((p) => p.connected).length;
  const allReady = s.players.filter((p) => p.connected).every((p) => p.ready);
  const canStart = connected >= s.minToStart;
  const note =
    connected >= 2
      ? allReady
        ? t('Everyone’s ready — the match starts by itself.')
        : t('The match starts when everyone is ready.')
      : s.minToStart > 1
        ? t('At least 2 players needed.')
        : !s.isPrivate
          ? t('Looking for players — the match starts by itself.')
          : s.isHost
            ? t('Start whenever you like — more players join at kick-off.')
            : t('The host starts the match — more players join at kick-off.');
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
        me && !mine ? h('button', { class: 'btn btn--small teamcol__join', 'data-team': String(team), onclick: () => o.onTeam(team) }, h('span', { class: 'long' }, team === 0 ? t('Join the red team') : t('Join the blue team')), h('span', { class: 'short' }, t('Join'))) : null,
      );
    };
    players = h('div', { class: 'teams' }, col(0), col(1));
  } else {
    players = h('div', { class: 'list' }, ...s.players.map(playerRow), ...Array.from({ length: Math.max(0, s.maxPlayers - s.players.length) }, freeSeat));
  }
  // phones: «invite friends» opens in a sheet from a button by the players instead of its own panel
  const extra = o.extra ?? null;
  const inviteBtn = extra
    ? h(
        'button',
        {
          class: 'btn btn--small lobby__invite-btn',
          'data-testid': 'invite-open',
          onclick: () => {
            extra.classList.add('panel--insheet');
            openSheet(document.getElementById('ui')!, { title: t('Invite friends'), body: extra, testid: 'invite-sheet' });
          },
        },
        `＋ ${t('Invite')}`,
      )
    : null;
  return h(
    'div',
    { class: 'screen screen--dim' },
    h(
      'div',
      { class: `wrap lobby ${s.isPrivate ? 'lobby--private' : ''} ${teams ? 'lobby--teams' : ''}` },
      h(
        'div',
        { class: 'topbar' },
        h('button', { class: 'back', onclick: o.onLeave }, t('← Leave')),
        h('h1', { class: 'h1' }, s.isPrivate ? t('Room') : t('Quick game')),
        // phones: the room code with Share and Copy right in the top bar
        s.isPrivate && invite
          ? h(
              'div',
              { class: 'topbar__invite' },
              s.inviteCode ? h('span', { class: 'code' }, s.inviteCode) : null,
              h('button', { class: 'btn btn--small btn--red', onclick: () => (shareInvite(invite, t('District business won’t wait. Come on down to BLATKOM ’89!')) ? null : void copy()) }, o.inTelegram ? t('Call the lads') : t('Share')),
              h('button', { class: 'btn btn--small topbar__copy', onclick: () => void copy() }, t('Copy')),
            )
          : null,
      ),
      s.isPrivate && invite
        ? h(
            'div',
            { class: 'panel col lobby__invite' },
            h('span', { class: 'tag' }, t('Invitation')),
            s.inviteCode ? h('div', { class: 'code' }, s.inviteCode) : null,
            h('div', { class: 'muted lobby__link', style: 'word-break:break-all;font-size:14px' }, invite),
            h(
              'div',
              { class: 'row lobby__share' },
              h('button', { class: 'btn btn--red grow', onclick: () => (shareInvite(invite, t('District business won’t wait. Come on down to BLATKOM ’89!')) ? null : void copy()) }, o.inTelegram ? t('Call the lads') : t('Share')),
              h('button', { class: 'btn grow', onclick: () => void copy() }, t('Copy')),
            ),
          )
        : null,
      // a private room: inviting friends comes right after the link; a public one: under the players
      s.isPrivate && extra ? h('div', { class: 'lobby__extra' }, extra) : null,
      h(
        'div',
        { class: 'panel col lobby__mode' },
        h('span', { class: 'tag' }, t('Mode')),
        h(
          'button',
          {
            class: 'btn btn--small lobby__rules-btn',
            'data-testid': 'rules-open',
            onclick: () => openSheet(document.getElementById('ui')!, { title: modeName(s.mode), body: h('div', { class: 'lore' }, modeRules(s.mode, s.limits)), testid: 'rules-sheet' }),
          },
          t('Rules'),
        ),
        modeSwitch({ mode: s.mode, ...(s.isHost ? { onMode: o.onMode } : {}) }),
        h('div', { class: 'muted lobby__rules', 'data-testid': 'mode-rules' }, modeRules(s.mode, s.limits)),
        // phones: the map as one line under the modes (the grid opens in a sheet)
        h('div', { class: 'lobby__mapline' }, mapField({ selected: s.mapId, variant: 'line', ...(s.isHost ? { onPick: o.onMap } : {}) })),
      ),
      h('div', { class: 'panel col lobby__players' }, h('span', { class: 'tag' }, t('Players {n}/{max}', { n: connected, max: s.maxPlayers })), inviteBtn, players),
      o.chat ?? null,
      !s.isPrivate && extra ? h('div', { class: 'lobby__extra' }, extra) : null,
      h(
        'div',
        { class: 'panel col lobby__map' },
        h('span', { class: 'tag' }, t('Map')),
        mapPicker({ selected: s.mapId, ...(s.isHost ? { onPick: o.onMap } : {}) }),
        h('div', { class: 'muted lobby__maphint' }, s.isHost ? t('You host the room: you pick the map and the mode and start the match.') : t('The host picks the map and the mode.')),
      ),
      h(
        'div',
        { class: 'row lobby__actions' },
        h('button', { class: 'btn grow', onclick: o.onCharacter }, t('Character: {name}', { name: charName(o.character) })),
        h('button', { class: `btn grow ${me?.ready ? '' : 'btn--red'}`, onclick: () => o.onReady(!me?.ready) }, me?.ready ? t('Not ready') : t('Ready')),
        s.isHost
          ? h('button', { class: 'btn btn--red grow', 'data-testid': 'lobby-start', disabled: !canStart, onclick: o.onStart }, !canStart ? t('Waiting for players…') : allReady || connected < 2 ? t('Start') : t('Start without waiting'))
          : null,
      ),
      h('div', { class: 'muted center lobby__note', 'data-testid': 'lobby-note' }, note),
    ),
  );
}
