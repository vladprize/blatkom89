/**
 * App shell: screen navigation (HTML/CSS over the canvas), offline practice flow, online flow
 * (auth → lobby → match → results), pause menu and Telegram back-button integration.
 */
import { CHARACTER_IDS, FREE_CHARACTERS, WEAPONS, DEFAULT_LOADOUT, DEFAULT_MATCH_CONFIG, REAL_MONEY, isCharacterId, isGameMode, isKonFormat, isMapId, isTeamMode, levelForXp } from '@blatkom/shared';
import type { AvatarId, CharacterId, GameMode, MapId, BotDifficulty, Standing, PersonalResult, Loadout, FriendEntry, LeaderboardBy, NameCheckResponse, RoomInviteEvent, KonFormat, KonTopResponse } from '@blatkom/shared';
import type { GameHost } from '../game/GameHost.js';
import { OfflineSession, MAX_PRACTICE_BOTS, PRACTICE_TEAM_LIMIT } from '../game/session/OfflineSession.js';
import type { GameSession, ResultsData } from '../game/session/types.js';
import { hudBus } from '../game/scenes/hudBus.js';
import { ChatOverlay, ChatPanel, isMuted } from '../ui/chat.js';
import type { ChatSource } from '../ui/chat.js';
import { h, toast, portrait, asset, fmtDuration } from '../ui/dom.js';
import { openSheet } from '../ui/sheet.js';
import { getSettings, updateSettings, storageGet, storageSet, onSettings } from './settings.js';
import { ONLINE_AVAILABLE, VERSION } from './config.js';
import { setBackButton, enterGameMode, leaveGameMode, telegramStartParam, inTelegram, haptic } from '../telegram/tg.js';
import { OnlineClient } from '../net/OnlineClient.js';
import type { ChatLine, LobbyState } from '../net/OnlineClient.js';
import { analytics } from '../analytics/client.js';
import { renderSettings } from '../ui/screens/settings.js';
import { loadOnlineProfile, renderProfileView } from '../ui/screens/profile.js';
import type { ProfileData } from '../ui/screens/profile.js';
import { createLocalProfile, localProfileView, recordLocalMatch, renameLocalProfile, setLocalAvatar } from '../profile/localProfile.js';
import type { LocalProfile } from '../profile/localProfile.js';
import { clearLocalProfile, loadLocalProfile, saveLocalProfile } from '../profile/localStore.js';
import { openNicknameDialog, randomNickname } from '../profile/nickname.js';
import { renderResults } from '../ui/screens/results.js';
import { renderLobby, modeSwitch } from '../ui/screens/lobby.js';
import { mapField } from '../ui/maps.js';
import { fitAlias, whenSized } from '../ui/fit.js';
import { avatarButton, openAvatarPicker } from '../ui/avatars.js';
import { MODE_ORDER, modeIcon, modeName, modeRules, modeSub } from '../ui/modes.js';
import { renderArsenal, characterPriceNote, amount, heroImg } from '../ui/screens/shop.js';
import type { ArsenalTab, TryOn } from '../ui/screens/shop.js';
import { renderAccountPanel, openEmailLogin, openPasswordReset, telegramLinkText } from '../ui/screens/account.js';
import { renderFriends, renderTop, friendsInvitePanel, showInviteCard, friendsSub } from '../ui/screens/social.js';
import type { SocialSignal } from '../net/SocialClient.js';
import { needsTelegramWelcome, needsWelcome, openTelegramWelcome, openWelcome } from '../ui/screens/welcome.js';
import { sfx } from '../game/audio/Sfx.js';
import { music } from '../game/audio/Music.js';
import { t, count, getLang, setLang, onLangChange, LANGS } from '../i18n/index.js';
import { charText, finishName, gadgetName, modText, weaponName } from '../i18n/content.js';
import { apiErrorText } from '../net/errors.js';
import { watchForUpdates } from './updates.js';
import { renderClubs, renderClub, renderClubEditor, clubLabel } from '../ui/screens/clubs.js';
import { renderBlat, blatCoin, fmtBlat } from '../ui/screens/blat.js';
import { renderBlatDrop } from '../ui/screens/blatDrop.js';
import { renderKon, konLabel } from '../ui/screens/kon.js';
import { PROVIDER_NAME, loginErrorText } from '../ui/screens/signin.js';
import type { LoginProvider } from '../net/oauth.js';
import { clubFlag } from '../ui/clubFlag.js';
import type { ClubDetails } from '@blatkom/shared';
import type { UpdateWatch } from './updates.js';

/** Room capacity shown in the menu. */
const MAX_ROOM_PLAYERS = DEFAULT_MATCH_CONFIG.maxPlayers;

type Screen = 'menu' | 'characters' | 'practice' | 'friends' | 'social' | 'top' | 'clubs' | 'club' | 'clubEdit' | 'blat' | 'kon' | 'lobby' | 'join' | 'game' | 'results' | 'profile' | 'settings' | 'arsenal' | 'error' | 'loading';

/** Profile id whose nickname has been confirmed in the first-launch dialog (online build). */
const NICK_CONFIRMED_KEY = 'blatkom89.nick-confirmed.v1';
/** Last game mode picked for a quick match / a new room. */
const QUICK_MODE_KEY = 'blatkom89.quick-mode';
/** V2.0 part D: the «Блатной кон» format last chosen. */
const KON_FORMAT_KEY = 'blatkom89.kon-format';


/** Speaker with sound waves (music on) or a cross (muted), drawn as inline SVG. */
function speakerIcon(on: boolean): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('aria-hidden', 'true');
  const path = (d: string, stroke: boolean) => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    if (stroke) {
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', 'currentColor');
      p.setAttribute('stroke-width', '2');
      p.setAttribute('stroke-linecap', 'round');
    } else p.setAttribute('fill', 'currentColor');
    svg.append(p);
  };
  path('M3 9h4l5-4v14l-5-4H3z', false);
  if (on) {
    path('M15.5 8.5a5 5 0 0 1 0 7', true);
    path('M18.5 5.5a9.5 9.5 0 0 1 0 13', true);
  } else path('M16 9.5l5 5M21 9.5l-5 5', true);
  return svg;
}

/** A cog (settings), inline SVG: the phone menu keeps Settings in the corner. */
function gearIcon(): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('fill', 'currentColor');
  p.setAttribute('fill-rule', 'evenodd');
  p.setAttribute(
    'd',
    'M10.3 2h3.4l.5 2.6c.6.2 1.2.5 1.7.9l2.5-.9 1.7 2.9-2 1.7c.1.6.1 1.2 0 1.8l2 1.7-1.7 2.9-2.5-.9c-.5.4-1.1.7-1.7.9l-.5 2.6h-3.4l-.5-2.6c-.6-.2-1.2-.5-1.7-.9l-2.5.9-1.7-2.9 2-1.7a6 6 0 0 1 0-1.8l-2-1.7 1.7-2.9 2.5.9c.5-.4 1.1-.7 1.7-.9zM12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z',
  );
  svg.append(p);
  return svg;
}

/** Pictograms of the menu's Friends (two heads) and Top-100 (a podium) buttons, inline SVG. */
function socialIcon(kind: 'friends' | 'top' | 'clubs'): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('width', '30');
  svg.setAttribute('height', '30');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'stile__ico');
  const shape = (tag: string, attrs: Record<string, string>) => {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.append(el);
  };
  if (kind === 'friends') {
    shape('circle', { cx: '11', cy: '10', r: '5', fill: 'currentColor' });
    shape('path', { d: 'M2 27c0-6 4-10 9-10s9 4 9 10z', fill: 'currentColor' });
    shape('circle', { cx: '22', cy: '11', r: '4', fill: 'currentColor', opacity: '.65' });
    shape('path', { d: 'M17 18.5c1.4-.9 3-1.5 5-1.5 4.4 0 8 3.6 8 9h-8c0-3-1.8-5.8-5-7.5z', fill: 'currentColor', opacity: '.65' });
  } else if (kind === 'clubs') {
    // a flag on a pole
    shape('rect', { x: '5', y: '3', width: '2.6', height: '27', fill: 'currentColor' });
    shape('path', { d: 'M8.5 4.5h19l-4.5 6.5 4.5 6.5h-19z', fill: 'currentColor', opacity: '.75' });
    shape('path', { d: 'M16.5 7.4l1 2.1 2.3.3-1.7 1.6.4 2.3-2-1.1-2 1.1.4-2.3-1.7-1.6 2.3-.3z', fill: '#d8a93c' });
  } else {
    shape('rect', { x: '12', y: '9', width: '8', height: '19', fill: 'currentColor' });
    shape('rect', { x: '3', y: '15', width: '8', height: '13', fill: 'currentColor', opacity: '.75' });
    shape('rect', { x: '21', y: '19', width: '8', height: '9', fill: 'currentColor', opacity: '.55' });
    shape('path', { d: 'M16 1.5l1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z', fill: '#d8a93c' });
  }
  return svg;
}

export class App {
  private host!: GameHost;
  private readonly root = document.getElementById('ui')!;
  private screen: Screen = 'loading';
  private history: Screen[] = [];
  private character: CharacterId;
  private session: GameSession | null = null;
  private online: OnlineClient | null = null;
  private pauseEl: HTMLElement | null = null;
  private lastPractice: { mapId: MapId; bots: number; difficulty: BotDifficulty; gameMode: GameMode } = { mapId: 'factory', bots: 3, difficulty: 'normal', gameMode: 'ffa' };
  private resultsShown = false;
  /** Demo build only: the browser-only profile (nickname, XP, stats). Online, the server owns it. */
  private localProfile: LocalProfile | null = null;
  private lastLocalResult: { matchId: string; personal: PersonalResult } | null = null;
  private nickClose: (() => void) | null = null;
  private stripEl: HTMLElement | null = null;
  /** V2.0: «+300 $BLAT …» waiting to be shown on the menu. */
  private blatNote: string | null = null;
  /** V2.0: the $BLAT screen's open tab (the balance or BLAT DROP). */
  private blatTab: 'balance' | 'drop' = 'balance';
  /** V2.0 part D: the Kon table shown (players or gangs). */
  private konTopBy: 'players' | 'gangs' = 'players';
  /** Last lobby state and results (to redraw them after a language switch). */
  private lastLobby: LobbyState | null = null;
  private lastResults: ResultsData | null = null;
  /** The account window (guests in a browser) is open: the alias dialog waits for it. */
  private welcomeClose: (() => void) | null = null;
  /** «Play» with a friend: the room is being created; invite them once we are in its lobby. */
  private pendingInvite: FriendEntry | null = null;
  /** The Top-100 tab last looked at. */
  private topBy: LeaderboardBy = 'rating';
  private socialTiles: HTMLElement | null = null;
  private inviteCards = new Map<string, () => void>();
  /** Room chat: the panel of the lobby/results (one per room) and the overlay over the match. */
  private chatPanel: ChatPanel | null = null;
  private chatPanelRoom: string | null = null;
  private chatOverlay: ChatOverlay | null = null;
  /** A newer release on the server: reload in the main menu (app/updates.ts). */
  private updates: UpdateWatch | null = null;
  /** The club page on screen (v0.3). */
  private clubId: string | null = null;

  constructor() {
    const saved = storageGet('blatkom89.character');
    this.character = saved && isCharacterId(saved) ? saved : 'petya';
    if (!ONLINE_AVAILABLE) this.localProfile = loadLocalProfile();
    hudBus.on('pause', () => this.togglePause());
    hudBus.on('match-end', () => setTimeout(() => this.onMatchFinished(), 2200));
    onLangChange(() => this.relocalize());
    if (ONLINE_AVAILABLE)
      this.updates = watchForUpdates({
        canReload: () => this.screen === 'menu' && !this.pauseEl && !document.querySelector('.overlay, .sheet, .modal'),
        notify: () => toast(t('Updating the game to the new version…')),
      });
    // the chat switched off or on in the settings (also from the pause menu during a match)
    onSettings((st) => {
      if (!st.chat && this.chatOverlay) {
        this.chatOverlay.destroy();
        this.chatOverlay = null;
      } else if (st.chat && !this.chatOverlay && this.screen === 'game' && this.session?.mode === 'online') this.mountChatOverlay();
    });
  }

  /** The language was switched: draw the current screen again in the new language. */
  private relocalize() {
    switch (this.screen) {
      case 'menu':
        return this.goMenu();
      case 'characters':
      case 'practice':
      case 'friends':
      case 'social':
      case 'top':
      case 'blat':
      case 'kon':
      case 'profile':
      case 'settings':
      case 'arsenal':
        return this.open(this.screen, false);
      case 'lobby':
        this.chatPanel?.refresh();
        if (this.lastLobby) this.onLobby(this.lastLobby);
        return;
      case 'results':
        this.chatPanel?.refresh();
        if (this.lastResults) this.showResults(this.lastResults);
        return;
      default:
        return;
    }
  }

  /** Who made what: music, fonts, engine (licences in THIRD_PARTY_LICENSES.txt). */
  private showCredits() {
    const ov = h('div', { class: 'overlay overlay--top' });
    const close = () => ov.remove();
    ov.append(
      h(
        'div',
        { class: 'panel modal col credits' },
        h('span', { class: 'tag' }, t('Credits')),
        h('div', { class: 'h2', style: 'margin-top:6px' }, 'BLATKOM ’89'),
        // names of works, authors and licences stay as they are in every language
        h('div', null, h('b', null, t('Menu music')), ': «Hurt» — Infraction & Emerel Gray (Brazilian Phonk Sport).'),
        h('div', null, h('b', null, t('Fonts')), ': Oswald, PT Sans Narrow, Caveat — SIL Open Font License; Permanent Marker — Apache License 2.0.'),
        h('div', null, h('b', null, t('Engine')), ': Phaser 3 — MIT License.'),
        h('div', { class: 'muted' }, t('Characters, maps, weapons and sound effects are original work made for this game.')),
        h('a', { href: asset('THIRD_PARTY_LICENSES.txt'), target: '_blank', class: 'muted' }, t('Full licence texts')),
        h('button', { class: 'btn btn--red', onclick: close }, t('Close')),
      ),
    );
    this.root.append(ov);
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
        onChat: (line) => this.onChat(line),
      });
      this.online.onEmailSessionExpired = (email) =>
        openEmailLogin(this.root, this.online!, { email, note: t('This account’s session has expired — please sign in again.'), onDone: () => this.afterAccountSwitch() });
      // V2.0: $BLAT paid on sign-in (the level-1 welcome, levels reached before $BLAT) — said on the menu
      this.online.onBlatCredited = (n, level) => {
        this.blatNote = level <= 1 ? t('+{n} $BLAT — welcome to the district', { n: fmtBlat(n) }) : t('+{n} $BLAT for the levels you reached', { n: fmtBlat(n) });
        if (this.screen === 'menu') this.flushBlatNote();
      };
      this.online.pingVisit();
      this.online.social.on((e) => this.onSocial(e));
      void this.online
        .ensureAuth()
        .then(() => {
          this.refreshStrip();
          // v0.3: a provider just sent the player back — say how it went
          const back = this.online!.takeLoginOutcome();
          if (back) {
            // the account of another device: its alias was settled there, so it isn't asked again here
            const me = this.online!.profile;
            if (back.ok && !back.isNew && !back.linked && me) storageSet(NICK_CONFIRMED_KEY, me.id);
            const name = PROVIDER_NAME[back.ok ? (back.provider as LoginProvider) : 'google'] ?? (back.ok ? back.provider : '');
            toast(back.ok ? (back.linked ? t('{provider} is linked — your progress is safe', { provider: name }) : t('Signed in with {provider}', { provider: name })) : loginErrorText(back.reason));
          }
          // V2.0 part E: the Mini App opened from the bot's linking button — say how attaching Telegram went
          const link = this.online!.takeTelegramLinkOutcome();
          if (link) {
            const me = this.online!.profile;
            if ((link === 'linked' || link === 'already') && me) storageSet(NICK_CONFIRMED_KEY, me.id);
            toast(telegramLinkText(link, 'code'));
          }
          this.maybeWelcome();
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
      this.render(this.loading(t('Connecting to the room…')));
      void this.online.joinRoom(room, this.onlineCharacter()).catch((e: Error) => this.showError(apiErrorText(e)));
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
    if (pay === 'cancel') setTimeout(() => toast(t('Payment cancelled')), 600);
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
            toast(t('{n} credited', { n: count(st.diamonds, 'diamond') }));
            return;
          }
          if (st.status === 'failed' || st.status === 'expired') return toast(t('The payment did not go through'));
        } catch {
          /* keep polling */
        }
        if (tries < 40) setTimeout(() => void poll(), 3000);
        else toast(t('The payment is still being processed — the diamonds will arrive automatically'));
      };
      setTimeout(() => {
        toast(t('Checking the payment…'));
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
  /** The mode last picked for a quick match or a new room (free-for-all at first). */
  private savedMode(): GameMode {
    const v = storageGet(QUICK_MODE_KEY);
    return isGameMode(v) ? v : 'ffa';
  }

  private onlineCharacter(): CharacterId {
    return this.ownsCharacter(this.character) ? this.character : 'petya';
  }

  // ── navigation ──────────────────────────────────────────────────────────
  private go(s: Screen, push = true) {
    if (push && this.screen !== s && !['loading', 'error', 'game'].includes(this.screen)) this.history.push(this.screen);
    this.screen = s;
    if (s !== 'game' && this.chatOverlay) {
      this.chatOverlay.destroy();
      this.chatOverlay = null;
    }
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
      case 'social':
        return this.showSocial(push);
      case 'top':
        return this.showTop(push);
      case 'blat':
        return this.showBlat(push);
      case 'kon':
        return this.showKon(push);
      case 'clubs':
      case 'clubEdit':
        return this.showClubs(push);
      case 'club':
        return this.clubId ? this.showClub(this.clubId, push) : this.showClubs(push);
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
    return h('div', { class: 'topbar' }, h('button', { class: 'back', onclick: () => this.back(), 'aria-label': t('Back') }, t('← Back')), h('h1', { class: 'h1' }, title));
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
    music.setWanted(true);
    // a newer release found while playing: now is the moment (after the menu is on screen)
    setTimeout(() => this.updates?.atMenu(), 0);
    setTimeout(() => this.flushBlatNote(), 0);
    const onlineNote = ONLINE_AVAILABLE ? null : h('div', { class: 'muted', style: 'font-size:14px' }, t('This is the demo without a server: practice against bots is available. Online matches work in the online version.'));
    this.stripEl = this.profileTile();
    const menu = h(
      'div',
      { class: 'screen screen--dim' },
      h(
        'div',
        { class: 'wrap wrap--menu' },
        this.cornerControls(),
        h(
          'div',
          { class: 'menu-center' },
          h('img', { class: 'logo', src: asset(getLang() === 'ru' ? 'assets/ui/logo_ru.png' : 'assets/ui/logo.png'), alt: t('BLATKOM ’89 — district business is serious business') }),
          h(
            'div',
            { class: 'menu' },
            h(
              'div',
              { class: `panel menu__play ${this.online ? 'menu__play--kon' : ''}` },
              h('span', { class: 'tag' }, t('District Business')),
              h('button', { class: 'btn btn--red', onclick: () => this.quickMatch(), disabled: !ONLINE_AVAILABLE }, t('Quick Match'), h('span', { class: 'sub' }, t('online, up to {n} comrades', { n: MAX_ROOM_PLAYERS }))),
              h('button', { class: 'btn', onclick: () => this.showFriends(), disabled: !ONLINE_AVAILABLE }, t('Play with Friends'), h('span', { class: 'sub' }, t('a room by invitation'))),
              // V2.0 part D: ranked matches with fixed sides
              this.online ? h('button', { class: 'btn menu__kon', 'data-testid': 'menu-kon', onclick: () => this.showKon() }, t('Blatnoy Kon'), h('span', { class: 'sub' }, t('ranked 1×1 · 2×2 · 3×3 · 5×5'))) : null,
              h('button', { class: ONLINE_AVAILABLE ? 'btn' : 'btn btn--red', onclick: () => this.showPractice() }, t('Practice'), h('span', { class: 'sub' }, t('against bots, no internet needed'))),
              h('button', { class: 'btn menu__settings', onclick: () => this.showSettings() }, t('Settings'), h('span', { class: 'sub' }, t('picture, sound, controls, language'))),
              this.online ? (this.socialTiles = this.socialRow()) : null,
              onlineNote,
            ),
            h(
              'div',
              { class: 'menu__side' },
              h(
                'div',
                { class: 'panel col menu__char' },
                h('span', { class: 'tag' }, t('Character')),
                h(
                  'div',
                  { class: 'charcard', role: 'button', tabindex: '0', onclick: () => this.showCharacters(), onkeydown: (e: Event) => (e as KeyboardEvent).key === 'Enter' && this.showCharacters() },
                  portrait(this.character),
                  h('div', { class: 'col', style: 'gap:2px;min-width:0' }, h('div', { class: 'name' }, charText(this.character).name), h('div', { class: 'nick' }, `«${charText(this.character).nickname}»`), h('div', { class: 'hand' }, charText(this.character).quote)),
                ),
                h('button', { class: 'btn btn--small menu__charbtn', onclick: () => this.showCharacters() }, t('Change character')),
              ),
              h('div', { class: 'tiles' }, this.stripEl, this.arsenalTile()),
            ),
          ),
        ),
        ONLINE_AVAILABLE
          ? h('div', { class: 'footer' }, (REAL_MONEY ? t('BLATKOM ’89 · v{v} · Free to play, purchases optional', { v: VERSION }) : t('BLATKOM ’89 · v{v} · Free to play', { v: VERSION })), ' · ', h('a', { href: asset(getLang() === 'ru' ? 'privacy-ru.html' : 'privacy.html'), target: '_blank', style: 'color:inherit' }, t('Privacy')), ' · ', h('button', { class: 'linkish', onclick: () => this.showCredits() }, t('Credits')))
          : h('div', { class: 'footer' }, t('BLATKOM ’89 · v{v} · Demo: the game runs right in your browser; no data is collected or sent anywhere.', { v: VERSION }), ' · ', h('button', { class: 'linkish', onclick: () => this.showCredits() }, t('Credits'))),
      ),
    );
    this.render(menu);
    this.maybeWelcome();
    this.showPendingInvites();
  }

  /** Top-right corner of the menu: language and music switches. */
  private cornerControls(): HTMLElement {
    const lang = h(
      'div',
      { class: 'seg seg--tiny', role: 'group', 'aria-label': t('Language') },
      ...LANGS.map((l) => h('button', { 'aria-pressed': String(getLang() === l), lang: l, onclick: () => setLang(l) }, l === 'en' ? 'EN' : 'RU')),
    );
    const box = h('div', { class: 'corner' }, lang);
    if (music.available()) {
      const btn = h('button', { class: 'iconbtn', 'aria-pressed': String(music.volume() > 0) });
      const paint = () => {
        const on = music.volume() > 0;
        btn.setAttribute('aria-pressed', String(on));
        btn.setAttribute('aria-label', on ? t('Music on — tap to mute') : t('Music off — tap to play'));
        btn.title = btn.getAttribute('aria-label')!;
        btn.replaceChildren(speakerIcon(on));
      };
      btn.addEventListener('click', () => {
        music.toggle();
        paint();
      });
      paint();
      box.append(btn);
    }
    // phones: Settings lives here instead of a fourth big button
    if (this.screen === 'menu') box.append(h('button', { class: 'iconbtn corner__gear', 'aria-label': t('Settings'), title: t('Settings'), 'data-testid': 'corner-settings', onclick: () => this.showSettings() }, gearIcon()));
    return box;
  }

  // ── profile, nickname, level ────────────────────────────────────────────
  private playerName(): string | null {
    return this.online ? (this.online.profile?.displayName ?? null) : (this.localProfile?.displayName ?? null);
  }

  private playerAvatar(): AvatarId | null {
    return this.online ? (this.online.profile?.avatar ?? null) : (this.localProfile?.avatar ?? null);
  }

  private playerLevel(): number | null {
    if (this.online) return this.online.profile?.level ?? null;
    return this.localProfile ? levelForXp(this.localProfile.xp).level : null;
  }

  /** Square tile under the character card: level, alias (✎ to rename), XP and the wallet. Opens the profile. */
  private profileTile(): HTMLElement {
    const name = this.playerName();
    const tile = h('div', { class: 'tile tile--profile', 'data-testid': 'profile-strip' });
    if (!name) {
      tile.append(
        h('span', { class: 'tag' }, t('Dossier')),
        h('div', { class: 'tile__body' }, h('div', { class: 'tile__head' }, h('div', { class: 'lvlbadge' }, h('small', null, t('LVL')), '—')), h('div', { class: 'nm muted' }, this.online ? t('Signing in…') : t('No alias'))),
      );
      if (!this.online) tile.append(h('button', { class: 'edit', 'aria-label': t('Choose an alias'), onclick: () => this.editNickname() }, '✎'));
      return tile;
    }
    const xp = this.online ? (this.online.profile?.xp ?? 0) : (this.localProfile?.xp ?? 0);
    const lvl = levelForXp(xp);
    const pct = lvl.nextLevelCost > 0 ? Math.round((lvl.intoLevel / lvl.nextLevelCost) * 100) : 100;
    const level = this.playerLevel() ?? lvl.level;
    const inv = this.online?.inventory;
    const nick = h('div', { class: 'nm', 'data-testid': 'menu-nick' }, h('span', { class: 'fit-text' }, name));
    // the whole alias stays visible: a long one gets a smaller font, a very long one two lines
    whenSized(tile, () => fitAlias(nick, { max: 17, min: 12, minTwoLines: 10, margin: 8 }));
    tile.append(
      h('span', { class: 'tag' }, t('Dossier')),
      h(
        'div',
        {
          class: 'tile__body',
          role: 'button',
          tabindex: '0',
          'aria-label': t('Profile: {name}, level {level}', { name, level }),
          onclick: () => this.showProfile(),
          onkeydown: (e: Event) => (e as KeyboardEvent).key === 'Enter' && this.showProfile(),
        },
        h('div', { class: 'tile__head' }, avatarButton(this.playerAvatar(), () => this.editAvatar()), h('div', { class: 'lvlbadge' }, h('small', null, t('LVL')), String(level))),
        nick,
        h('div', { class: 'xpbar' }, h('i', { style: `width:${pct}%` })),
        h('div', { class: 'xp' }, lvl.nextLevelCost > 0 ? `${lvl.intoLevel} / ${lvl.nextLevelCost} XP` : t('max level')),
        inv ? h('div', { class: 'tile__wallet' }, amount(inv.tokens, 'tokens'), REAL_MONEY ? amount(inv.diamonds, 'diamonds') : null) : null,
      ),
      h('button', { class: 'edit', 'aria-label': t('Change alias'), title: t('Change alias'), onclick: () => this.editNickname() }, '✎'),
    );
    return tile;
  }

  /** The big Arsenal button: a pistol and the word. */
  private arsenalTile(): HTMLElement {
    return h(
      'button',
      { class: 'tile tile--arsenal', onclick: () => this.showArsenal(), 'data-testid': 'arsenal-tile' },
      h('img', { class: 'tile__gun', src: asset('assets/ui/menu_arsenal.png'), alt: '', draggable: 'false', width: 132, height: 96 }),
      h('span', { class: 'tile__title' }, t('Arsenal')),
      h('span', { class: 'tile__sub' }, t('weapons · gear · characters')),
    );
  }

  /** Under the tiles: Friends (who is online, unread messages and requests) and the Top-100. */
  private socialRow(): HTMLElement {
    const social = this.online!.social;
    const badge = social.badge();
    return h(
      'div',
      { class: 'stiles' },
      h(
        'button',
        { class: 'stile', 'data-testid': 'menu-friends', onclick: () => this.showSocial() },
        socialIcon('friends'),
        h('span', { class: 'stile__txt' }, h('b', null, t('Friends')), h('small', null, friendsSub(social))),
        badge > 0 ? h('span', { class: 'nbadge stile__badge', 'data-testid': 'friends-badge', 'aria-label': t('{n} new', { n: badge }) }, String(badge)) : null,
      ),
      this.clubTile(),
      h('button', { class: 'stile', 'data-testid': 'menu-top', onclick: () => this.showTop() }, socialIcon('top'), h('span', { class: 'stile__txt' }, h('b', null, t('Top-100')), h('small', null, t('rating · level · eliminations')))),
      // V2.0: $BLAT — the coin, the balance
      h(
        'button',
        { class: 'stile stile--blat', 'data-testid': 'menu-blat', onclick: () => this.showBlat(true, 'balance') },
        h('span', { class: 'stile__coin' }, blatCoin(32, '')),
        h('span', { class: 'stile__txt' }, h('b', null, '$BLAT'), h('small', { 'data-testid': 'menu-blat-balance' }, fmtBlat(this.online?.profile?.blat ?? 0))),
      ),
    );
  }

  /** V2.0: $BLAT — balance, history, level rewards, invitations; part C: the BLAT DROP tab. */
  private showBlat(push = true, tab: 'balance' | 'drop' = this.blatTab) {
    const online = this.online;
    if (!online) return;
    this.blatTab = tab;
    this.go('blat', push);
    const tabBtn = (id: 'balance' | 'drop', label: string) =>
      h('button', { type: 'button', role: 'tab', 'aria-pressed': String(tab === id), 'aria-selected': String(tab === id), 'data-testid': `blat-tab-${id}`, onclick: () => tab !== id && this.showBlat(false, id) }, label);
    const tabs = h('div', { class: 'seg blat__tabs', role: 'tablist' }, tabBtn('balance', '$BLAT'), tabBtn('drop', 'BLAT DROP'));
    const body = h('div', { class: 'col center' }, h('div', { class: 'spinner' }));
    const wrap = h('div', { class: 'wrap' }, this.topbar('$BLAT'), tabs, body);
    this.render(h('div', { class: 'screen screen--dim' }, wrap));
    const fail = (e: unknown) => {
      if (this.screen === 'blat' && this.blatTab === tab) body.replaceWith(h('div', { class: 'panel' }, apiErrorText(e)));
    };
    if (tab === 'drop') {
      // the server's clock against this device's: the middle of the request is the best guess of «now»
      const sent = Date.now();
      const drop = online.api.blatDrop().then((d) => ({ d, at: (sent + Date.now()) / 2 }));
      // the player's own numbers on the same tab (the date still shows if they don't come)
      const mine = online.api
        .blat()
        .then((b) => ({ balance: b.balance, confirmed: b.referral.confirmed }))
        .catch(() => null);
      void Promise.all([drop, mine])
        .then(([{ d, at }, m]) => {
          if (this.screen === 'blat' && this.blatTab === 'drop') body.replaceWith(renderBlatDrop(d, at, m));
        })
        .catch(fail);
      return;
    }
    void online.api
      .blat()
      .then((d) => {
        if (this.screen !== 'blat' || this.blatTab !== 'balance') return;
        if (online.profile) online.profile = { ...online.profile, blat: d.balance };
        body.replaceWith(renderBlat(d));
        if (d.justCredited > 0) toast(t('+{n} $BLAT for the levels you reached', { n: fmtBlat(d.justCredited) }));
      })
      .catch(fail);
  }

  /** The «Блатной кон» format last chosen (2×2 the first time). */
  private konFormat(): KonFormat {
    const v = storageGet(KON_FORMAT_KEY);
    return isKonFormat(v) ? v : '2x2';
  }

  /** V2.0 part D: «Блатной кон» — the player's Kon numbers, the format, the search, a room, the tables. */
  private showKon(push = true) {
    const online = this.online;
    if (!online) return;
    this.go('kon', push);
    const body = h('div', { class: 'col center' }, h('div', { class: 'spinner' }));
    const wrap = h('div', { class: 'wrap' }, this.topbar(t('Blatnoy Kon')), body);
    this.render(h('div', { class: 'screen screen--dim' }, wrap));
    let top: KonTopResponse | null = null;
    let busy = false;
    let data: Awaited<ReturnType<typeof online.api.kon>> | null = null;
    const draw = () => {
      if (this.screen !== 'kon' || !data) return;
      const next = renderKon({
        data,
        format: this.konFormat(),
        onFormat: (f) => {
          storageSet(KON_FORMAT_KEY, f);
          draw();
        },
        onFind: () => void go('find'),
        onCreate: () => void go('create'),
        top,
        topBy: this.konTopBy,
        onTop: (by) => {
          this.konTopBy = by;
          top = null;
          draw();
          void loadTop();
        },
        busy,
      });
      wrap.lastElementChild!.replaceWith(next);
    };
    const loadTop = () =>
      online.api
        .konTop(this.konTopBy)
        .then((r) => {
          if (r.by !== this.konTopBy) return;
          top = r;
          draw();
        })
        .catch((e) => toast(apiErrorText(e)));
    const go = async (how: 'find' | 'create') => {
      if (busy) return;
      busy = true;
      draw();
      const f = this.konFormat();
      this.go('loading');
      this.render(this.loading(how === 'find' ? t('Looking for opponents…') : t('Creating the room…')));
      try {
        if (how === 'find') await online.konQuick(this.onlineCharacter(), f);
        else await online.createRoom('factory', this.onlineCharacter(), 'teams', f);
      } catch (e) {
        this.showError(apiErrorText(e));
      }
    };
    void online.api
      .kon()
      .then((d) => {
        data = d;
        draw();
        void loadTop();
      })
      .catch((e) => {
        if (this.screen === 'kon') body.replaceWith(h('div', { class: 'panel' }, apiErrorText(e)));
      });
  }

  /** Clubs (v0.3): the player's club flag (or the icon), its tag, and requests waiting for the head. */
  private clubTile(): HTMLElement {
    const club = this.online?.profile?.club ?? null;
    const waiting = this.online?.social.clubRequests ?? 0;
    return h(
      'button',
      { class: 'stile stile--club', 'data-testid': 'menu-clubs', onclick: () => this.showClubs() },
      club ? h('span', { class: 'stile__flag' }, clubFlag(club.flag, club.emblem, { size: 40 })) : socialIcon('clubs'),
      h('span', { class: 'stile__txt' }, h('b', null, t('Gangs')), h('small', null, club ? clubLabel(club) : t('crews and their table'))),
      waiting > 0 ? h('span', { class: 'nbadge stile__badge', 'data-testid': 'clubs-badge', 'aria-label': t('{n} new', { n: waiting }) }, String(waiting)) : null,
    );
  }

  private showClubs(push = true) {
    const online = this.online;
    if (!online) return;
    this.go('clubs', push);
    const p = online.profile;
    this.render(
      h(
        'div',
        { class: 'screen screen--dim' },
        h(
          'div',
          { class: 'wrap' },
          this.topbar(t('Gangs')),
          renderClubs({
            api: online.api,
            level: p?.level ?? 1,
            tokens: p?.tokens ?? 0,
            onOpen: (id) => this.showClub(id),
            onFound: () => this.showClubEditor(),
            onLoaded: (r) => online.social.setClubRequests(r.incoming),
          }),
        ),
      ),
    );
  }

  private showClub(id: string, push = true) {
    const online = this.online;
    if (!online) return;
    this.clubId = id;
    this.go('club', push);
    const changed = () => void online.refreshProfile().then(() => this.refreshSocialTiles()).catch(() => {});
    this.render(
      h(
        'div',
        { class: 'screen screen--dim' },
        h(
          'div',
          { class: 'wrap' },
          this.topbar(t('Gang')),
          renderClub({
            api: online.api,
            id,
            myId: online.profile?.id ?? null,
            onEdit: (c) => this.showClubEditor(c),
            onGone: () => this.showClubs(false),
            onChanged: changed,
          }),
        ),
      ),
    );
  }

  private showClubEditor(club?: ClubDetails) {
    const online = this.online;
    if (!online) return;
    this.go('clubEdit');
    this.render(
      h(
        'div',
        { class: 'screen screen--dim' },
        h(
          'div',
          { class: 'wrap' },
          this.topbar(club ? t('Flag and motto') : t('Start a gang')),
          renderClubEditor({
            api: online.api,
            ...(club ? { club } : {}),
            onDone: (c) => {
              void online.refreshProfile().then(() => this.refreshSocialTiles()).catch(() => {});
              // back to the club's page (the editor is not kept in the history)
              this.history = this.history.filter((s) => s !== 'club' && s !== 'clubEdit');
              this.showClub(c.id, false);
            },
          }),
        ),
      ),
    );
  }

  private refreshSocialTiles() {
    if (!this.socialTiles?.isConnected || !this.online) return;
    const next = this.socialRow();
    this.socialTiles.replaceWith(next);
    this.socialTiles = next;
  }

  /** Online alias checks for the alias dialog (aliases are unique). */
  private nameCheck(): ((name: string) => Promise<NameCheckResponse>) | undefined {
    const online = this.online;
    return online ? (name) => online.api.checkName(name) : undefined;
  }

  /** A guest in a browser: offer to register an email first, then the alias dialog. */
  private maybeWelcome() {
    if (this.screen !== 'menu' || this.welcomeClose || this.nickClose) return;
    const online = this.online;
    // V2.0 part E: a new profile in Telegram — maybe the player already has an account to bring here
    if (online && needsTelegramWelcome(online, inTelegram())) {
      this.welcomeClose = openTelegramWelcome(this.root, online, (outcome) => {
        this.welcomeClose = null;
        if (outcome === 'signed_in') return this.afterAccountSwitch();
        this.maybeAskNickname();
      });
      return;
    }
    if (!online || !needsWelcome(online, inTelegram())) return this.maybeAskNickname();
    this.welcomeClose = openWelcome(this.root, online, (outcome) => {
      this.welcomeClose = null;
      if (outcome === 'signed_in') return this.afterAccountSwitch();
      this.refreshStrip();
      this.maybeAskNickname();
    });
  }

  /** V2.0: the $BLAT note waiting for the menu (see `onBlatCredited`). */
  private flushBlatNote() {
    if (!this.blatNote) return;
    toast(this.blatNote);
    this.blatNote = null;
  }

  private refreshStrip() {
    // V2.0: the menu's $BLAT tile follows the balance
    const bal = this.root.querySelector<HTMLElement>('[data-testid="menu-blat-balance"]');
    if (bal) bal.textContent = fmtBlat(this.online?.profile?.blat ?? 0);
    if (!this.stripEl?.isConnected) return;
    const next = this.profileTile();
    this.stripEl.replaceWith(next);
    this.stripEl = next;
  }

  /** First launch: ask for a nickname (demo: before the first profile exists; online: new players). */
  private maybeAskNickname() {
    if (this.screen !== 'menu' || this.nickClose || this.welcomeClose) return;
    if (!this.online) {
      if (this.localProfile) return;
      this.nickClose = openNicknameDialog(this.root, {
        initial: randomNickname(),
        note: t('Your opponents see your alias — above your character, on the scoreboard and in the match report. XP and levels are kept in this browser; you can change the alias in your profile.'),
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
      cancelLabel: t('Keep it as is'),
      onClose: () => (this.nickClose = null),
      check: this.nameCheck(),
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
        note: t('You’ve been invited to a room. The other players will see your alias — above your character, on the scoreboard and in the match report.'),
        onSave: (name) => this.saveNickname(name),
        onCancel: () => storageSet(NICK_CONFIRMED_KEY, p.id),
        cancelLabel: t('Keep it as is'),
        onClose: () => {
          this.nickClose = null;
          resolve();
        },
        check: this.nameCheck(),
      });
    });
  }

  private editNickname(after?: () => void) {
    if (this.nickClose) return;
    this.nickClose = openNicknameDialog(this.root, {
      initial: this.playerName() ?? randomNickname(),
      title: this.playerName() ? t('Change alias') : t('What do they call you round here?'),
      onSave: async (name) => {
        await this.saveNickname(name);
        after?.();
      },
      onCancel: () => {},
      onClose: () => (this.nickClose = null),
      check: this.nameCheck(),
    });
  }

  /** The avatar picker (Dossier tile, profile). */
  private editAvatar(after?: () => void) {
    if (!this.online && !this.localProfile) return this.editNickname(() => this.editAvatar(after));
    openAvatarPicker(this.root, {
      current: this.playerAvatar(),
      onPick: async (id) => {
        if (this.online) {
          try {
            await this.online.setAvatar(id);
          } catch (e) {
            throw new Error(apiErrorText(e as Error));
          }
        } else if (this.localProfile) {
          this.localProfile = setLocalAvatar(this.localProfile, id);
          saveLocalProfile(this.localProfile);
        }
        this.refreshStrip();
        after?.();
      },
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
    toast(t('Alias: {name}', { name }));
  }

  // ── characters ──────────────────────────────────────────────────────────
  private showCharacters(push = true, initial?: CharacterId) {
    this.go('characters', push);
    let selected = initial ?? this.character;
    this.host.previewScene()?.setFocus(selected);
    const grid = h('div', { class: 'chars', role: 'radiogroup', 'aria-label': t('Characters') });
    const dossier = h('div', { class: 'panel dossier' });
    // phones: a short summary under the grid; the whole personal file opens in a sheet
    const summary = h('div', { class: 'panel charsum', 'data-testid': 'char-summary' });
    const actions = h('div', { class: 'row charsel__actions' });
    /** The personal file: the portrait from the BLATKOM sheets, the text and the record card. */
    const file = (id: CharacterId, locked: boolean, price: string | null): HTMLElement[] => {
      const c = charText(id);
      return [
        h('div', { class: `dossier__hero ${locked ? 'dossier__hero--locked' : ''}` }, heroImg(id, 'dossier__img'), h('div', { class: 'dossier__stamp' }, locked ? t('NOT IN THE CREW') : t('IN THE CREW'))),
        h(
          'div',
          { class: 'col dossier__text' },
          h('div', { class: 'h1' }, c.name, ' ', h('span', { style: 'color:var(--red)' }, `«${c.nickname}»`)),
          h('div', null, h('b', { style: 'font-family:Oswald;color:var(--muted)' }, t('Role:'), ' '), c.role),
          h('div', null, h('b', { style: 'font-family:Oswald;color:var(--muted)' }, t('Temper:'), ' '), c.personality),
          h('div', { class: 'quote' }, `«${c.quote}»`),
          h('div', { class: 'lore' }, c.lore),
          price ? h('div', { class: 'badge badge--host', style: 'align-self:flex-start' }, price) : null,
          h(
            'div',
            { class: 'col dossier__fields', style: 'gap:0;margin-top:6px' },
            ...(
              [
                [t('Name'), c.name],
                [t('Alias'), c.nickname],
                [t('Species'), c.species],
                [t('District'), c.district],
                [t('Business'), c.business],
                [t('Weapons'), c.weaponsNote],
              ] as const
            ).map(([k, v]) => h('div', { class: 'field' }, h('b', null, k), h('span', null, v))),
            h('div', { class: 'muted dossier__note', style: 'font-size:13px;margin-top:8px' }, t('All characters have the same stats — only their looks and temper differ.')),
          ),
        ),
      ];
    };
    const buttons = (locked: boolean): HTMLElement[] =>
      locked
        ? [h('button', { class: 'btn btn--red grow', onclick: () => this.showArsenal(true, 'characters') }, t('Unlock in the Arsenal')), h('button', { class: 'btn grow', onclick: () => this.startPractice({ ...this.lastPractice, character: selected }) }, t('Try in practice'))]
        : [h('button', { class: 'btn btn--red grow', onclick: confirm }, t('Choose'))];
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
            h('span', null, charText(id).name),
          ),
        ),
      );
      const c = charText(selected);
      const locked = !this.ownsCharacter(selected);
      const price = locked ? characterPriceNote(selected, this.online?.inventory ?? null) : null;
      dossier.replaceChildren(h('span', { class: 'tag' }, t('Personal File')), ...file(selected, locked, price));
      const openFile = () =>
        openSheet(this.root, {
          title: t('Personal File'),
          testid: 'dossier-sheet',
          cls: 'sheet--dossier',
          body: h('div', { class: 'dossier dossier--sheet' }, ...file(selected, locked, price)),
          actions: h('div', { class: 'row', style: 'flex:1;flex-wrap:nowrap' }, ...buttons(locked)),
        });
      summary.replaceChildren(
        h('span', { class: 'tag' }, t('Personal File')),
        h('button', { class: `charsum__hero ${locked ? 'charsum__hero--locked' : ''}`, 'aria-label': t('Personal File'), onclick: openFile }, heroImg(selected, 'charsum__img')),
        h(
          'div',
          { class: 'charsum__text' },
          h('div', { class: 'charsum__name' }, c.name, ' ', h('span', { class: 'nick' }, `«${c.nickname}»`)),
          h('div', { class: 'charsum__role muted' }, c.role),
          h('div', { class: 'quote charsum__quote' }, `«${c.quote}»`),
          h('div', { class: 'row', style: 'gap:6px;margin-top:auto' }, price ? h('span', { class: 'badge badge--host' }, price) : h('span', { class: 'badge badge--ok' }, t('IN THE CREW')), h('button', { class: 'btn btn--small charsum__more', 'data-testid': 'dossier-open', onclick: openFile }, t('Personal File'), ' ›')),
        ),
      );
      actions.replaceChildren(...buttons(locked));
    };
    const confirm = () => {
      if (!this.ownsCharacter(selected)) return;
      this.character = selected;
      storageSet('blatkom89.character', selected);
      analytics.track('character_selected', { character: selected });
      void this.online?.setPreferredCharacter(selected);
      root.querySelector('.sheetlay')?.dispatchEvent(new Event('sheet-close'));
      this.back();
    };
    const root = this.root;
    draw();
    if (this.online) void this.online.loadInventory().then(() => this.screen === 'characters' && draw()).catch(() => {});
    this.render(h('div', { class: 'screen screen--dim screen--chars' }, h('div', { class: 'wrap wrap--vcenter charsel' }, this.topbar(t('Choose a Character')), grid, summary, dossier, actions)));
  }

  // ── arsenal (loadout, shop, case, diamonds) ─────────────────────────────
  private showArsenal(push = true, tab?: ArsenalTab) {
    this.go('arsenal', push);
    const el = renderArsenal({
      online: this.online,
      inTelegram: inTelegram(),
      character: this.character,
      textures: this.host.game.textures,
      ...(tab ? { tab } : {}),
      onTry: (tryOn) => this.startPractice({ ...this.lastPractice, tryOn }),
      onWallet: () => this.refreshStrip(),
      onCharacter: (c) => this.showCharacters(true, c),
    });
    // wider than the other screens: the dressing room has columns (sketch v0.23); phones get their own layout
    this.render(h('div', { class: 'screen screen--dim screen--arsenal' }, h('div', { class: 'wrap wrap--wide wrap--arsenal' }, this.topbar(t('Arsenal')), el)));
  }

  // ── practice ────────────────────────────────────────────────────────────
  private showPractice(push = true) {
    this.go('practice', push);
    const s = getSettings();
    let mapId: MapId = this.lastPractice.mapId;
    let bots = Math.max(1, Math.min(MAX_PRACTICE_BOTS, s.bots));
    let diff: BotDifficulty = s.botDifficulty;
    let gameMode: GameMode = this.lastPractice.gameMode;
    const seg = <T extends string | number>(values: T[], cur: () => T, set: (v: T) => void, label: (v: T) => string) => {
      const el = h('div', { class: 'seg' });
      const draw = () => el.replaceChildren(...values.map((v) => h('button', { 'aria-pressed': String(v === cur()), onclick: () => (set(v), draw(), note()) }, label(v))));
      draw();
      return el;
    };
    const teamNote = h('div', { class: 'muted' });
    const rules = h('div', { class: 'muted', style: 'font-size:14px' });
    const note = () => {
      const red = Math.ceil((bots + 1) / 2);
      teamNote.textContent = isTeamMode(gameMode) ? t('You play for red. Red {r} — blue {b}: the bots are dealt to both teams.', { r: red, b: bots + 1 - red }) : t('Everyone against everyone: {n} bots.', { n: bots });
      rules.textContent = modeRules(gameMode, { teamScoreLimit: PRACTICE_TEAM_LIMIT });
    };
    note();
    const content = h(
      'div',
      { class: 'wrap wrap--vcenter' },
      this.topbar(t('Practice')),
      h('div', { class: 'panel col' }, h('span', { class: 'tag' }, t('Map')), mapField({ selected: mapId, onPick: (m) => (mapId = m) })),
      h(
        'div',
        { class: 'panel col' },
        h('span', { class: 'tag' }, t('Mode')),
        modeSwitch({ mode: gameMode, onMode: (m) => ((gameMode = m), note()) }),
        teamNote,
        rules,
      ),
      h(
        'div',
        { class: 'panel col' },
        h('span', { class: 'tag' }, t('Opponents')),
        h('div', { class: 'muted' }, t('Number of bots')),
        seg(Array.from({ length: MAX_PRACTICE_BOTS }, (_, i) => i + 1), () => bots, (v) => (bots = v), String),
        h('div', { class: 'muted' }, t('Difficulty')),
        seg<BotDifficulty>(['easy', 'normal', 'hard'], () => diff, (v) => (diff = v), (v) => ({ easy: t('Easy'), normal: t('Normal'), hard: t('Vicious') })[v]),
      ),
      h(
        'button',
        {
          class: 'btn btn--red',
          'data-testid': 'practice-start',
          onclick: () => {
            updateSettings({ bots, botDifficulty: diff });
            this.startPractice({ mapId, bots, difficulty: diff, gameMode });
          },
        },
        t('Start'),
      ),
    );
    this.render(h('div', { class: 'screen screen--dim' }, content));
  }

  /** Practice loadout: the player's own (online), the free default (demo), or a weapon to try on. */
  private practiceLoadout(t?: TryOn): Loadout {
    const base: Loadout = this.online?.inventory?.loadout ?? { ...DEFAULT_LOADOUT, mods: {}, skins: {} };
    if (!t) return base;
    let l: Loadout = { ...base, mods: { ...base.mods } };
    if (t.weapon) {
      const slot = WEAPONS[t.weapon].slot;
      l = { ...l, ...(slot === 1 ? { sidearm: t.weapon } : slot === 2 ? { melee: t.weapon } : { primary: t.weapon }) };
      if (t.mods) l.mods[t.weapon] = [...t.mods];
      // a skin tried on in the dressing room goes into practice too
      if (t.finish !== undefined) {
        const skins = { ...(l.skins ?? {}) };
        if (t.finish) skins[t.weapon] = t.finish;
        else delete skins[t.weapon];
        l = { ...l, skins };
      }
    }
    if (t.gadget) l.gadget = t.gadget;
    return l;
  }

  private static tryOnLabel(o: TryOn): string {
    const parts: string[] = [];
    if (o.weapon) parts.push(weaponName(o.weapon) + (o.finish ? ` · ${finishName(o.finish)}` : '') + (o.mods?.length ? ` + ${o.mods.map((m) => modText(m).name.toLowerCase()).join(', ')}` : ''));
    if (o.gadget) parts.push(gadgetName(o.gadget));
    return parts.join(t(' and '));
  }

  private startPractice(opts: { mapId: MapId; bots: number; difficulty: BotDifficulty; gameMode?: GameMode; tryOn?: TryOn; character?: CharacterId }) {
    this.lastPractice = { mapId: opts.mapId, difficulty: opts.difficulty, bots: Math.max(1, Math.min(MAX_PRACTICE_BOTS, opts.bots || 3)), gameMode: opts.gameMode ?? 'ffa' };
    const name = this.playerName() ?? charText(this.character).name;
    const session = new OfflineSession({
      mapId: opts.mapId,
      character: opts.character ?? this.character,
      name,
      level: this.playerLevel(),
      bots: this.lastPractice.bots,
      difficulty: opts.difficulty,
      gameMode: this.lastPractice.gameMode,
      loadout: this.practiceLoadout(opts.tryOn),
    });
    if (opts.tryOn) {
      const label = App.tryOnLabel(opts.tryOn);
      setTimeout(() => toast(opts.tryOn!.gadget ? t('Trying on: {label} — G key', { label }) : t('Trying on: {label}', { label })), 1200);
    }
    this.beginSession(session);
  }

  private beginSession(session: GameSession) {
    this.endSession(false);
    music.setWanted(false);
    this.session = session;
    this.resultsShown = false;
    this.go('game');
    this.root.replaceChildren(h('div', { class: 'rotate-hint panel', style: 'position:absolute;left:50%;top:40%;transform:translate(-50%,-50%);pointer-events:none;opacity:.85' }, t('Turn your phone sideways')));
    setTimeout(() => this.root.querySelector('.rotate-hint')?.remove(), 4000);
    enterGameMode();
    this.host.startGame(session);
    if (session.mode === 'online') this.mountChatOverlay();
  }

  private endSession(showPreview = true) {
    if (this.pauseEl) this.togglePause();
    if (this.chatOverlay) {
      this.chatOverlay.destroy();
      this.chatOverlay = null;
    }
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
    this.chatOverlay?.close();
    hudBus.emit('pause-state', true);
    this.pauseEl = h(
      'div',
      { class: 'overlay' },
      h(
        'div',
        { class: 'panel modal col' },
        h('span', { class: 'tag' }, offline ? t('Pause') : t('Menu')),
        h('div', { class: 'muted', style: 'margin-top:6px' }, offline ? t('Practice is paused.') : t('The match goes on — you take control again when you come back.')),
        h('button', { class: 'btn btn--red', onclick: () => this.togglePause() }, t('Resume')),
        h('button', { class: 'btn', onclick: () => (this.togglePause(), this.showSettingsOverlay()) }, t('Settings')),
        h('button', { class: 'btn', onclick: () => this.leaveMatch() }, offline ? t('Back to menu') : t('Leave the match')),
      ),
    );
    this.root.append(this.pauseEl);
  }

  private showSettingsOverlay() {
    const wrapEl = h('div', { class: 'overlay' });
    const close = () => wrapEl.remove();
    wrapEl.append(h('div', { class: 'panel modal col', style: 'max-height:90vh;overflow:auto' }, renderSettings({ inGame: true, online: this.online }), h('button', { class: 'btn btn--red', onclick: close }, t('Done'))));
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
    this.lastResults = r;
    music.setWanted(true);
    const same = this.screen === 'results';
    if (!same) this.go('results', false);
    const offline = this.session?.mode !== 'online';
    const myId = offline ? 'local' : (this.online?.profile?.id ?? '');
    // demo build: a finished practice match counts towards the browser-only profile (once per match)
    const local = offline && !this.online && this.session instanceof OfflineSession;
    if (local && this.localProfile) {
      const rec = recordLocalMatch(this.localProfile, { matchId: r.matchId, reason: r.reason, durationMs: r.durationMs, mapId: r.mapId, standings: r.standings, localId: 'local', ...(r.teams ? { teams: r.teams } : {}) });
      if (rec) {
        this.localProfile = rec.profile;
        saveLocalProfile(rec.profile);
        this.lastLocalResult = { matchId: r.matchId, personal: rec.personal };
        if (rec.personal.leveledUp) sfx.play('kill', { volume: 0.7 });
      }
      if (this.lastLocalResult?.matchId === r.matchId) r = { ...r, personal: this.lastLocalResult.personal };
    }
    const chat = offline ? null : this.roomChat();
    const make = () => renderResults({
      results: r,
      myId,
      offline,
      chat: chat?.el ?? null,
      kon: offline ? null : (this.lastLobby?.kon ?? null),
      localProfile: local && !!this.localProfile,
      ...(local && !this.localProfile ? { offlineNote: t('Pick an alias in the menu and practice will start earning you XP and levels.') } : {}),
      onRematch: () => {
        if (offline && this.session instanceof OfflineSession) {
          this.resultsShown = false;
          this.session.setLocalIdentity(this.playerName() ?? charText(this.character).name, this.playerLevel());
          this.session.restart();
          this.go('game', false);
          this.root.replaceChildren();
        } else {
          this.online?.rematch();
          toast(t('Rematch vote counted'));
        }
      },
      onMenu: () => this.leaveMatch(),
    });
    this.redraw(same, chat, make);
  }

  // ── online ──────────────────────────────────────────────────────────────
  /** Quick match: pick a mode (remembered), then find a public room of that mode. */
  private quickMatch() {
    if (!this.online) return;
    const saved = this.savedMode();
    const ov = h('div', { class: 'overlay overlay--top' });
    const close = () => ov.remove();
    const go = (mode: GameMode) => {
      storageSet(QUICK_MODE_KEY, mode);
      close();
      void this.findMatch(mode);
    };
    ov.append(
      h(
        'div',
        { class: 'panel modal col', 'data-testid': 'quick-modes' },
        h('span', { class: 'tag' }, t('Quick Match')),
        h('div', { class: 'muted', style: 'margin-top:6px' }, t('Up to {n} players on one map. Which way do we settle it?', { n: MAX_ROOM_PLAYERS })),
        h(
          'div',
          { class: 'quickmodes' },
          ...MODE_ORDER.map((m) => h('button', { class: `btn quickmode ${saved === m ? 'btn--red' : ''}`, 'data-mode': m, onclick: () => go(m) }, modeIcon(m), h('span', { class: 'quickmode__txt' }, modeName(m), h('span', { class: 'sub' }, modeSub(m))))),
        ),
        h('button', { class: 'btn btn--ghost btn--small', onclick: close }, t('Cancel')),
      ),
    );
    this.root.append(ov);
  }

  private async findMatch(mode: GameMode) {
    if (!this.online) return;
    this.go('loading');
    this.render(this.loading(t('Looking for a match…')));
    try {
      await this.online.quickMatch(this.onlineCharacter(), mode);
    } catch (e) {
      this.showError(apiErrorText(e));
    }
  }

  private showFriends(push = true) {
    if (!this.online) return;
    this.go('friends', push);
    let mapId: MapId = 'factory';
    let gameMode: GameMode = this.savedMode();
    const code = h('input', { class: 'input', placeholder: t('Invite code'), maxlength: '16', autocapitalize: 'off', autocomplete: 'off', inputmode: 'text', 'aria-label': t('Invite code') });
    const content = h(
      'div',
      { class: 'wrap wrap--vcenter' },
      this.topbar(t('Play with Friends')),
      h(
        'div',
        { class: 'panel col' },
        h('span', { class: 'tag' }, t('Your Own Room')),
        h('div', { class: 'muted' }, t('Create a room and send your friends the invite link. Up to {n} players.', { n: MAX_ROOM_PLAYERS })),
        modeSwitch({ mode: gameMode, onMode: (m) => (gameMode = m) }),
        mapField({ selected: mapId, onPick: (m) => (mapId = m) }),
        h(
          'button',
          {
            class: 'btn btn--red',
            onclick: async () => {
              this.go('loading');
              this.render(this.loading(t('Creating the room…')));
              storageSet(QUICK_MODE_KEY, gameMode);
              try {
                await this.online!.createRoom(mapId, this.onlineCharacter(), gameMode);
              } catch (e) {
                this.showError(apiErrorText(e));
              }
            },
          },
          t('Create a room'),
        ),
      ),
      h(
        'div',
        { class: 'panel col' },
        h('span', { class: 'tag' }, t('By Code')),
        code,
        h(
          'button',
          {
            class: 'btn',
            onclick: () => {
              const v = code.value.trim();
              if (!/^[A-Za-z0-9]{6,16}$/.test(v)) return toast(t('Invalid code'));
              this.joinInvite(v);
            },
          },
          t('Join by code'),
        ),
      ),
    );
    this.render(h('div', { class: 'screen screen--dim' }, content));
  }

  // ── friends and the Top-100 ─────────────────────────────────────────────
  private showSocial(push = true) {
    const online = this.online;
    if (!online) return;
    this.go('social', push);
    this.render(
      h(
        'div',
        { class: 'screen screen--dim' },
        h('div', { class: 'wrap' }, this.topbar(t('Friends')), renderFriends({ online, root: this.root, onPlayWith: (f) => void this.playWith(f), onTop: () => this.showTop() })),
      ),
    );
  }

  private showTop(push = true) {
    const online = this.online;
    if (!online) return;
    this.go('top', push);
    this.render(h('div', { class: 'screen screen--dim' }, h('div', { class: 'wrap' }, this.topbar(t('Top-100')), renderTop({ online, by: this.topBy, onBy: (b) => (this.topBy = b) }))));
  }

  /** «Play» with a friend: a private room in the last mode; they are invited once we are inside. */
  private async playWith(f: FriendEntry) {
    if (!this.online) return;
    this.pendingInvite = f;
    this.go('loading');
    this.render(this.loading(t('Creating the room…')));
    try {
      await this.online.createRoom('factory', this.onlineCharacter(), this.savedMode());
    } catch (e) {
      this.pendingInvite = null;
      this.showError(apiErrorText(e));
    }
  }

  /** Live news from friends: invitations, requests, messages. */
  // ── room chat ───────────────────────────────────────────────────────────
  private chatSource(): ChatSource | null {
    const online = this.online;
    if (!online) return null;
    return {
      lines: () => online.chatLines,
      send: (text, team) => online.sendChat(text, team),
      canTeam: () => {
        const s = this.lastLobby;
        return !!s && isTeamMode(s.mode) && (s.players.find((p) => p.id === s.myId)?.team ?? null) !== null;
      },
    };
  }

  /** The chat panel of the current room (lobby, results); null when the chat is switched off. */
  private roomChat(): ChatPanel | null {
    const src = this.chatSource();
    const room = this.online?.chatRoomId ?? null;
    if (!src || !room || !getSettings().chat) return null;
    if (!this.chatPanel || this.chatPanelRoom !== room) {
      this.chatPanel = new ChatPanel(src);
      this.chatPanelRoom = room;
    }
    return this.chatPanel;
  }

  private mountChatOverlay() {
    this.chatOverlay?.destroy();
    this.chatOverlay = null;
    const src = this.chatSource();
    if (!src || !getSettings().chat) return;
    this.chatOverlay = new ChatOverlay(src, { canvas: () => this.host.game.canvas, canOpen: () => this.screen === 'game' && !this.pauseEl });
    this.chatOverlay.mount(this.root);
  }

  private onChat(line: ChatLine) {
    if (!getSettings().chat) return;
    if (this.chatPanel && this.chatPanelRoom === this.online?.chatRoomId) this.chatPanel.add(line);
    this.chatOverlay?.add(line);
    if (line.system || isMuted(line)) return;
    if (this.screen === 'game') hudBus.emit('chat-say', { slot: line.slot, text: line.text });
    else if (!line.mine) sfx.play('click', { volume: 0.4 });
  }

  /** Draws a lobby/results screen again without losing the chat input's focus or the page's scroll. */
  private redraw(same: boolean, chat: ChatPanel | null, el: () => HTMLElement) {
    const top = same ? (this.root.querySelector<HTMLElement>(':scope > .screen')?.scrollTop ?? 0) : 0;
    const draw = () => this.render(el());
    if (chat) chat.keep(draw);
    else draw();
    if (same && top) {
      const sc = this.root.querySelector<HTMLElement>(':scope > .screen');
      if (sc) sc.scrollTop = top;
    }
  }

  private onSocial(e: SocialSignal) {
    if (e.type === 'changed') return this.refreshSocialTiles();
    if (!this.online) return;
    const inGame = this.screen === 'game';
    switch (e.type) {
      case 'invite':
        if (this.online.currentRoomId() === e.invite.roomId) return;
        this.showInvite(e.invite);
        return;
      case 'friend_request':
        if (!inGame) toast(t('{name} wants to be your friend — see Friends', { name: e.from.name }));
        return;
      case 'friend_accepted':
        if (!inGame) toast(t('{name} accepted your friend request', { name: e.friend.name }));
        return;
      // clubs (v0.3): the news, and the club pages on screen redrawn
      case 'club_request':
        if (!inGame) toast(t('{name} asks to join your gang', { name: e.from.name }));
        if (this.screen === 'club' && this.clubId === e.clubId) this.showClub(e.clubId, false);
        return;
      case 'club_joined':
        if (!inGame) toast(t('You are in «{name}» now', { name: e.club.name }));
        this.afterClubChange();
        return;
      case 'club_declined':
        if (!inGame) toast(t('Your request to «{name}» was turned down', { name: e.name }));
        this.afterClubChange();
        return;
      case 'club_left':
        if (!inGame) toast(e.reason === 'disbanded' ? t('Your gang was disbanded') : t('You were shown out of the gang'));
        this.afterClubChange();
        return;
      case 'club_head':
        if (!inGame) toast(t('You are the gang’s boss now'));
        this.afterClubChange();
        return;
      // V2.0: an invitation counted (or waits for a check)
      case 'referral':
        if (!inGame) toast(e.held ? t('An invitation of yours is being checked — the reward comes after the check') : t('{name} played their first match through your link: +{n} $BLAT', { name: e.name, n: fmtBlat(e.reward) }));
        if (this.online.profile && e.balance >= 0) this.online.profile = { ...this.online.profile, blat: e.balance };
        if (this.screen === 'blat' && this.blatTab === 'balance') this.showBlat(false);
        else this.refreshSocialTiles();
        return;
      case 'dm': {
        const me = this.online.profile?.id;
        if (e.message.from === me || this.online.social.openChat === e.message.from || inGame) return;
        const text = e.message.text.length > 60 ? `${e.message.text.slice(0, 60)}…` : e.message.text;
        toast(`✉ ${e.from.name}: ${text}`);
        return;
      }
      default:
        return;
    }
  }

  /** The player's club changed elsewhere: the profile (menu tile) and any club screen on display. */
  private afterClubChange() {
    const online = this.online;
    if (!online) return;
    void online
      .refreshProfile()
      .then(() => {
        this.refreshSocialTiles();
        if (this.screen === 'clubs') this.showClubs(false);
        else if (this.screen === 'club' && this.clubId) this.showClub(this.clubId, false);
      })
      .catch(() => {});
  }

  private showInvite(inv: RoomInviteEvent) {
    const online = this.online;
    if (!online) return;
    this.inviteCards.get(inv.roomId)?.();
    const close = showInviteCard({
      invite: inv,
      inMatch: this.screen === 'game' || this.screen === 'lobby',
      onJoin: () => {
        this.inviteCards.delete(inv.roomId);
        online.social.dropInvite(inv.roomId);
        void this.joinInvitedRoom(inv.roomId);
      },
      onDismiss: () => {
        this.inviteCards.delete(inv.roomId);
        online.social.dropInvite(inv.roomId);
      },
    });
    this.inviteCards.set(inv.roomId, close);
  }

  /** Invitations that arrived while the match was on, once back in the menu. */
  private showPendingInvites() {
    if (!this.online) return;
    for (const inv of this.online.social.liveInvites()) if (!this.inviteCards.has(inv.roomId)) this.showInvite(inv);
  }

  private async joinInvitedRoom(roomId: string) {
    const online = this.online;
    if (!online) return;
    if (online.currentRoomId()) await online.leave();
    this.endSession();
    this.go('loading');
    this.render(this.loading(t('Entering the room…')));
    try {
      await this.ensureNicknameBeforeJoin();
      await online.joinRoom(roomId, this.onlineCharacter());
    } catch (e) {
      this.showError(apiErrorText(e));
    }
  }

  private joinInvite(code: string) {
    if (!this.online) return;
    this.go('join');
    this.render(this.loading(t('Checking the invitation…')));
    void this.online
      .resolveInvite(code)
      .then(async (info) => {
        analytics.track('invite_opened', { code, result: info.status });
        if (info.status === 'joinable' || info.status === 'in_progress') {
          await this.ensureNicknameBeforeJoin();
          const into = info.kon ? t('Entering the Blatnoy Kon {f} room ({host})…', { f: konLabel(info.kon), host: info.hostName ?? '—' }) : info.hostName ? t('Entering the room ({host})…', { host: info.hostName }) : t('Entering the room…');
          this.render(this.loading(into));
          await this.online!.joinRoom(info.roomId!, this.onlineCharacter());
          return;
        }
        const msg: Record<string, string> = {
          full: info.kon && info.status === 'full' ? t('The Kon room is full — both sides are taken.') : t('The room is full.'),
          finished: t('That match is already over.'),
          expired: t('The invitation has expired — the room is closed.'),
          not_found: t('Invitation not found.'),
        };
        this.showError(msg[info.status] ?? t('Could not join with this invitation.'), false);
      })
      .catch((e: Error) => this.showError(apiErrorText(e)));
  }

  private onLobby(s: LobbyState) {
    this.lastLobby = s;
    if (this.screen === 'game' && (s.phase === 'active' || s.phase === 'countdown' || s.phase === 'ready' || s.phase === 'finished')) return;
    if (this.screen === 'results' && s.phase === 'finished') return;
    if (s.phase !== 'waiting') return;
    const same = this.screen === 'lobby';
    if (this.screen !== 'lobby') {
      this.endSession();
      this.go('lobby', false);
    }
    music.setWanted(true);
    const online = this.online;
    if (online && this.pendingInvite) {
      const f = this.pendingInvite;
      this.pendingInvite = null;
      void online.api
        .inviteFriend(f.id, s.roomId)
        .then((r) => {
          online.invited.set(f.id, Date.now());
          toast(r.delivered ? t('Invitation sent to {name}', { name: f.name }) : t('{name} is offline — the invitation won’t reach them', { name: f.name }));
          if (this.screen === 'lobby' && this.lastLobby) this.onLobby(this.lastLobby);
        })
        .catch((e) => toast(apiErrorText(e)));
    }
    const chat = this.roomChat();
    this.redraw(same, chat, () =>
      renderLobby({
        state: s,
        extra: online ? friendsInvitePanel({ online, roomId: s.roomId, inRoom: (id) => s.players.some((p) => p.id === id), onFriends: () => this.showSocial() }) : null,
        chat: chat?.el ?? null,
        character: this.onlineCharacter(),
        onReady: (r) => this.online?.setReady(r),
        onStart: () => this.online?.startMatch(),
        onMap: (m) => this.online?.setMap(m),
        onMode: (m) => this.online?.setMode(m),
        onTeam: (team) => this.online?.setTeam(team),
        onCharacter: () => this.showCharacters(),
        onLeave: () => void this.online?.leave(),
        inTelegram: inTelegram(),
      }),
    );
  }

  private showProfile(push = true) {
    if (!this.online && !this.localProfile) return this.editNickname(() => this.showProfile());
    this.go('profile', push);
    const box = h('div', { class: 'wrap' }, this.topbar(t('Profile')), this.loading(t('Loading the profile…')));
    this.render(h('div', { class: 'screen screen--dim' }, box));
    const load: Promise<ProfileData> = this.online ? loadOnlineProfile(this.online) : Promise.resolve(localProfileView(this.localProfile!, this.character));
    void load
      .then((d) => {
        if (this.screen !== 'profile') return;
        box.replaceChildren(this.topbar(t('Profile')));
        if (this.online) box.append(renderAccountPanel(this.online, { root: this.root, onChanged: () => (this.refreshStrip(), this.screen === 'profile' && this.showProfile(false)) }));
        const reopen = () => this.screen === 'profile' && this.showProfile(false);
        box.append(renderProfileView(d, { local: !this.online, onRename: () => this.editNickname(reopen), onAvatar: () => this.editAvatar(reopen) }));
      })
      .catch((e: Error) => box.replaceChildren(this.topbar(t('Profile')), h('div', { class: 'panel' }, t('Could not load the profile: {error}', { error: apiErrorText(e) }))));
  }

  private showSettings(push = true) {
    this.go('settings', push);
    const onResetLocal = !this.online && this.localProfile ? () => this.resetLocalProfile() : undefined;
    this.render(h('div', { class: 'screen screen--dim' }, h('div', { class: 'wrap' }, this.topbar(t('Settings')), renderSettings({ inGame: false, online: this.online, ...(onResetLocal ? { onResetLocal } : {}) }))));
  }

  /** Demo build: forget the browser-only profile (the nickname dialog opens again in the menu). */
  private resetLocalProfile() {
    clearLocalProfile();
    this.localProfile = null;
    this.lastLocalResult = null;
    toast(t('Local profile reset'));
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
          h('span', { class: 'tag' }, t('Malfunction')),
          h('div', { style: 'font-size:18px;margin-top:8px' }, message),
          retry ? h('button', { class: 'btn', onclick: () => location.reload() }, t('Retry')) : null,
          h('button', { class: 'btn btn--red', onclick: () => this.goMenu() }, t('To menu')),
        ),
      ),
    );
  }

  static standingsName(s: Standing): string {
    return s.isBot ? `${s.name} · ${t('bot')}` : s.name;
  }

  static fmt = fmtDuration;
}
