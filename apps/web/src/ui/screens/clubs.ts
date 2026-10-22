/**
 * Clubs (v0.3): the table of clubs with the player's own club on top, a club's page (its flag, people
 * and the actions the player's standing allows: ask to join, withdraw, leave; the head also answers
 * requests, shows people out, changes the flag, opens or closes recruiting, disbands), and the editor
 * that founds a club or changes its colours.
 */
import { CLUB_PALETTE, CLUB_RULES, EMBLEM_ICONS, FLAG_PATTERNS, clubMottoSchema, clubNameSchema, clubTagSchema, toLatin, transliterate } from '@blatkom/shared';
import type { ClubDetails, ClubEmblem, ClubFlag, ClubMember, ClubSummary, ClubsResponse, CreateClubBody, EmblemIcon, FlagPattern, UpdateClubBody } from '@blatkom/shared';
import { fill, h, toast } from '../dom.js';
import { avatarImg } from '../avatars.js';
import { clubFlag } from '../clubFlag.js';
import { t, count } from '../../i18n/index.js';
import { apiErrorText } from '../../net/errors.js';
import { confirmAsync } from '../../telegram/tg.js';

export interface ClubsApi {
  clubs(q?: string): Promise<ClubsResponse>;
  club(id: string): Promise<ClubDetails>;
  createClub(body: CreateClubBody): Promise<ClubDetails>;
  updateClub(id: string, body: UpdateClubBody): Promise<ClubDetails>;
  setClubRecruiting(id: string, recruiting: boolean): Promise<ClubDetails>;
  requestClub(id: string): Promise<ClubDetails>;
  cancelClubRequest(id: string): Promise<ClubDetails>;
  answerClubRequest(id: string, userId: string, accept: boolean): Promise<ClubDetails>;
  kickFromClub(id: string, userId: string): Promise<ClubDetails>;
  leaveClub(): Promise<{ left: string; closed: boolean }>;
  disbandClub(id: string): Promise<{ disbanded: string }>;
}

/** «[ТАГ] Name» as one element (the tag in the club's colours). */
export function clubLabel(c: Pick<ClubSummary, 'name' | 'tag'>): HTMLElement {
  return h('span', { class: 'clublabel' }, h('span', { class: 'clubtag' }, `[${c.tag}]`), ' ', h('span', { class: 'clubname' }, c.name));
}

function summaryLine(c: ClubSummary): string {
  return t('#{rank} · rating {r} · {n}/{max}', { rank: c.rank, r: c.rating, n: c.members, max: CLUB_RULES.maxMembers });
}

// ── the table ───────────────────────────────────────────────────────────────────────────────────────

export function renderClubs(o: { api: ClubsApi; level: number; tokens: number; onOpen: (id: string) => void; onFound: () => void; onLoaded?: (r: ClubsResponse) => void }): HTMLElement {
  let data: ClubsResponse | null = null;
  let error: string | null = null;
  let query = '';
  let timer: ReturnType<typeof setTimeout> | null = null;
  const mine = h('div', { class: 'panel col clubmine', 'data-testid': 'club-mine' });
  const list = h('div', { class: 'panel col clublist', 'data-testid': 'club-table' });
  const search = h('input', {
    class: 'input',
    type: 'search',
    placeholder: t('Search by name or tag'),
    'aria-label': t('Search by name or tag'),
    maxlength: 24,
    'data-testid': 'club-search',
    oninput: () => {
      query = search.value.trim();
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void load(), 300);
    },
  });
  const row = (c: ClubSummary, isMine: boolean) =>
    h(
      'button',
      { class: `clubrow ${isMine ? 'clubrow--mine' : ''} ${c.rank <= 3 ? `top${c.rank}` : ''}`, 'data-club': c.id, 'data-testid': 'club-row', onclick: () => o.onOpen(c.id) },
      h('span', { class: 'clubrow__rank' }, String(c.rank)),
      clubFlag(c.flag, c.emblem, { size: 42 }),
      h('span', { class: 'clubrow__txt' }, clubLabel(c), h('small', { class: 'muted' }, count(c.members, 'member'), data?.requested.includes(c.id) ? ` · ${t('request sent')}` : !c.recruiting ? ` · ${t('not recruiting')}` : '')),
      h('span', { class: 'clubrow__rating' }, String(c.rating)),
    );
  const draw = () => {
    const my = data?.mine ?? null;
    const canFound = o.level >= CLUB_RULES.createLevel && o.tokens >= CLUB_RULES.createTokens;
    mine.replaceChildren(
      h('span', { class: 'tag' }, t('My gang')),
      my
        ? h('div', { class: 'col', style: 'gap:6px;margin-top:4px' }, row(my, true), data && data.incoming > 0 ? h('div', { class: 'clubnote' }, t('Requests waiting for your answer: {n}', { n: data.incoming })) : null)
        : h(
            'div',
            { class: 'col', style: 'gap:8px;margin-top:4px' },
            h('div', { class: 'muted' }, data?.requested.length ? t('Your requests are waiting for an answer. Meanwhile you can start your own gang.') : t('You are not in a gang yet. Ask to join one from the table — or start your own.')),
            h(
              'button',
              { class: 'btn btn--red', 'data-testid': 'club-found', disabled: !canFound, onclick: () => o.onFound() },
              t('Start a gang'),
              h('span', { class: 'sub' }, !canFound ? t('from level {l} · {talons}', { l: CLUB_RULES.createLevel, talons: count(CLUB_RULES.createTokens, 'talon') }) : CLUB_RULES.createTokens > 0 ? count(CLUB_RULES.createTokens, 'talon') : t('free')),
            ),
          ),
    );
    if (error) return void list.replaceChildren(h('span', { class: 'tag' }, t('Gang table')), h('div', { class: 'muted' }, error));
    if (!data) return void list.replaceChildren(h('span', { class: 'tag' }, t('Gang table')), h('div', { class: 'muted' }, t('Loading…')));
    list.replaceChildren(
      h('span', { class: 'tag' }, query.length >= 2 ? t('Search') : t('Gang table')),
      search,
      data.clubs.length ? h('div', { class: 'clubrows' }, ...data.clubs.map((c) => row(c, c.id === my?.id))) : h('div', { class: 'muted' }, t('No gangs found.')),
      h('div', { class: 'muted', style: 'font-size:13px' }, t('A gang’s rating rises and falls with its people’s results: every rating point a member wins or loses in a match counts for the gang too.')),
    );
    if (query && document.activeElement !== search) search.focus();
  };
  const load = async () => {
    error = null;
    const q = query;
    try {
      const r = await o.api.clubs(q.length >= 2 ? q : undefined);
      if (q !== query) return;
      data = r;
      o.onLoaded?.(r);
    } catch (e) {
      error = apiErrorText(e);
    }
    draw();
  };
  draw();
  void load();
  return h('div', { class: 'col clubs' }, mine, list);
}

// ── a club's page ───────────────────────────────────────────────────────────────────────────────────

export function renderClub(o: { api: ClubsApi; id: string; myId: string | null; onEdit: (c: ClubDetails) => void; onGone: () => void; onChanged?: () => void }): HTMLElement {
  let c: ClubDetails | null = null;
  let error: string | null = null;
  let busy = false;
  const root = h('div', { class: 'col club', 'data-testid': 'club-page' });
  const act = async (f: () => Promise<ClubDetails | null>, done?: string) => {
    if (busy) return;
    busy = true;
    try {
      const next = await f();
      if (next) c = next;
      if (done) toast(done);
      o.onChanged?.();
    } catch (e) {
      toast(apiErrorText(e));
    } finally {
      busy = false;
      draw();
    }
  };
  const member = (m: ClubMember, club: ClubDetails) =>
    h(
      'div',
      { class: `clubmember ${m.id === o.myId ? 'me' : ''}`, 'data-member': m.name },
      avatarImg(m.avatar, m.character ?? 'petya', 'clubmember__ava'),
      h('span', { class: 'clubmember__txt' }, h('b', null, m.name), h('small', { class: 'muted' }, t('level {l}', { l: m.level }))),
      m.role === 'head' ? h('span', { class: 'clubrole' }, t('Boss')) : null,
      club.me === 'head' && m.role !== 'head' && club.memberList.some((x) => x.id === o.myId && x.role === 'head')
        ? h(
            'button',
            {
              class: 'btn btn--small btn--ghost',
              'aria-label': t('Show {name} out of the gang', { name: m.name }),
              onclick: () =>
                void (async () => {
                  if (!(await confirmAsync(t('Show {name} out of the gang?', { name: m.name })))) return;
                  await act(() => o.api.kickFromClub(club.id, m.id), t('{name} is out of the gang', { name: m.name }));
                })(),
            },
            '✕',
          )
        : null,
    );
  const actions = (club: ClubDetails): HTMLElement => {
    const box = h('div', { class: 'clubactions' });
    switch (club.me) {
      case 'none':
        box.append(
          club.recruiting
            ? h('button', { class: 'btn btn--red', 'data-testid': 'club-join', onclick: () => void act(() => o.api.requestClub(club.id), t('Request sent to «{name}»', { name: club.name })) }, t('Ask to join'))
            : h('button', { class: 'btn', disabled: true }, club.members >= CLUB_RULES.maxMembers ? t('The gang is full') : t('Not recruiting')),
        );
        break;
      case 'requested':
        box.append(h('div', { class: 'clubnote', 'data-testid': 'club-requested' }, t('Request sent — the gang’s boss decides.')), h('button', { class: 'btn btn--small', onclick: () => void act(() => o.api.cancelClubRequest(club.id)) }, t('Withdraw')));
        break;
      case 'member':
        box.append(h('button', { class: 'btn', 'data-testid': 'club-leave', onclick: () => void leave(club) }, t('Leave the gang')));
        break;
      case 'head':
        box.classList.add('clubactions--head');
        box.append(
          h('button', { class: 'btn btn--small', 'data-testid': 'club-edit', onclick: () => o.onEdit(club) }, t('Flag and motto')),
          h('button', { class: 'btn btn--small', 'data-testid': 'club-recruiting', onclick: () => void act(() => o.api.setClubRecruiting(club.id, !club.recruiting)) }, club.recruiting ? t('Close recruiting') : t('Open recruiting')),
          h('button', { class: 'btn btn--small btn--ghost', onclick: () => void leave(club) }, t('Leave the gang')),
          h(
            'button',
            {
              class: 'btn btn--small btn--ghost',
              'data-testid': 'club-disband',
              onclick: () =>
                void (async () => {
                  if (!(await confirmAsync(t('Disband «{name}»? Everybody leaves the gang, its rating is lost.', { name: club.name })))) return;
                  try {
                    await o.api.disbandClub(club.id);
                    toast(t('The gang is disbanded'));
                    o.onChanged?.();
                    o.onGone();
                  } catch (e) {
                    toast(apiErrorText(e));
                  }
                })(),
            },
            t('Disband'),
          ),
        );
        break;
    }
    return box;
  };
  const leave = async (club: ClubDetails) => {
    const head = club.me === 'head';
    const others = club.memberList.filter((m) => m.id !== o.myId).length;
    const text = head && others === 0 ? t('Leave «{name}»? You are its last member: the gang closes.', { name: club.name }) : head ? t('Leave «{name}»? The longest-standing member becomes its boss.', { name: club.name }) : t('Leave «{name}»?', { name: club.name });
    if (!(await confirmAsync(text))) return;
    try {
      await o.api.leaveClub();
      toast(t('You are not in «{name}» any more', { name: club.name }));
      o.onChanged?.();
      o.onGone();
    } catch (e) {
      toast(apiErrorText(e));
    }
  };
  const draw = () => {
    if (error) return void root.replaceChildren(h('div', { class: 'panel muted' }, error));
    if (!c) return void root.replaceChildren(h('div', { class: 'panel muted' }, t('Loading…')));
    const club = c;
    fill(
      root,
      h(
        'div',
        { class: 'panel clubhead' },
        clubFlag(club.flag, club.emblem, { size: 150, label: t('Flag of {name}', { name: club.name }) }),
        h('div', { class: 'col', style: 'gap:4px;min-width:0' }, h('div', { class: 'clubhead__name' }, clubLabel(club)), club.motto ? h('div', { class: 'clubhead__motto' }, `«${club.motto}»`) : null, h('div', { class: 'muted' }, summaryLine(club)), actions(club)),
      ),
      club.me === 'head' && club.requests.length
        ? h(
            'div',
            { class: 'panel col', 'data-testid': 'club-requests' },
            h('span', { class: 'tag' }, t('Requests · {n}', { n: club.requests.length })),
            ...club.requests.map((r) =>
              h(
                'div',
                { class: 'clubmember', 'data-request': r.name },
                avatarImg(r.avatar, r.character ?? 'petya', 'clubmember__ava'),
                h('span', { class: 'clubmember__txt' }, h('b', null, r.name), h('small', { class: 'muted' }, t('level {l}', { l: r.level }))),
                h('button', { class: 'btn btn--small btn--red', 'aria-label': t('Take {name} in', { name: r.name }), onclick: () => void act(() => o.api.answerClubRequest(club.id, r.id, true), t('{name} is in the gang', { name: r.name })) }, t('Accept')),
                h('button', { class: 'btn btn--small', 'aria-label': t('Turn {name} down', { name: r.name }), onclick: () => void act(() => o.api.answerClubRequest(club.id, r.id, false)) }, '✕'),
              ),
            ),
          )
        : null,
      h('div', { class: 'panel col' }, h('span', { class: 'tag' }, t('People · {n}', { n: club.memberList.length })), h('div', { class: 'clubmembers' }, ...club.memberList.map((m) => member(m, club)))),
    );
  };
  void o.api
    .club(o.id)
    .then((d) => (c = d))
    .catch((e) => (error = apiErrorText(e)))
    .finally(draw);
  draw();
  return root;
}

// ── founding and the flag editor ────────────────────────────────────────────────────────────────────

const ICON_LABEL: Record<EmblemIcon, () => string> = {
  none: () => t('No emblem'),
  star: () => t('Star'),
  gear: () => t('Gear'),
  wrench: () => t('Wrench'),
  cassette: () => t('Cassette'),
  bolt: () => t('Lightning'),
  rocket: () => t('Rocket'),
  satellite: () => t('Satellite'),
  anchor: () => t('Anchor'),
  key: () => t('Key'),
  ball: () => t('Ball'),
  flame: () => t('Flame'),
  paw: () => t('Paw'),
  crosshair: () => t('Crosshair'),
  tower: () => t('Tower'),
  eye: () => t('Eye'),
  sun: () => t('Sun'),
};

const PATTERN_LABEL: Record<FlagPattern, () => string> = {
  solid: () => t('Plain'),
  h2: () => t('Two stripes'),
  h3: () => t('Three stripes'),
  v2: () => t('Two columns'),
  v3: () => t('Three columns'),
  diag: () => t('Diagonal'),
  band: () => t('Band'),
  frame: () => t('Frame'),
  corner: () => t('Corner'),
  wedge: () => t('Wedge'),
};

export function renderClubEditor(o: { api: ClubsApi; club?: ClubDetails; onDone: (c: ClubDetails) => void }): HTMLElement {
  const editing = !!o.club;
  const flag: ClubFlag = o.club ? { pattern: o.club.flag.pattern, colors: [...o.club.flag.colors] as ClubFlag['colors'] } : { pattern: 'h2', colors: [0, 2, 9] };
  const emblem: ClubEmblem = o.club ? { ...o.club.emblem } : { icon: 'star', color: 9 };
  let slot: 0 | 1 | 2 | 3 = 0; // which colour the palette paints: 0–2 the field, 3 the emblem
  let busy = false;
  const name = h('input', { class: 'input', maxlength: CLUB_RULES.nameMax, placeholder: t('Gang name'), 'aria-label': t('Gang name'), 'data-testid': 'club-name', value: o.club?.name ?? '', disabled: editing });
  const tag = h('input', { class: 'input clubtaginput', maxlength: CLUB_RULES.tagMax, placeholder: t('TAG'), 'aria-label': t('Tag (2–4 letters)'), 'data-testid': 'club-tag', value: o.club?.tag ?? '', disabled: editing });
  const motto = h('input', { class: 'input', maxlength: CLUB_RULES.mottoMax, placeholder: t('Motto (optional)'), 'aria-label': t('Motto'), 'data-testid': 'club-motto', value: o.club?.motto ?? '' });
  const preview = h('div', { class: 'clubeditor__preview' });
  const patterns = h('div', { class: 'clubpicks clubpicks--patterns' });
  const slots = h('div', { class: 'clubslots' });
  const palette = h('div', { class: 'clubpalette' });
  const icons = h('div', { class: 'clubpicks clubpicks--icons' });
  const err = h('div', { class: 'muted clubeditor__err', role: 'alert' });
  // v0.3: clubs are written in Latin letters — the tag converts as it is typed («кк» → «KK»), the name
  // and the motto offer their Latin version
  tag.addEventListener('input', () => (tag.value = transliterate(tag.value).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CLUB_RULES.tagMax)));
  const latinFix = h('div', { class: 'namehint', 'data-testid': 'club-latin' });
  const offerLatin = () => {
    const parts: Array<[HTMLInputElement, string]> = [];
    if (/[^\x20-\x7E’]/.test(name.value) && !editing) parts.push([name, toLatin(name.value)]);
    if (/[^\x20-\x7E’‘“”«»—–…]/.test(motto.value)) parts.push([motto, transliterate(motto.value).replace(/[^\x20-\x7E’‘“”«»—–…]/g, '').slice(0, CLUB_RULES.mottoMax)]);
    fill(
      latinFix,
      parts.length ? h('span', { class: 'namehint__bad' }, t('Latin letters only.')) : null,
      ...parts.map(([input, fixed]) =>
        fixed
          ? h(
              'button',
              {
                class: 'chip',
                onclick: () => {
                  input.value = fixed;
                  offerLatin();
                },
              },
              fixed,
            )
          : null,
      ),
    );
  };
  name.addEventListener('input', offerLatin);
  motto.addEventListener('input', offerLatin);
  const draw = () => {
    preview.replaceChildren(clubFlag(flag, emblem, { size: 180, label: t('Flag preview') }));
    patterns.replaceChildren(
      ...FLAG_PATTERNS.map((p) =>
        h('button', { class: 'clubpick', 'aria-pressed': String(flag.pattern === p), title: PATTERN_LABEL[p](), 'aria-label': PATTERN_LABEL[p](), 'data-pattern': p, onclick: () => ((flag.pattern = p), draw()) }, clubFlag({ pattern: p, colors: flag.colors }, { icon: 'none', color: 0 }, { size: 42 })),
      ),
    );
    const slotLabel = [t('Colour 1'), t('Colour 2'), t('Colour 3'), t('Emblem')];
    slots.replaceChildren(
      ...([0, 1, 2, 3] as const).map((s) =>
        h(
          'button',
          { class: 'clubslot', 'aria-pressed': String(slot === s), 'data-slot': s, onclick: () => ((slot = s), draw()) },
          h('i', { style: `background:${CLUB_PALETTE[s === 3 ? emblem.color : flag.colors[s]]}` }),
          slotLabel[s],
        ),
      ),
    );
    const current = slot === 3 ? emblem.color : flag.colors[slot];
    palette.replaceChildren(
      ...CLUB_PALETTE.map((hex, i) =>
        h('button', {
          class: 'clubswatch',
          style: `background:${hex}`,
          'aria-pressed': String(current === i),
          'aria-label': t('Colour {n}', { n: i + 1 }),
          'data-color': i,
          onclick: () => {
            if (slot === 3) emblem.color = i;
            else flag.colors[slot] = i;
            draw();
          },
        }),
      ),
    );
    icons.replaceChildren(
      ...EMBLEM_ICONS.map((ic: EmblemIcon) =>
        h(
          'button',
          { class: 'clubpick clubpick--icon', 'aria-pressed': String(emblem.icon === ic), 'aria-label': ICON_LABEL[ic](), title: ICON_LABEL[ic](), 'data-icon': ic, onclick: () => ((emblem.icon = ic), draw()) },
          ic === 'none' ? h('span', { class: 'clubpick__none' }, '∅') : clubFlag({ pattern: 'solid', colors: [2, 2, 2] }, { icon: ic, color: 3 }, { size: 36 }),
        ),
      ),
    );
  };
  const submit = async () => {
    if (busy) return;
    err.textContent = '';
    // Cyrillic typed and the Latin offer not taken: saving takes it (a gang is written in Latin letters)
    if (!editing && /[^\x20-\x7E’]/.test(name.value)) name.value = toLatin(name.value);
    if (/[^\x20-\x7E’‘“”«»—–…]/.test(motto.value)) motto.value = transliterate(motto.value).replace(/[^\x20-\x7E’‘“”«»—–…]/g, '').slice(0, CLUB_RULES.mottoMax);
    offerLatin();
    let body: CreateClubBody | UpdateClubBody;
    if (!clubMottoSchema.safeParse(motto.value).success) return void (err.textContent = t('A motto is written in Latin letters.'));
    if (!editing) {
      const n = clubNameSchema.safeParse(name.value);
      if (!n.success) return void (err.textContent = t('A gang name is 3–24 Latin letters, digits or spaces.'));
      const tg = clubTagSchema.safeParse(tag.value);
      if (!tg.success) return void (err.textContent = t('A tag is 2–4 Latin letters or digits.'));
      body = { name: n.data, tag: tg.data, motto: motto.value, flag, emblem };
    } else body = { motto: motto.value, flag, emblem };
    busy = true;
    try {
      const done = editing ? await o.api.updateClub(o.club!.id, body) : await o.api.createClub(body as CreateClubBody);
      toast(editing ? t('Saved') : t('«{name}» is founded', { name: done.name }));
      o.onDone(done);
    } catch (e) {
      err.textContent = apiErrorText(e);
    } finally {
      busy = false;
    }
  };
  draw();
  return h(
    'div',
    { class: 'col clubeditor', 'data-testid': 'club-editor' },
    h('div', { class: 'panel clubeditor__top' }, preview, h('div', { class: 'col', style: 'gap:8px;min-width:0;flex:1' }, h('div', { class: 'row clubeditor__names' }, name, tag), motto, latinFix)),
    h('div', { class: 'panel col' }, h('span', { class: 'tag' }, t('Pattern')), patterns),
    h('div', { class: 'panel col' }, h('span', { class: 'tag' }, t('Colours')), slots, palette),
    h('div', { class: 'panel col' }, h('span', { class: 'tag' }, t('Emblem')), icons),
    err,
    h(
      'button',
      { class: 'btn btn--red', 'data-testid': 'club-save', onclick: () => void submit() },
      editing ? t('Save') : t('Start the gang'),
      editing ? null : h('span', { class: 'sub' }, CLUB_RULES.createTokens > 0 ? count(CLUB_RULES.createTokens, 'talon') : t('free')),
    ),
  );
}
