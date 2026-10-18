/**
 * App shell: screen navigation (HTML/CSS over the canvas), offline practice flow, online flow
 * (auth → lobby → match → results), pause menu and Telegram back-button integration.
 */
import { CHARACTERS, CHARACTER_IDS, FREE_CHARACTERS, GADGETS, MAP_ORDER, MODS, WEAPONS, DEFAULT_LOADOUT, getMap, isCharacterId, isMapId, levelForXp } from '@blatkom/shared';
import type { CharacterId, MapId, BotDifficulty, Standing, PersonalResult, Loadout } from '@blatkom/shared';
import type { GameHost } from '../game/GameHost.js';
import { OfflineSession } from '../game/session/OfflineSession.js';
import type { GameSession, ResultsData } from '../game/session/types.js';
import { hudBus } from '../game/scenes/hudBus.js';
import { h, toast, portrait, asset, fmtDuration } from '../ui/dom.js';
import { getSettings, updateSettings, storageGet, storageSet } from './settings.js';
import { ONLINE_AVAILABLE, VERSION } from './config.js';
import { setBackButton, enterGameMode, leaveGameMode, telegramStartParam, inTelegram, haptic } from '../telegram/tg.js';
import { OnlineClient } from '../net/OnlineClient.js';
import type { LobbyState } from '../net/OnlineClient.js';
import { analytics } from '../analytics/client.js';
import { renderSettings } from '../ui/screens/settings.js';
import { loadOnlineProfile, renderProfileView } from '../ui/screens/profile.js';
import type { ProfileData } from '../ui/screens/profile.js';
import { createLocalProfile, localProfileView, recordLocalMatch, renameLocalProfile } from '../profile/localProfile.js';
import type { LocalProfile } from '../profile/localProfile.js';
import { clearLocalProfile, loadLocalProfile, saveLocalProfile } from '../profile/localStore.js';
import { openNicknameDialog, randomNickname } from '../profile/nickname.js';
import { renderResults } from '../ui/screens/results.js';
import { renderLobby } from '../ui/screens/lobby.js';
import { renderArsenal, characterPriceNote, amount } from '../ui/screens/shop.js';
import type { ArsenalTab, TryOn } from '../ui/screens/shop.js';
import { renderAccountPanel, openEmailLogin, openPasswordReset } from '../ui/screens/account.js';
import { sfx } from '../game/audio/Sfx.js';

type Screen = 'menu' | 'characters' | 'practice' | 'friends' | 'lobby' | 'join' | 'game' | 'results' | 'profile' | 'settings' | 'arsenal' | 'error' | 'loading';

/** Profile id whose nickname has been confirmed in the first-launch dialog (online build). */
const NICK_CONFIRMED_KEY = 'blatkom89.nick-confirmed.v1';

const MAP_BLURB: Partial<Record<MapId, string>> = {
  factory: 'The checkpoint, Workshop No. 3, the warehouse. Corridors, cover, key points.',
  garages: 'Rows of garages, narrow lanes, ambushes at close range.',
  yard: 'Panel blocks, archways and a playground. Flanks and mid-range fights.',
  stroyka: 'A half-built block under the crane: sections, the pit, stacks of bricks.',
  dk: 'The auditorium, the stage, dressing rooms, the billiard room and the foyer.',
  gastronom: 'Aisles of shelves, counters, the warehouse and the loading dock.',
  hospital: 'Wards, the operating theatre, X-ray and one long corridor.',
};

export class App {
  private host!: GameHost;
  private readonly root = document.getElementById('ui')!;
  private screen: Screen = 'loading';
  private history: Screen[] = [];
  private character: CharacterId;
  private session: GameSession | null = null;
  private online: OnlineClient | null = null;
  private pauseEl: HTMLElement | null = null;
  private lastPractice: { mapId: MapId; bots: number; difficulty: BotDifficulty } = { mapId: 'factory', bots: 3, difficulty: 'normal' };
  private resultsShown = false;
  /** Demo build only: the browser-only profile (nickname, XP, stats). Online, the server owns it. */
  private localProfile: LocalProfile | null = null;
  private lastLocalResult: { matchId: string; personal: PersonalResult } | null = null;
  private nickClose: (() => void) | null = null;
  private stripEl: HTMLElement | null = null;

  constructor() {
    const saved = storageGet('blatkom89.character');
    this.character = saved && isCharacterId(saved) ? saved : 'petya';
    if (!ONLINE_AVAILABLE) this.localProfile = loadLocalProfile();
    hudBus.on('pause', () => this.togglePause());
    hudBus.on('match-end', () => setTimeout(() => this.onMatchFinished(), 2200));
  }

  async start(host: GameHost): Promise<void> {
    this.host = host;
    analytics.init();
    if (ONLINE_AVAILABLE) {
      this.online = new OnlineClient({
        onLobby: (s) => this.onLobby(s),
        onMatchStart: (session) => this.beginSession(session),
        onResults: (r) => this.showResults(r),
        onProgress: () => {
          if (this.screen === 'results' && this.online?.lastResults) this.showResults(this.online.lastResults);
        },
        onError: (msg, fatal) => (fatal ? this.showError(msg) : toast(msg)),
        onLeft: () => this.goMenu(),
      });
      this.online.onEmailSessionExpired = (email) =>
        openEmailLogin(this.root, this.online!, { email, note: 'This account’s session has expired — please sign in again.', onDone: () => this.afterAccountSwitch() });
      this.online.pingVisit();
      void this.online
        .ensureAuth()
        .then(() => {
          this.refreshStrip();
          this.maybeAskNickname();
          void this.online!.loadInventory().then(() => this.refreshStrip()).catch(() => {});
        })
        .catch(() => {});
    }
    const params = new URLSearchParams(location.search);
    this.handleReturnParams(params);
    // deep links: invite (Telegram start_param or ?invite=), direct room, quick test hook
    const invite = telegramStartParam() ?? params.get('invite');
    const play = params.get('play');
    host.showPreview();
    if (play === 'offline') {
      const mapId = params.get('map');
      const c = params.get('char');
      if (c && isCharacterId(c)) this.character = c;
      this.startPractice({ mapId: mapId && isMapId(mapId) ? mapId : 'factory', bots: Number(params.get('bots') ?? 3), difficulty: (params.get('diff') as BotDifficulty) ?? 'normal' });
      return;
    }
    if (invite && this.online) {
      this.joinInvite(invite);
      return;
    }
    const room = params.get('room');
    if (room && this.online && /^[A-Za-z0-9_-]{4,32}$/.test(room)) {
      this.go('loading');
      this.render(this.loading('Connecting to the room…'));
      void this.online.joinRoom(room, this.onlineCharacter()).catch((e: Error) => this.showError(e.message));
      return;
    }
    this.goMenu();
  }

  /** Back from a payment page (?pay=success&pid=…) or from a password-reset email (?reset=…). */
  private handleReturnParams(params: URLSearchParams) {
    const online = this.online;
    if (!online) return;
    const reset = params.get('reset');
    const pay = params.get('pay');
    const pid = params.get('pid');
    if (reset || pay) history.replaceState(null, '', location.pathname);
    if (reset && /^[A-Za-z0-9_-]{20,64}$/.test(reset)) {
      setTimeout(() => openPasswordReset(this.root, online, reset, () => openEmailLogin(this.root, online, { onDone: () => this.afterAccountSwitch() })), 300);
    }
    if (pay === 'cancel') setTimeout(() => toast('Payment cancelled'), 600);
    if (pay === 'success' && pid && /^[0-9a-f-]{36}$/i.test(pid)) {
      // the provider confirms the payment to the server separately: wait for it (up to ~2 minutes)
      let tries = 0;
      const poll = async () => {
        tries++;
        try {
          await online.ensureAuth();
          const st = await online.api.paymentStatus(pid);
          if (st.status === 'paid') {
            await online.loadInventory().catch(() => {});
            this.refreshStrip();
            sfx.play('buy');
            toast(`${st.diamonds} diamonds credited`);
            return;
          }
          if (st.status === 'failed' || st.status === 'expired') return toast('The payment did not go through');
        } catch {
          /* keep polling */
        }
        if (tries < 40) setTimeout(() => void poll(), 3000);
        else toast('The payment is still being processed — the diamonds will arrive automatically');
      };
      setTimeout(() => {
        toast('Checking the payment…');
        void poll();
      }, 800);
    }
  }

  /** Signed in to another account (email): reload everything that depends on the player. */
  private afterAccountSwitch() {
    void this.online
      ?.loadInventory()
      .catch(() => {})
      .finally(() => {
        if (this.online?.profile?.preferredCharacter) this.character = this.online.profile.preferredCharacter;
        this.goMenu();
      });
  }

  /** Characters this player may use online (all of them in the demo build and in practice). */
  private ownsCharacter(c: CharacterId): boolean {
    if (!this.online) return true;
    const inv = this.online.inventory;
    return inv ? inv.characters.includes(c) : FREE_CHARACTERS.includes(c);
  }

  /** The character to bring into an online room (a locked one falls back to the free default). */
  private onlineCharacter(): CharacterId {
    return this.ownsCharacter(this.character) ? this.character : 'petya';
  }

  // ── navigation ──────────────────────────────────────────────────────────
  private go(s: Screen, push = true) {
    if (push && this.screen !== s && !['loading', 'error', 'game'].includes(this.screen)) this.history.push(this.screen);
    this.screen = s;
    setBackButton(s !== 'menu' && s !== 'game' && s !== 'loading');
    this.host.previewScene()?.setFocus(s === 'characters' ? this.character : null);
  }

  back(): void {
    if (this.pauseEl) return this.togglePause();
    if (this.screen === 'lobby') return void this.online?.leave();
    if (this.screen === 'game') return this.togglePause();
    const prev = this.history.pop();
    if (!prev || prev === 'game' || prev === 'lobby') return this.goMenu();
    this.open(prev, false);
  }

  private open(s: Screen, push = true) {
    switch (s) {
      case 'menu':
        return this.goMenu();
      case 'characters':
        return this.showCharacters(push);
      case 'practice':
        return this.showPractice(push);
      case 'friends':
        return this.showFriends(push);
      case 'profile':
        return this.showProfile(push);
      case 'settings':
        return this.showSettings(push);
      case 'arsenal':
        return this.showArsenal(push);
      default:
        return this.goMenu();
    }
  }

  private render(el: HTMLElement) {
    this.root.replaceChildren(el);
  }

  private topbar(title: string): HTMLElement {
    return h('div', { class: 'topbar' }, h('button', { class: 'back', onclick: () => this.back(), 'aria-label': 'Back' }, '← Back'), h('h1', { class: 'h1' }, title));
  }

  private loading(text: string): HTMLElement {
    return h('div', { class: 'screen screen--dim center' }, h('div', { class: 'col center' }, h('div', { class: 'spinner' }), h('div', { class: 'hand' }, text)));
  }

  // ── menu ────────────────────────────────────────────────────────────────
  goMenu(): void {
    this.history = [];
    this.endSession();
    this.host.showPreview();
    this.go('menu', false);
    const c = CHARACTERS[this.character];
    const onlineNote = ONLINE_AVAILABLE ? null : h('div', { class: 'muted', style: 'font-size:14px' }, 'This is the demo without a server: practice against bots is available. Online matches work in the online version.');
    this.stripEl = this.profileStrip();
    const menu = h(
      'div',
      { class: 'screen screen--dim' },
      h(
        'div',
        { class: 'wrap' },
        this.stripEl,
        h('img', { class: 'logo', src: asset('assets/ui/logo.png'), alt: 'BLATKOM ’89 — district business is serious business' }),
        h(
          'div',
          { class: 'menu' },
          h(
            'div',
            { class: 'panel btn-col' },
            h('span', { class: 'tag' }, 'District Business'),
            h('div', { style: 'height:6px' }),
            h('button', { class: 'btn btn--red', onclick: () => this.quickMatch(), disabled: !ONLINE_AVAILABLE }, 'Quick Match', h('span', { class: 'sub' }, 'online, up to 6 comrades')),
            h('button', { class: 'btn', onclick: () => this.showFriends(), disabled: !ONLINE_AVAILABLE }, 'Play with Friends', h('span', { class: 'sub' }, 'a room by invitation')),
            h('button', { class: ONLINE_AVAILABLE ? 'btn' : 'btn btn--red', onclick: () => this.showPractice() }, 'Practice', h('span', { class: 'sub' }, 'against bots, no internet needed')),
            h('button', { class: 'btn', onclick: () => this.showArsenal() }, 'Arsenal', h('span', { class: 'sub' }, 'weapons, equipment, characters')),
            h('div', { class: 'row' }, h('button', { class: 'btn grow', onclick: () => this.showProfile() }, 'Profile'), h('button', { class: 'btn grow', onclick: () => this.showSettings() }, 'Settings')),
            onlineNote,
          ),
          h(
            'div',
            { class: 'panel col' },
            h('span', { class: 'tag' }, 'Character'),
            h(
              'div',
              { class: 'charcard', role: 'button', tabindex: '0', onclick: () => this.showCharacters(), onkeydown: (e: Event) => (e as KeyboardEvent).key === 'Enter' && this.showCharacters() },
              portrait(this.character),
              h('div', { class: 'col', style: 'gap:2px' }, h('div', { class: 'name' }, c.name), h('div', { class: 'nick' }, `«${c.nickname}»`), h('div', { class: 'hand' }, c.quote)),
            ),
            h('button', { class: 'btn btn--small', onclick: () => this.showCharacters() }, 'Change character'),
          ),
        ),
        h('div', { class: 'grow' }),
        ONLINE_AVAILABLE
          ? h('div', { class: 'footer' }, `BLATKOM ’89 · v${VERSION} · Free to play, purchases optional · `, h('a', { href: asset('privacy.html'), target: '_blank', style: 'color:inherit' }, 'Privacy'))
          : h('div', { class: 'footer' }, `BLATKOM ’89 · v${VERSION} · Demo: the game runs right in your browser; no data is collected or sent anywhere.`),
      ),
    );
    this.render(menu);
    this.maybeAskNickname();
  }

  // ── profile, nickname, level ────────────────────────────────────────────
  private playerName(): string | null {
    return this.online ? (this.online.profile?.displayName ?? null) : (this.localProfile?.displayName ?? null);
  }

  private playerLevel(): number | null {
    if (this.online) return this.online.profile?.level ?? null;
    return this.localProfile ? levelForXp(this.localProfile.xp).level : null;
  }

  /** Top-right strip in the menu: level badge, nickname, XP bar, «✎» to rename. Opens the profile. */
  private profileStrip(): HTMLElement {
    const name = this.playerName();
    const strip = h('div', { class: 'pstrip', 'data-testid': 'profile-strip' });
    if (!name) {
      strip.append(h('div', { class: 'lvlbadge' }, h('small', null, 'LVL'), '—'), h('div', { class: 'who' }, h('div', { class: 'nm muted' }, this.online ? 'Signing in…' : 'No alias')));
      if (!this.online) strip.append(h('button', { class: 'edit', 'aria-label': 'Choose an alias', onclick: () => this.editNickname() }, '✎'));
      return strip;
    }
    const xp = this.online ? (this.online.profile?.xp ?? 0) : (this.localProfile?.xp ?? 0);
    const lvl = levelForXp(xp);
    const pct = lvl.nextLevelCost > 0 ? Math.round((lvl.intoLevel / lvl.nextLevelCost) * 100) : 100;
    strip.append(
      h(
        'button',
        { class: 'pstrip__main', onclick: () => this.showProfile(), 'aria-label': `Profile: ${name}, level ${lvl.level}` },
        h('div', { class: 'lvlbadge' }, h('small', null, 'LVL'), String(this.playerLevel() ?? lvl.level)),
        h(
          'div',
          { class: 'who' },
          h('div', { class: 'nm', 'data-testid': 'menu-nick' }, name),
          h('div', { class: 'xpbar' }, h('i', { style: `width:${pct}%` })),
          h('div', { class: 'xp' }, lvl.nextLevelCost > 0 ? `${lvl.intoLevel} / ${lvl.nextLevelCost} XP` : 'max level'),
        ),
      ),
      h('button', { class: 'edit', 'aria-label': 'Change alias', title: 'Change alias', onclick: () => this.editNickname() }, '✎'),
    );
    const inv = this.online?.inventory;
    if (inv) strip.append(h('button', { class: 'pstrip__wallet', onclick: () => this.showArsenal(), 'aria-label': `Talons ${inv.tokens}, diamonds ${inv.diamonds}` }, amount(inv.tokens, 'tokens'), amount(inv.diamonds, 'diamonds')));
    return strip;
  }

  private refreshStrip() {
    if (!this.stripEl?.isConnected) return;
    const next = this.profileStrip();
    this.stripEl.replaceWith(next);
    this.stripEl = next;
  }

  /** First launch: ask for a nickname (demo: before the first profile exists; online: new players). */
  private maybeAskNickname() {
    if (this.screen !== 'menu' || this.nickClose) return;
    if (!this.online) {
      if (this.localProfile) return;
      this.nickClose = openNicknameDialog(this.root, {
        initial: randomNickname(),
        note: 'Your opponents see your alias — above your character, on the scoreboard and in the match report. XP and levels are kept in this browser; you can change the alias in your profile.',
        onSave: (name) => this.saveNickname(name),
        onClose: () => (this.nickClose = null),
      });
      return;
    }
    const p = this.online.profile;
    if (!p || p.matchesPlayed > 0 || storageGet(NICK_CONFIRMED_KEY) === p.id) return;
    this.nickClose = openNicknameDialog(this.root, {
      initial: /^(Гость|Guest|Comrade)_/.test(p.displayName) ? randomNickname() : p.displayName,
      onSave: (name) => this.saveNickname(name),
      onCancel: () => storageSet(NICK_CONFIRMED_KEY, p.id),
      cancelLabel: 'Keep it as is',
      onClose: () => (this.nickClose = null),
    });
  }

  /** A new player who opens an invite link picks a nickname before entering the room. */
  private async ensureNicknameBeforeJoin(): Promise<void> {
    if (!this.online || this.nickClose) return;
    const p = await this.online.ensureAuth();
    if (p.matchesPlayed > 0 || storageGet(NICK_CONFIRMED_KEY) === p.id) return;
    await new Promise<void>((resolve) => {
      this.nickClose = openNicknameDialog(this.root, {
        initial: /^(Гость|Guest|Comrade)_/.test(p.displayName) ? randomNickname() : p.displayName,
        note: 'You’ve been invited to a room. The other players will see your alias — above your character, on the scoreboard and in the match report.',
        onSave: (name) => this.saveNickname(name),
        onCancel: () => storageSet(NICK_CONFIRMED_KEY, p.id),
        cancelLabel: 'Keep it as is',
        onClose: () => {
          this.nickClose = null;
          resolve();
        },
      });
    });
  }

  private editNickname(after?: () => void) {
    if (this.nickClose) return;
    this.nickClose = openNicknameDialog(this.root, {
      initial: this.playerName() ?? randomNickname(),
      title: this.playerName() ? 'Change alias' : 'What do they call you round here?',
      onSave: async (name) => {
        await this.saveNickname(name);
        after?.();
      },
      onCancel: () => {},
      onClose: () => (this.nickClose = null),
    });
  }

  private async saveNickname(name: string): Promise<void> {
    if (this.online) {
      if (name !== this.online.profile?.displayName) await this.online.rename(name);
      const id = this.online.profile?.id;
      if (id) storageSet(NICK_CONFIRMED_KEY, id);
    } else {
      this.localProfile = this.localProfile ? renameLocalProfile(this.localProfile, name) : createLocalProfile(name);
      saveLocalProfile(this.localProfile);
    }
    this.refreshStrip();
    toast(`Nickname: ${name}`);
  }

  // ── characters ──────────────────────────────────────────────────────────
  private showCharacters(push = true, initial?: CharacterId) {
    this.go('characters', push);
    let selected = initial ?? this.character;
    this.host.previewScene()?.setFocus(selected);
    const grid = h('div', { class: 'chars', role: 'radiogroup', 'aria-label': 'Characters' });
    const dossier = h('div', { class: 'panel dossier' });
    const actions = h('div', { class: 'row' });
    const draw = () => {
      grid.replaceChildren(
        ...CHARACTER_IDS.map((id) =>
          h(
            'button',
            {
              'aria-pressed': String(id === selected),
              role: 'radio',
              class: this.ownsCharacter(id) ? '' : 'locked',
              onclick: () => {
                selected = id;
                this.host.previewScene()?.setFocus(id);
                sfx.play('click');
                haptic('select');
                draw();
              },
            },
            portrait(id),
            h('span', null, CHARACTERS[id].name),
          ),
        ),
      );
      const c = CHARACTERS[selected];
      const locked = !this.ownsCharacter(selected);
      const price = locked ? characterPriceNote(selected, this.online?.inventory ?? null) : null;
      dossier.replaceChildren(
        h('span', { class: 'tag' }, 'Personal File'),
        h(
          'div',
          { class: 'col' },
          h('div', { class: 'h1' }, c.name, ' ', h('span', { style: 'color:var(--red)' }, `«${c.nickname}»`)),
          h('div', null, h('b', { style: 'font-family:Oswald;color:var(--muted)' }, 'Role: '), c.role),
          h('div', null, h('b', { style: 'font-family:Oswald;color:var(--muted)' }, 'Temper: '), c.personality),
          h('div', { class: 'quote' }, `«${c.quote}»`),
          h('div', { class: 'lore' }, c.lore),
          price ? h('div', { class: 'badge badge--host', style: 'align-self:flex-start' }, price) : null,
        ),
        h(
          'div',
          { class: 'col', style: 'gap:0' },
          ...(
            [
              ['Name', c.name],
              ['Alias', c.nickname],
              ['Species', c.species],
              ['District', c.district],
              ['Business', c.business],
              ['Weapons', c.weaponsNote],
            ] as const
          ).map(([k, v]) => h('div', { class: 'field' }, h('b', null, k), h('span', null, v))),
          h('div', { class: 'muted', style: 'font-size:13px;margin-top:8px' }, 'All characters have the same stats — only their looks and temper differ.'),
        ),
      );
      actions.replaceChildren(
        locked
          ? h('button', { class: 'btn btn--red grow', onclick: () => this.showArsenal(true, 'characters') }, 'Unlock in the Arsenal')
          : h('button', { class: 'btn btn--red grow', onclick: confirm }, 'Choose'),
      );
      if (locked) actions.append(h('button', { class: 'btn grow', onclick: () => this.startPractice({ ...this.lastPractice, character: selected }) }, 'Try in practice'));
    };
    const confirm = () => {
      if (!this.ownsCharacter(selected)) return;
      this.character = selected;
      storageSet('blatkom89.character', selected);
      analytics.track('character_selected', { character: selected });
      void this.online?.setPreferredCharacter(selected);
      this.back();
    };
    draw();
    if (this.online) void this.online.loadInventory().then(() => this.screen === 'characters' && draw()).catch(() => {});
    this.render(h('div', { class: 'screen screen--dim' }, h('div', { class: 'wrap' }, this.topbar('Choose a Character'), grid, dossier, actions)));
  }

  // ── arsenal (loadout, shop, case, diamonds) ─────────────────────────────
  private showArsenal(push = true, tab?: ArsenalTab) {
    this.go('arsenal', push);
    const el = renderArsenal({
      online: this.online,
      inTelegram: inTelegram(),
      ...(tab ? { tab } : {}),
      onTry: (t) => this.startPractice({ ...this.lastPractice, tryOn: t }),
      onWallet: () => this.refreshStrip(),
      onCharacter: (c) => this.showCharacters(true, c),
    });
    this.render(h('div', { class: 'screen screen--dim' }, h('div', { class: 'wrap' }, this.topbar('Arsenal'), el)));
  }

  // ── practice ────────────────────────────────────────────────────────────
  private showPractice(push = true) {
    this.go('practice', push);
    const s = getSettings();
    let mapId: MapId = this.lastPractice.mapId;
    let bots = s.bots;
    let diff: BotDifficulty = s.botDifficulty;
    const maps = h('div', { class: 'col' });
    const drawMaps = () =>
      maps.replaceChildren(
        ...MAP_ORDER.map((id) =>
          h(
            'button',
            { class: `btn ${id === mapId ? 'btn--red' : ''}`, style: 'justify-content:space-between', onclick: () => ((mapId = id), drawMaps()) },
            getMap(id).name,
            h('span', { class: 'sub' }, MAP_BLURB[id]),
          ),
        ),
      );
    drawMaps();
    const seg = <T extends string | number>(values: T[], cur: () => T, set: (v: T) => void, label: (v: T) => string) => {
      const el = h('div', { class: 'seg' });
      const draw = () => el.replaceChildren(...values.map((v) => h('button', { 'aria-pressed': String(v === cur()), onclick: () => (set(v), draw()) }, label(v))));
      draw();
      return el;
    };
    const content = h(
      'div',
      { class: 'wrap' },
      this.topbar('Practice'),
      h('div', { class: 'panel col' }, h('span', { class: 'tag' }, 'Map'), maps),
      h(
        'div',
        { class: 'panel col' },
        h('span', { class: 'tag' }, 'Opponents'),
        h('div', { class: 'muted' }, 'Number of bots'),
        seg([1, 2, 3, 4, 5], () => bots, (v) => (bots = v), String),
        h('div', { class: 'muted' }, 'Difficulty'),
        seg<BotDifficulty>(['easy', 'normal', 'hard'], () => diff, (v) => (diff = v), (v) => ({ easy: 'Easy', normal: 'Normal', hard: 'Vicious' })[v]),
      ),
      h(
        'button',
        {
          class: 'btn btn--red',
          onclick: () => {
            updateSettings({ bots, botDifficulty: diff });
            this.startPractice({ mapId, bots, difficulty: diff });
          },
        },
        'Start',
      ),
    );
    this.render(h('div', { class: 'screen screen--dim' }, content));
  }

  /** Practice loadout: the player's own (online), the free default (demo), or a weapon to try on. */
  private practiceLoadout(t?: TryOn): Loadout {
    const base: Loadout = this.online?.inventory?.loadout ?? { ...DEFAULT_LOADOUT, mods: {} };
    if (!t) return base;
    let l: Loadout = { ...base, mods: { ...base.mods } };
    if (t.weapon) {
      const slot = WEAPONS[t.weapon].slot;
      l = { ...l, ...(slot === 1 ? { sidearm: t.weapon } : slot === 2 ? { melee: t.weapon } : { primary: t.weapon }) };
      if (t.mods) l.mods[t.weapon] = [...t.mods];
    }
    if (t.gadget) l.gadget = t.gadget;
    return l;
  }

  private static tryOnLabel(t: TryOn): string {
    const parts: string[] = [];
    if (t.weapon) parts.push(WEAPONS[t.weapon].name + (t.mods?.length ? ` + ${t.mods.map((m) => MODS[m].name.toLowerCase()).join(', ')}` : ''));
    if (t.gadget) parts.push(GADGETS[t.gadget].name);
    return parts.join(' and ');
  }

  private startPractice(opts: { mapId: MapId; bots: number; difficulty: BotDifficulty; tryOn?: TryOn; character?: CharacterId }) {
    this.lastPractice = { mapId: opts.mapId, difficulty: opts.difficulty, bots: Math.max(1, Math.min(5, opts.bots || 3)) };
    const name = this.playerName() ?? CHARACTERS[this.character].name;
    const session = new OfflineSession({
      mapId: opts.mapId,
      character: opts.character ?? this.character,
      name,
      level: this.playerLevel(),
      bots: this.lastPractice.bots,
      difficulty: opts.difficulty,
      loadout: this.practiceLoadout(opts.tryOn),
    });
    if (opts.tryOn) {
      const label = App.tryOnLabel(opts.tryOn);
      setTimeout(() => toast(`Trying on: ${label}${opts.tryOn!.gadget ? ' — G key' : ''}`), 1200);
    }
    this.beginSession(session);
  }

  private beginSession(session: GameSession) {
    this.endSession(false);
    this.session = session;
    this.resultsShown = false;
    this.go('game');
    this.root.replaceChildren(h('div', { class: 'rotate-hint panel', style: 'position:absolute;left:50%;top:40%;transform:translate(-50%,-50%);pointer-events:none;opacity:.85' }, 'Turn your phone sideways'));
    setTimeout(() => this.root.querySelector('.rotate-hint')?.remove(), 4000);
    enterGameMode();
    this.host.startGame(session);
  }

  private endSession(showPreview = true) {
    if (this.pauseEl) this.togglePause();
    if (this.session) {
      this.host.stopGame();
      this.session.destroy();
      this.session = null;
      leaveGameMode();
    }
    if (showPreview) this.host.showPreview();
  }

  private togglePause() {
    if (this.screen !== 'game') return;
    if (this.pauseEl) {
      this.pauseEl.remove();
      this.pauseEl = null;
      hudBus.emit('pause-state', false);
      return;
    }
    const offline = this.session?.mode === 'offline';
    hudBus.emit('pause-state', true);
    this.pauseEl = h(
      'div',
      { class: 'overlay' },
      h(
        'div',
        { class: 'panel modal col' },
        h('span', { class: 'tag' }, offline ? 'Pause' : 'Menu'),
        h('div', { class: 'muted', style: 'margin-top:6px' }, offline ? 'Practice is paused.' : 'The match goes on — you take control again when you come back.'),
        h('button', { class: 'btn btn--red', onclick: () => this.togglePause() }, 'Resume'),
        h('button', { class: 'btn', onclick: () => (this.togglePause(), this.showSettingsOverlay()) }, 'Settings'),
        h('button', { class: 'btn', onclick: () => this.leaveMatch() }, offline ? 'Back to menu' : 'Leave the match'),
      ),
    );
    this.root.append(this.pauseEl);
  }

  private showSettingsOverlay() {
    const wrapEl = h('div', { class: 'overlay' });
    const close = () => wrapEl.remove();
    wrapEl.append(h('div', { class: 'panel modal col', style: 'max-height:90vh;overflow:auto' }, renderSettings({ inGame: true, online: this.online }), h('button', { class: 'btn btn--red', onclick: close }, 'Done')));
    this.root.append(wrapEl);
  }

  private leaveMatch() {
    if (this.session?.mode === 'online') void this.online?.leave();
    this.goMenu();
  }

  // ── results ─────────────────────────────────────────────────────────────
  private onMatchFinished() {
    if (!this.session || this.resultsShown) return;
    const r = this.session.results();
    if (r) this.showResults(r);
  }

  private showResults(r: ResultsData) {
    this.resultsShown = true;
    if (this.screen !== 'results') this.go('results', false);
    const offline = this.session?.mode !== 'online';
    const myId = offline ? 'local' : (this.online?.profile?.id ?? '');
    // demo build: a finished practice match counts towards the browser-only profile (once per match)
    const local = offline && !this.online && this.session instanceof OfflineSession;
    if (local && this.localProfile) {
      const rec = recordLocalMatch(this.localProfile, { matchId: r.matchId, reason: r.reason, durationMs: r.durationMs, mapId: r.mapId, standings: r.standings, localId: 'local' });
      if (rec) {
        this.localProfile = rec.profile;
        saveLocalProfile(rec.profile);
        this.lastLocalResult = { matchId: r.matchId, personal: rec.personal };
        if (rec.personal.leveledUp) sfx.play('kill', { volume: 0.7 });
      }
      if (this.lastLocalResult?.matchId === r.matchId) r = { ...r, personal: this.lastLocalResult.personal };
    }
    const el = renderResults({
      results: r,
      myId,
      offline,
      localProfile: local && !!this.localProfile,
      ...(local && !this.localProfile ? { offlineNote: 'Pick a nickname in the menu and practice will start earning you XP and levels.' } : {}),
      onRematch: () => {
        if (offline && this.session instanceof OfflineSession) {
          this.resultsShown = false;
          this.session.setLocalIdentity(this.playerName() ?? CHARACTERS[this.character].name, this.playerLevel());
          this.session.restart();
          this.go('game', false);
          this.root.replaceChildren();
        } else {
          this.online?.rematch();
          toast('Rematch vote counted');
        }
      },
      onMenu: () => this.leaveMatch(),
    });
    this.render(el);
  }

  // ── online ──────────────────────────────────────────────────────────────
  private async quickMatch() {
    if (!this.online) return;
    this.go('loading');
    this.render(this.loading('Looking for a match…'));
    try {
      await this.online.quickMatch(this.onlineCharacter());
    } catch (e) {
      this.showError((e as Error).message);
    }
  }

  private showFriends(push = true) {
    if (!this.online) return;
    this.go('friends', push);
    let mapId: MapId = 'factory';
    const maps = h('div', { class: 'seg' });
    const drawMaps = () => maps.replaceChildren(...MAP_ORDER.map((id) => h('button', { 'aria-pressed': String(id === mapId), onclick: () => ((mapId = id), drawMaps()) }, getMap(id).name)));
    drawMaps();
    const code = h('input', { class: 'input', placeholder: 'Invite code', maxlength: '16', autocapitalize: 'off', autocomplete: 'off', inputmode: 'text', 'aria-label': 'Invite code' });
    const content = h(
      'div',
      { class: 'wrap' },
      this.topbar('Play with Friends'),
      h(
        'div',
        { class: 'panel col' },
        h('span', { class: 'tag' }, 'Your Own Room'),
        h('div', { class: 'muted' }, 'Create a room and send your friends the invite link.'),
        maps,
        h(
          'button',
          {
            class: 'btn btn--red',
            onclick: async () => {
              this.go('loading');
              this.render(this.loading('Creating the room…'));
              try {
                await this.online!.createRoom(mapId, this.onlineCharacter());
              } catch (e) {
                this.showError((e as Error).message);
              }
            },
          },
          'Create a room',
        ),
      ),
      h(
        'div',
        { class: 'panel col' },
        h('span', { class: 'tag' }, 'By Code'),
        code,
        h(
          'button',
          {
            class: 'btn',
            onclick: () => {
              const v = code.value.trim();
              if (!/^[A-Za-z0-9]{6,16}$/.test(v)) return toast('Invalid code');
              this.joinInvite(v);
            },
          },
          'Join by code',
        ),
      ),
    );
    this.render(h('div', { class: 'screen screen--dim' }, content));
  }

  private joinInvite(code: string) {
    if (!this.online) return;
    this.go('join');
    this.render(this.loading('Checking the invitation…'));
    void this.online
      .resolveInvite(code)
      .then(async (info) => {
        analytics.track('invite_opened', { code, result: info.status });
        if (info.status === 'joinable' || info.status === 'in_progress') {
          await this.ensureNicknameBeforeJoin();
          this.render(this.loading(`Entering the room${info.hostName ? ` (${info.hostName})` : ''}…`));
          await this.online!.joinRoom(info.roomId!, this.onlineCharacter());
          return;
        }
        const msg: Record<string, string> = {
          full: 'The room is full.',
          finished: 'That match is already over.',
          expired: 'The invitation has expired — the room is closed.',
          not_found: 'Invitation not found.',
        };
        this.showError(msg[info.status] ?? 'Could not join with this invitation.', false);
      })
      .catch((e: Error) => this.showError(e.message));
  }

  private onLobby(s: LobbyState) {
    if (this.screen === 'game' && (s.phase === 'active' || s.phase === 'countdown' || s.phase === 'ready' || s.phase === 'finished')) return;
    if (this.screen === 'results' && s.phase === 'finished') return;
    if (s.phase !== 'waiting') return;
    if (this.screen !== 'lobby') {
      this.endSession();
      this.go('lobby', false);
    }
    this.render(
      renderLobby({
        state: s,
        character: this.onlineCharacter(),
        onReady: (r) => this.online?.setReady(r),
        onStart: () => this.online?.startMatch(),
        onMap: (m) => this.online?.setMap(m),
        onCharacter: () => this.showCharacters(),
        onLeave: () => void this.online?.leave(),
        inTelegram: inTelegram(),
      }),
    );
  }

  private showProfile(push = true) {
    if (!this.online && !this.localProfile) return this.editNickname(() => this.showProfile());
    this.go('profile', push);
    const box = h('div', { class: 'wrap' }, this.topbar('Profile'), this.loading('Loading the profile…'));
    this.render(h('div', { class: 'screen screen--dim' }, box));
    const load: Promise<ProfileData> = this.online ? loadOnlineProfile(this.online) : Promise.resolve(localProfileView(this.localProfile!, this.character));
    void load
      .then((d) => {
        if (this.screen !== 'profile') return;
        box.replaceChildren(this.topbar('Profile'));
        if (this.online) box.append(renderAccountPanel(this.online, { root: this.root, onChanged: () => (this.refreshStrip(), this.screen === 'profile' && this.showProfile(false)) }));
        box.append(renderProfileView(d, { local: !this.online, onRename: () => this.editNickname(() => this.screen === 'profile' && this.showProfile(false)) }));
      })
      .catch((e: Error) => box.replaceChildren(this.topbar('Profile'), h('div', { class: 'panel' }, `Could not load the profile: ${e.message}`)));
  }

  private showSettings(push = true) {
    this.go('settings', push);
    const onResetLocal = !this.online && this.localProfile ? () => this.resetLocalProfile() : undefined;
    this.render(h('div', { class: 'screen screen--dim' }, h('div', { class: 'wrap' }, this.topbar('Settings'), renderSettings({ inGame: false, online: this.online, ...(onResetLocal ? { onResetLocal } : {}) }))));
  }

  /** Demo build: forget the browser-only profile (the nickname dialog opens again in the menu). */
  private resetLocalProfile() {
    clearLocalProfile();
    this.localProfile = null;
    this.lastLocalResult = null;
    toast('Local profile reset');
    this.goMenu();
  }

  showError(message: string, retry = true): void {
    this.endSession();
    this.go('error', false);
    this.render(
      h(
        'div',
        { class: 'screen screen--dim center' },
        h(
          'div',
          { class: 'panel modal col' },
          h('span', { class: 'tag' }, 'Malfunction'),
          h('div', { style: 'font-size:18px;margin-top:8px' }, message),
          retry ? h('button', { class: 'btn', onclick: () => location.reload() }, 'Retry') : null,
          h('button', { class: 'btn btn--red', onclick: () => this.goMenu() }, 'To menu'),
        ),
      ),
    );
  }

  static standingsName(s: Standing): string {
    return s.isBot ? `${s.name} · bot` : s.name;
  }

  static fmt = fmtDuration;
}
