/**
 * Social screens: Friends (add by alias, requests, presence, private messages), the Top-100 table,
 * the lobby's «invite friends» panel and the card of an incoming invitation. Everything reads the
 * SocialClient store and redraws itself when it changes; the server decides every action.
 */
import { displayNameSchema, DM_MAX_LENGTH, LEADERBOARD_BY } from '@blatkom/shared';
import type { DirectMessage, FriendEntry, FriendRequestEntry, FriendStatus, LeaderboardBy, LeaderboardEntry, LeaderboardResponse, PlayerCard, RoomInviteEvent } from '@blatkom/shared';
import { h, fill, toast } from '../dom.js';
import { avatarImg } from '../avatars.js';
import type { OnlineClient } from '../../net/OnlineClient.js';
import type { SocialClient } from '../../net/SocialClient.js';
import { t } from '../../i18n/index.js';
import { mapName } from '../../i18n/content.js';
import { modeName } from '../modes.js';
import { apiErrorText } from '../../net/errors.js';
import { sfx } from '../../game/audio/Sfx.js';

const STATUS_ORDER: Record<FriendStatus, number> = { match: 0, lobby: 1, online: 2, offline: 3 };

const cardAva = (c: PlayerCard, cls = '') => avatarImg(c.avatar, c.character ?? 'petya', cls);

/** «5 min ago», «3 h ago», «2 d ago». */
export function ago(iso: string | null): string {
  if (!iso) return t('long ago');
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (min < 1) return t('just now');
  if (min < 60) return t('{n} min ago', { n: min });
  const hours = Math.round(min / 60);
  if (hours < 24) return t('{n} h ago', { n: hours });
  return t('{n} d ago', { n: Math.round(hours / 24) });
}

export function statusText(f: Pick<FriendEntry, 'status' | 'lastSeenAt'>): string {
  switch (f.status) {
    case 'match':
      return t('in a match');
    case 'lobby':
      return t('in a lobby');
    case 'online':
      return t('online');
    default:
      return t('offline · {ago}', { ago: ago(f.lastSeenAt) });
  }
}

const dot = (s: FriendStatus) => h('i', { class: `sdot sdot--${s}`, 'aria-hidden': 'true' });

/** Redraws `el` on every store change while it is on screen. */
function live(el: HTMLElement, social: SocialClient, draw: () => void): HTMLElement {
  const off = social.on((e) => {
    if (!el.isConnected) return off();
    if (e.type === 'changed' || e.type === 'link') draw();
  });
  draw();
  return el;
}

const sortFriends = (list: FriendEntry[]) => [...list].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name));

// ── Friends screen ─────────────────────────────────────────────────────────
export function renderFriends(o: { online: OnlineClient; root: HTMLElement; onPlayWith: (f: FriendEntry) => void; onTop: () => void }): HTMLElement {
  const { online } = o;
  const social = online.social;
  const myName = online.profile?.displayName ?? '';
  const input = h('input', { class: 'input', placeholder: t('Friend’s alias'), maxlength: '24', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': t('Friend’s alias'), 'data-testid': 'friend-alias' }) as HTMLInputElement;
  const send = async () => {
    const parsed = displayNameSchema.safeParse(input.value);
    if (!parsed.success) return toast(t('Enter the alias exactly as your friend has it'));
    try {
      const r = await online.api.friendRequest(parsed.data);
      input.value = '';
      sfx.play('click');
      toast(r.result === 'accepted' ? t('{name} is your friend now', { name: r.player.name }) : t('Request sent to {name}', { name: r.player.name }));
      await social.refresh();
    } catch (e) {
      toast(apiErrorText(e));
    }
  };
  input.addEventListener('keydown', (e) => (e as KeyboardEvent).key === 'Enter' && void send());
  const copyAlias = async () => {
    try {
      await navigator.clipboard.writeText(myName);
      toast(t('Alias copied'));
    } catch {
      toast(myName);
    }
  };
  const requests = h('div', { class: 'panel col', 'data-testid': 'friend-requests' });
  const list = h('div', { class: 'panel col', 'data-testid': 'friends-list' });
  const act = (fn: () => Promise<unknown>) => async () => {
    try {
      await fn();
      await social.refresh();
    } catch (e) {
      toast(apiErrorText(e));
    }
  };
  const reqRow = (r: FriendRequestEntry, mine: boolean) =>
    h(
      'div',
      { class: 'player friend', 'data-friend': r.name },
      cardAva(r),
      h('div', { class: 'n' }, r.name, ' ', h('span', { class: 'muted', style: 'font-size:14px' }, `${t('lvl')} ${r.level}`)),
      mine
        ? h('span', { class: 'muted', style: 'font-size:14px' }, t('waiting for an answer'))
        : h('button', { class: 'btn btn--small btn--red', 'data-testid': 'accept-friend', onclick: act(() => online.api.acceptFriend(r.id)) }, t('Accept')),
      h('button', { class: 'btn btn--small btn--ghost', onclick: act(() => online.api.removeFriend(r.id)) }, mine ? t('Cancel') : t('Decline')),
    );
  const friendRow = (f: FriendEntry) =>
    h(
      'div',
      { class: `player friend friend--${f.status}`, 'data-friend': f.name },
      h('span', { class: 'friend__ava' }, cardAva(f), dot(f.status)),
      h('div', { class: 'n col', style: 'gap:0;min-width:0' }, h('span', { class: 'friend__name' }, f.name), h('span', { class: 'muted friend__status' }, `${statusText(f)} · ${t('lvl')} ${f.level}`)),
      f.unread > 0 ? h('span', { class: 'nbadge', title: t('Unread messages') }, String(f.unread)) : null,
      h('button', { class: 'btn btn--small', 'data-testid': 'open-chat', onclick: () => openChat(o.root, online, f) }, t('Message')),
      h('button', { class: 'btn btn--small btn--red', disabled: f.status === 'offline', title: f.status === 'offline' ? t('Offline — they won’t see the invitation') : t('Create a room and invite'), onclick: () => o.onPlayWith(f) }, t('Play')),
    );
  const draw = () => {
    const inc = social.incoming;
    const out = social.outgoing;
    requests.classList.toggle('hidden', inc.length + out.length === 0);
    requests.replaceChildren(h('span', { class: 'tag' }, t('Requests · {n}', { n: inc.length + out.length })), h('div', { class: 'list', style: 'margin-top:6px' }, ...inc.map((r) => reqRow(r, false)), ...out.map((r) => reqRow(r, true))));
    const friends = sortFriends(social.friends);
    const on = friends.filter((f) => f.status !== 'offline').length;
    fill(
      list,
      h('span', { class: 'tag' }, t('Friends · {on} of {n} online', { on, n: friends.length })),
      !social.connected && social.loaded ? h('div', { class: 'muted', style: 'font-size:14px;margin-top:6px' }, t('Reconnecting — statuses may be out of date.')) : null,
      friends.length === 0
        ? h('div', { class: 'muted', style: 'margin-top:8px' }, social.loaded ? t('No friends yet. Add someone by alias — or find them in the Top-100.') : t('Loading…'))
        : h('div', { class: 'list', style: 'margin-top:6px' }, ...friends.map(friendRow)),
    );
  };
  const root = h(
    'div',
    { class: 'col' },
    h(
      'div',
      { class: 'panel col' },
      h('span', { class: 'tag' }, t('Add a friend')),
      h('div', { class: 'muted', style: 'margin-top:6px' }, t('Friends find you by your alias:'), ' ', h('b', { class: 'myalias', 'data-testid': 'my-alias' }, myName), ' ', h('button', { class: 'linkish', onclick: () => void copyAlias() }, t('copy'))),
      h('div', { class: 'row addfriend' }, input, h('button', { class: 'btn btn--red', 'data-testid': 'send-request', onclick: () => void send() }, t('Send request'))),
      h('button', { class: 'btn btn--small btn--ghost', style: 'align-self:flex-start', onclick: o.onTop }, t('Find players in the Top-100 →')),
    ),
    requests,
    list,
  );
  void social.refresh().catch((e) => toast(apiErrorText(e)));
  return live(root, social, draw);
}

// ── private messages ───────────────────────────────────────────────────────
const two = (n: number) => String(n).padStart(2, '0');
function msgTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const hm = `${two(d.getHours())}:${two(d.getMinutes())}`;
  return d.toDateString() === now.toDateString() ? hm : `${two(d.getDate())}.${two(d.getMonth() + 1)} ${hm}`;
}

/** The conversation with a friend (a dialog over the current screen). */
export function openChat(root: HTMLElement, online: OnlineClient, friend: FriendEntry): () => void {
  const social = online.social;
  const me = online.profile?.id ?? '';
  const msgs: DirectMessage[] = [];
  let more = false;
  let removeArmed = false;
  const log = h('div', { class: 'chat__log', 'data-testid': 'chat-log', role: 'log', 'aria-live': 'polite' });
  const status = h('div', { class: 'muted chat__status' });
  const input = h('textarea', { class: 'input chat__input', rows: '1', maxlength: String(DM_MAX_LENGTH), placeholder: t('Message'), 'aria-label': t('Message'), 'data-testid': 'chat-input' }) as HTMLTextAreaElement;
  const drawStatus = () => {
    const f = social.friend(friend.id) ?? friend;
    status.replaceChildren(dot(f.status), ' ', statusText(f));
  };
  const bubble = (m: DirectMessage) => h('div', { class: `msg ${m.from === me ? 'msg--me' : ''}`, 'data-id': String(m.id) }, h('div', { class: 'msg__text' }, m.text), h('div', { class: 'msg__time' }, msgTime(m.at), m.from === me && m.read ? ' ✓✓' : m.from === me ? ' ✓' : ''));
  const drawLog = (stick: boolean) => {
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    fill(
      log,
      more ? h('button', { class: 'btn btn--small btn--ghost chat__more', onclick: () => void loadOlder() }, t('Earlier messages')) : null,
      msgs.length === 0 ? h('div', { class: 'muted chat__empty' }, t('No messages yet — say hello.')) : null,
      ...msgs.map(bubble),
    );
    if (stick || atBottom) log.scrollTop = log.scrollHeight;
  };
  const add = (m: DirectMessage) => {
    if (msgs.some((x) => x.id === m.id)) return;
    msgs.push(m);
    msgs.sort((a, b) => a.id - b.id);
  };
  const markRead = () => {
    social.markRead(friend.id);
    void online.api.readMessages(friend.id).catch(() => {});
  };
  const loadOlder = async () => {
    try {
      const r = await online.api.messages(friend.id, msgs[0]?.id);
      const prevHeight = log.scrollHeight;
      for (const m of r.messages) add(m);
      more = r.more;
      drawLog(false);
      log.scrollTop = log.scrollHeight - prevHeight;
    } catch (e) {
      toast(apiErrorText(e));
    }
  };
  const sendMsg = async () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    try {
      const r = await online.api.sendMessage(friend.id, text);
      add(r.message);
      drawLog(true);
    } catch (e) {
      input.value = text;
      toast(apiErrorText(e));
    }
  };
  input.addEventListener('keydown', (e) => {
    const k = e as KeyboardEvent;
    if (k.key === 'Enter' && !k.shiftKey) {
      k.preventDefault();
      void sendMsg();
    }
  });
  const off = social.on((e) => {
    if (!ov.isConnected) return off();
    if (e.type === 'dm') {
      const other = e.message.from === me ? e.message.to : e.message.from;
      if (other !== friend.id) return;
      add(e.message);
      drawLog(e.message.from === me);
      if (e.message.from !== me) markRead();
    } else if (e.type === 'dm_read' && e.by === friend.id) {
      for (const m of msgs) if (m.from === me && m.id <= e.upTo) m.read = true;
      drawLog(false);
    } else if (e.type === 'presence' || e.type === 'changed') drawStatus();
    else if (e.type === 'friend_removed' && e.userId === friend.id) {
      toast(t('{name} removed you from friends', { name: friend.name }));
      close();
    }
  });
  const close = () => {
    off();
    if (social.openChat === friend.id) social.openChat = null;
    document.removeEventListener('keydown', onKey, true);
    ov.remove();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };
  const removeBtn = h('button', { class: 'linkish chat__remove' }, t('Remove from friends'));
  removeBtn.addEventListener('click', async () => {
    if (!removeArmed) {
      removeArmed = true;
      removeBtn.textContent = t('Sure? Tap again to remove');
      setTimeout(() => {
        removeArmed = false;
        removeBtn.textContent = t('Remove from friends');
      }, 4000);
      return;
    }
    try {
      await online.api.removeFriend(friend.id);
      await social.refresh();
      close();
    } catch (e) {
      toast(apiErrorText(e));
    }
  });
  const ov = h(
    'div',
    { class: 'overlay overlay--top', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('Conversation with {name}', { name: friend.name }) },
    h(
      'div',
      { class: 'panel modal col chat', 'data-testid': 'chat' },
      h('div', { class: 'chat__head' }, cardAva(friend), h('div', { class: 'col', style: 'gap:0;min-width:0;flex:1' }, h('b', { class: 'chat__name' }, friend.name), status), h('button', { class: 'iconbtn', 'aria-label': t('Close'), onclick: () => close() }, '✕')),
      log,
      h('div', { class: 'chat__foot' }, input, h('button', { class: 'btn btn--red', 'data-testid': 'chat-send', onclick: () => void sendMsg() }, t('Send'))),
      removeBtn,
    ),
  );
  social.openChat = friend.id;
  document.addEventListener('keydown', onKey, true);
  root.append(ov);
  drawStatus();
  drawLog(true);
  void online.api
    .messages(friend.id)
    .then((r) => {
      for (const m of r.messages) add(m);
      more = r.more;
      drawLog(true);
      markRead();
    })
    .catch((e) => toast(apiErrorText(e)));
  setTimeout(() => input.focus(), 50);
  return close;
}

// ── Top-100 ────────────────────────────────────────────────────────────────
const BY_LABEL: Record<LeaderboardBy, () => string> = { rating: () => t('Rating'), level: () => t('Level'), kills: () => t('Eliminations') };

export function renderTop(o: { online: OnlineClient; by?: LeaderboardBy; onBy?: (by: LeaderboardBy) => void }): HTMLElement {
  const { online } = o;
  const social = online.social;
  let by: LeaderboardBy = o.by ?? 'rating';
  let data: LeaderboardResponse | null = null;
  let error: string | null = null;
  const sent = new Set<string>();
  const tabs = h('div', { class: 'seg', role: 'tablist', 'aria-label': t('Sort by') });
  const mine = h('div', { class: 'panel col topme', 'data-testid': 'top-me' });
  const table = h('div', { class: 'panel table-scroll', 'data-testid': 'top-table' });
  const addFriend = async (e: LeaderboardEntry) => {
    try {
      const r = await online.api.friendRequest(e.name);
      sent.add(e.id);
      toast(r.result === 'accepted' ? t('{name} is your friend now', { name: e.name }) : t('Request sent to {name}', { name: e.name }));
      await social.refresh();
    } catch (err) {
      toast(apiErrorText(err));
    }
  };
  const relation = (id: string): 'me' | 'friend' | 'pending' | null => {
    if (id === online.profile?.id) return 'me';
    if (social.friend(id)) return 'friend';
    if (sent.has(id) || social.outgoing.some((r) => r.id === id) || social.incoming.some((r) => r.id === id)) return 'pending';
    return null;
  };
  const draw = () => {
    tabs.replaceChildren(
      ...LEADERBOARD_BY.map((b) =>
        h(
          'button',
          {
            role: 'tab',
            'aria-pressed': String(b === by),
            'aria-selected': String(b === by),
            'data-by': b,
            onclick: () => {
              if (b === by) return;
              by = b;
              o.onBy?.(b);
              data = null;
              draw();
              void load();
            },
          },
          BY_LABEL[b](),
        ),
      ),
    );
    const me = data?.me ?? null;
    mine.replaceChildren(
      h('span', { class: 'tag' }, t('Your place')),
      me
        ? h('div', { class: 'row', style: 'margin-top:6px;flex-wrap:nowrap' }, h('div', { class: 'toprank' }, `#${me.rank}`), h('div', { class: 'col', style: 'gap:0' }, h('b', null, me.name), h('span', { class: 'muted' }, t('rating {r} · level {l} · {k} eliminations · {w} wins', { r: me.rating, l: me.level, k: me.kills, w: me.wins }))))
        : h('div', { class: 'muted', style: 'margin-top:6px' }, data ? t('Finish an online match to get into the table.') : ''),
    );
    if (error) {
      table.replaceChildren(h('div', { class: 'muted' }, error));
      return;
    }
    if (!data) {
      table.replaceChildren(h('div', { class: 'muted' }, t('Loading…')));
      return;
    }
    if (data.entries.length === 0) {
      table.replaceChildren(h('div', { class: 'muted' }, t('The table is empty for now — the first finished online match puts its players on it.')));
      return;
    }
    const col = (b: LeaderboardBy, cls = 'num') => `${cls} c-${b}${b === by ? ' sorted' : ''}`;
    table.replaceChildren(
      h(
        'table',
        { class: 'table toptable' },
        h(
          'thead',
          null,
          h('tr', null, h('th', null, '#'), h('th', null, t('Player')), h('th', { class: col('level') }, t('Lvl')), h('th', { class: col('rating') }, t('Rating')), h('th', { class: col('kills') }, t('Elim')), h('th', { class: 'num c-wins' }, t('Wins')), h('th', null, '')),
        ),
        h(
          'tbody',
          null,
          ...data.entries.map((e) => {
            const rel = relation(e.id);
            return h(
              'tr',
              { class: `${rel === 'me' ? 'me' : ''} ${e.rank <= 3 ? `top${e.rank}` : ''}`, 'data-player': e.name },
              h('td', { class: 'toprank-cell' }, String(e.rank)),
              h('td', null, h('span', { class: 'topname' }, cardAva(e), h('span', null, e.name))),
              h('td', { class: col('level') }, String(e.level)),
              h('td', { class: col('rating') }, String(e.rating)),
              h('td', { class: col('kills') }, String(e.kills)),
              h('td', { class: 'num c-wins' }, String(e.wins)),
              h(
                'td',
                { class: 'num' },
                rel === null
                  ? h('button', { class: 'btn btn--small topadd', title: t('Add to friends'), 'aria-label': t('Add {name} to friends', { name: e.name }), onclick: () => void addFriend(e) }, '+')
                  : rel === 'friend'
                    ? h('span', { class: 'muted', title: t('Friend') }, '★')
                    : rel === 'pending'
                      ? h('span', { class: 'muted', title: t('Request sent') }, '…')
                      : null,
              ),
            );
          }),
        ),
      ),
    );
  };
  const load = async () => {
    error = null;
    const want = by;
    try {
      const r = await online.api.leaderboard(want);
      if (want !== by) return;
      data = r;
    } catch (e) {
      error = apiErrorText(e);
    }
    draw();
  };
  const note = h('div', { class: 'muted', style: 'font-size:14px' }, t('Players with at least one finished online match. Rating starts at 1000: a free-for-all brings up to +16 for first place and −16 for last, a team win +16, a loss −16, leaving early −16. The table refreshes every 30 seconds.'));
  const root = h('div', { class: 'col' }, tabs, mine, table, note);
  void load();
  return live(root, social, draw);
}

// ── the lobby: invite friends ──────────────────────────────────────────────
/** Friends who are not in this room, with an «Invite» button (the server delivers it live). */
export function friendsInvitePanel(o: { online: OnlineClient; roomId: string; inRoom: (id: string) => boolean; onFriends: () => void }): HTMLElement {
  const { online } = o;
  const social = online.social;
  const panel = h('div', { class: 'panel col', 'data-testid': 'invite-friends' });
  const invite = async (f: FriendEntry) => {
    try {
      const r = await online.api.inviteFriend(f.id, o.roomId);
      online.invited.set(f.id, Date.now());
      toast(r.delivered ? t('Invitation sent to {name}', { name: f.name }) : t('{name} is offline — the invitation won’t reach them', { name: f.name }));
      draw();
    } catch (e) {
      toast(apiErrorText(e));
    }
  };
  const draw = () => {
    const friends = sortFriends(social.friends).filter((f) => !o.inRoom(f.id));
    const recently = (id: string) => Date.now() - (online.invited.get(id) ?? 0) < 30_000;
    panel.replaceChildren(
      h('span', { class: 'tag' }, t('Invite friends')),
      friends.length === 0
        ? h('div', { class: 'muted', style: 'margin-top:6px' }, social.friends.length ? t('All your friends are here already.') : t('No friends yet — add them in the menu: Friends.'), ' ', h('button', { class: 'linkish', onclick: o.onFriends }, t('Friends →')))
        : h(
            'div',
            { class: 'list', style: 'margin-top:6px' },
            ...friends.slice(0, 12).map((f) =>
              h(
                'div',
                { class: `player friend friend--${f.status}`, 'data-friend': f.name },
                h('span', { class: 'friend__ava' }, cardAva(f), dot(f.status)),
                h('div', { class: 'n col', style: 'gap:0;min-width:0' }, h('span', { class: 'friend__name' }, f.name), h('span', { class: 'muted friend__status' }, statusText(f))),
                h(
                  'button',
                  { class: `btn btn--small ${recently(f.id) ? '' : 'btn--red'}`, 'data-testid': 'invite-friend', disabled: f.status === 'offline' || recently(f.id), onclick: () => void invite(f) },
                  recently(f.id) ? t('Invited ✓') : t('Invite'),
                ),
              ),
            ),
          ),
    );
  };
  if (!social.loaded) void social.refresh().catch(() => {});
  return live(panel, social, draw);
}

// ── an incoming invitation ─────────────────────────────────────────────────
/** A card at the top of the screen: «Petya calls you to play — Capture the Flag · Factory». */
export function showInviteCard(o: { invite: RoomInviteEvent; inMatch: boolean; onJoin: () => void; onDismiss: () => void }): () => void {
  const inv = o.invite;
  let done = false;
  const close = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    card.remove();
  };
  const card = h(
    'div',
    { class: 'invitecard panel', role: 'alertdialog', 'aria-label': t('Invitation from {name}', { name: inv.from.name }), 'data-testid': 'invite-card' },
    cardAva(inv.from),
    h('div', { class: 'col', style: 'gap:0;min-width:0;flex:1' }, h('b', null, t('{name} calls you to play', { name: inv.from.name })), h('span', { class: 'muted' }, `${modeName(inv.mode)} · ${mapName(inv.mapId)}`)),
    h(
      'button',
      {
        class: 'btn btn--small btn--red',
        'data-testid': 'invite-join',
        onclick: () => {
          close();
          o.onJoin();
        },
      },
      o.inMatch ? t('Leave and join') : t('Join'),
    ),
    h(
      'button',
      {
        class: 'iconbtn',
        'aria-label': t('Later'),
        onclick: () => {
          close();
          o.onDismiss();
        },
      },
      '✕',
    ),
  );
  document.body.append(card);
  sfx.play('click');
  const timer = setTimeout(close, 30_000);
  return close;
}

/** «2 friends online» under the Friends button. */
export function friendsSub(social: SocialClient): string {
  if (!social.loaded) return t('by alias, chat, invites');
  const n = social.onlineCount();
  return n > 0 ? t('{n} online', { n }) : t('by alias, chat, invites');
}
