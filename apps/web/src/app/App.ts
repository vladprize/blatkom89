/**
 * App shell: screen navigation (HTML/CSS over the canvas), offline practice flow, online flow
 * (auth → lobby → match → results), pause menu and Telegram back-button integration.
 */
import { CHARACTERS, CHARACTER_IDS, MAP_ORDER, getMap, isCharacterId, isMapId } from '@blatkom/shared';
import type { CharacterId, MapId, BotDifficulty, Standing } from '@blatkom/shared';
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
import { renderProfile } from '../ui/screens/profile.js';
import { renderResults } from '../ui/screens/results.js';
import { renderLobby } from '../ui/screens/lobby.js';
import { sfx } from '../game/audio/Sfx.js';

type Screen = 'menu' | 'characters' | 'practice' | 'friends' | 'lobby' | 'join' | 'game' | 'results' | 'profile' | 'settings' | 'error' | 'loading';

const MAP_BLURB: Record<MapId, string> = {
  factory: 'Проходная, цех №3, склад. Коридоры, укрытия, контроль точек.',
  garages: 'Ряды гаражей, узкие проходы, засады на ближней дистанции.',
  yard: 'Панельки, арки и детская площадка. Обходы и средние дистанции.',
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

  constructor() {
    const saved = storageGet('blatkom89.character');
    this.character = saved && isCharacterId(saved) ? saved : 'petya';
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
      void this.online.ensureAuth().catch(() => {});
    }
    const params = new URLSearchParams(location.search);
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
      this.render(this.loading('Подключаемся к комнате…'));
      void this.online.joinRoom(room, this.character).catch((e: Error) => this.showError(e.message));
      return;
    }
    this.goMenu();
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
      default:
        return this.goMenu();
    }
  }

  private render(el: HTMLElement) {
    this.root.replaceChildren(el);
  }

  private topbar(title: string): HTMLElement {
    return h('div', { class: 'topbar' }, h('button', { class: 'back', onclick: () => this.back(), 'aria-label': 'Назад' }, '← Назад'), h('h1', { class: 'h1' }, title));
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
    const onlineNote = ONLINE_AVAILABLE ? null : h('div', { class: 'muted', style: 'font-size:14px' }, 'Это демо-версия без сервера: доступна тренировка с ботами. Онлайн-матчи работают в Telegram-версии.');
    const name = this.online?.profile?.displayName;
    const menu = h(
      'div',
      { class: 'screen screen--dim' },
      h(
        'div',
        { class: 'wrap' },
        h('img', { class: 'logo', src: asset('assets/ui/logo.png'), alt: 'БЛАТКОМ ’89 — районные дела, серьёзные дела' }),
        h(
          'div',
          { class: 'menu' },
          h(
            'div',
            { class: 'panel btn-col' },
            h('span', { class: 'tag' }, 'Районные дела'),
            h('div', { style: 'height:6px' }),
            h('button', { class: 'btn btn--red', onclick: () => this.quickMatch(), disabled: !ONLINE_AVAILABLE }, 'Быстрая игра', h('span', { class: 'sub' }, 'онлайн, до 6 игроков')),
            h('button', { class: 'btn', onclick: () => this.showFriends(), disabled: !ONLINE_AVAILABLE }, 'Играть с друзьями', h('span', { class: 'sub' }, 'комната по приглашению')),
            h('button', { class: ONLINE_AVAILABLE ? 'btn' : 'btn btn--red', onclick: () => this.showPractice() }, 'Тренировка', h('span', { class: 'sub' }, 'с ботами, без интернета')),
            h('div', { class: 'row' }, h('button', { class: 'btn grow', onclick: () => this.showProfile(), disabled: !ONLINE_AVAILABLE }, 'Профиль'), h('button', { class: 'btn grow', onclick: () => this.showSettings() }, 'Настройки')),
            onlineNote,
          ),
          h(
            'div',
            { class: 'panel col' },
            h('span', { class: 'tag' }, 'Персонаж'),
            h(
              'div',
              { class: 'charcard', role: 'button', tabindex: '0', onclick: () => this.showCharacters(), onkeydown: (e: Event) => (e as KeyboardEvent).key === 'Enter' && this.showCharacters() },
              portrait(this.character),
              h('div', { class: 'col', style: 'gap:2px' }, h('div', { class: 'name' }, c.name), h('div', { class: 'nick' }, `«${c.nickname}»`), h('div', { class: 'hand' }, c.quote)),
            ),
            h('button', { class: 'btn btn--small', onclick: () => this.showCharacters() }, 'Сменить персонажа'),
            name ? h('div', { class: 'muted' }, `Вы вошли как ${name}`) : null,
          ),
        ),
        h('div', { class: 'grow' }),
        h('div', { class: 'footer' }, `БЛАТКОМ ’89 · v${VERSION} · Бесплатно. Без доната. · `, h('a', { href: asset('privacy.html'), target: '_blank', style: 'color:inherit' }, 'Конфиденциальность')),
      ),
    );
    this.render(menu);
  }

  // ── characters ──────────────────────────────────────────────────────────
  private showCharacters(push = true) {
    this.go('characters', push);
    let selected = this.character;
    const grid = h('div', { class: 'chars', role: 'radiogroup', 'aria-label': 'Персонажи' });
    const dossier = h('div', { class: 'panel dossier' });
    const draw = () => {
      grid.replaceChildren(
        ...CHARACTER_IDS.map((id) =>
          h(
            'button',
            {
              'aria-pressed': String(id === selected),
              role: 'radio',
              onclick: () => {
                selected = id;
                this.host.previewScene()?.setFocus(id);
                sfx.play('click');
                haptic('select');
                draw();
              },
            },
            portrait(id),
            CHARACTERS[id].name,
          ),
        ),
      );
      const c = CHARACTERS[selected];
      dossier.replaceChildren(
        h('span', { class: 'tag' }, 'Личное дело'),
        h(
          'div',
          { class: 'col' },
          h('div', { class: 'h1' }, c.name, ' ', h('span', { style: 'color:var(--red)' }, `«${c.nickname}»`)),
          h('div', null, h('b', { style: 'font-family:Oswald;color:var(--muted)' }, 'Роль: '), c.role),
          h('div', null, h('b', { style: 'font-family:Oswald;color:var(--muted)' }, 'Характер: '), c.personality),
          h('div', { class: 'quote' }, `«${c.quote}»`),
        ),
        h(
          'div',
          { class: 'col', style: 'gap:0' },
          ...(
            [
              ['Имя', c.name],
              ['Кличка', c.nickname],
              ['Вид', c.species],
              ['Район', c.district],
              ['Дело', c.business],
              ['Оружие', c.weaponsNote],
            ] as const
          ).map(([k, v]) => h('div', { class: 'field' }, h('b', null, k), h('span', null, v))),
          h('div', { class: 'muted', style: 'font-size:13px;margin-top:8px' }, 'Все персонажи равны по характеристикам — различаются только внешность и характер.'),
        ),
      );
    };
    draw();
    const confirm = () => {
      this.character = selected;
      storageSet('blatkom89.character', selected);
      analytics.track('character_selected', { character: selected });
      void this.online?.setPreferredCharacter(selected);
      this.back();
    };
    this.render(h('div', { class: 'screen screen--dim' }, h('div', { class: 'wrap' }, this.topbar('Выбор персонажа'), grid, dossier, h('button', { class: 'btn btn--red', onclick: confirm }, 'Выбрать'))));
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
      this.topbar('Тренировка'),
      h('div', { class: 'panel col' }, h('span', { class: 'tag' }, 'Карта'), maps),
      h(
        'div',
        { class: 'panel col' },
        h('span', { class: 'tag' }, 'Соперники'),
        h('div', { class: 'muted' }, 'Количество ботов'),
        seg([1, 2, 3, 4, 5], () => bots, (v) => (bots = v), String),
        h('div', { class: 'muted' }, 'Сложность'),
        seg<BotDifficulty>(['easy', 'normal', 'hard'], () => diff, (v) => (diff = v), (v) => ({ easy: 'Лёгкие', normal: 'Нормальные', hard: 'Злые' })[v]),
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
        'Начать',
      ),
    );
    this.render(h('div', { class: 'screen screen--dim' }, content));
  }

  private startPractice(opts: { mapId: MapId; bots: number; difficulty: BotDifficulty }) {
    this.lastPractice = { ...opts, bots: Math.max(1, Math.min(5, opts.bots || 3)) };
    const name = this.online?.profile?.displayName ?? CHARACTERS[this.character].name;
    const session = new OfflineSession({ mapId: opts.mapId, character: this.character, name, bots: this.lastPractice.bots, difficulty: opts.difficulty });
    this.beginSession(session);
    analytics.track('tutorial_completed', { step: 'practice_started' });
  }

  private beginSession(session: GameSession) {
    this.endSession(false);
    this.session = session;
    this.resultsShown = false;
    this.go('game');
    this.root.replaceChildren(h('div', { class: 'rotate-hint panel', style: 'position:absolute;left:50%;top:40%;transform:translate(-50%,-50%);pointer-events:none;opacity:.85' }, 'Поверните телефон горизонтально'));
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
        h('span', { class: 'tag' }, offline ? 'Пауза' : 'Меню'),
        h('div', { class: 'muted', style: 'margin-top:6px' }, offline ? 'Тренировка на паузе.' : 'Матч продолжается — вы управляете персонажем после возврата.'),
        h('button', { class: 'btn btn--red', onclick: () => this.togglePause() }, 'Продолжить'),
        h('button', { class: 'btn', onclick: () => (this.togglePause(), this.showSettingsOverlay()) }, 'Настройки'),
        h('button', { class: 'btn', onclick: () => this.leaveMatch() }, offline ? 'Выйти в меню' : 'Покинуть матч'),
      ),
    );
    this.root.append(this.pauseEl);
  }

  private showSettingsOverlay() {
    const wrapEl = h('div', { class: 'overlay' });
    const close = () => wrapEl.remove();
    wrapEl.append(h('div', { class: 'panel modal col', style: 'max-height:90vh;overflow:auto' }, renderSettings({ inGame: true, online: this.online }), h('button', { class: 'btn btn--red', onclick: close }, 'Готово')));
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
    const el = renderResults({
      results: r,
      myId,
      offline,
      onRematch: () => {
        if (offline && this.session instanceof OfflineSession) {
          this.resultsShown = false;
          this.session.restart();
          this.go('game', false);
          this.root.replaceChildren();
        } else {
          this.online?.rematch();
          toast('Голос за реванш принят');
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
    this.render(this.loading('Ищем матч…'));
    try {
      await this.online.quickMatch(this.character);
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
    const code = h('input', { class: 'input', placeholder: 'Код приглашения', maxlength: '16', autocapitalize: 'off', autocomplete: 'off', inputmode: 'text', 'aria-label': 'Код приглашения' });
    const content = h(
      'div',
      { class: 'wrap' },
      this.topbar('Играть с друзьями'),
      h(
        'div',
        { class: 'panel col' },
        h('span', { class: 'tag' }, 'Своя комната'),
        h('div', { class: 'muted' }, 'Создайте комнату и отправьте друзьям ссылку-приглашение.'),
        maps,
        h(
          'button',
          {
            class: 'btn btn--red',
            onclick: async () => {
              this.go('loading');
              this.render(this.loading('Создаём комнату…'));
              try {
                await this.online!.createRoom(mapId, this.character);
              } catch (e) {
                this.showError((e as Error).message);
              }
            },
          },
          'Создать комнату',
        ),
      ),
      h(
        'div',
        { class: 'panel col' },
        h('span', { class: 'tag' }, 'По коду'),
        code,
        h(
          'button',
          {
            class: 'btn',
            onclick: () => {
              const v = code.value.trim();
              if (!/^[A-Za-z0-9]{6,16}$/.test(v)) return toast('Неверный код');
              this.joinInvite(v);
            },
          },
          'Войти по коду',
        ),
      ),
    );
    this.render(h('div', { class: 'screen screen--dim' }, content));
  }

  private joinInvite(code: string) {
    if (!this.online) return;
    this.go('join');
    this.render(this.loading('Проверяем приглашение…'));
    void this.online
      .resolveInvite(code)
      .then(async (info) => {
        analytics.track('invite_opened', { code, result: info.status });
        if (info.status === 'joinable' || info.status === 'in_progress') {
          this.render(this.loading(`Входим в комнату${info.hostName ? ` (${info.hostName})` : ''}…`));
          await this.online!.joinRoom(info.roomId!, this.character);
          return;
        }
        const msg: Record<string, string> = {
          full: 'Комната заполнена.',
          finished: 'Матч уже закончился.',
          expired: 'Приглашение устарело — комната закрыта.',
          not_found: 'Приглашение не найдено.',
        };
        this.showError(msg[info.status] ?? 'Не удалось войти по приглашению.', false);
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
        character: this.character,
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
    if (!this.online) return;
    this.go('profile', push);
    const box = h('div', { class: 'wrap' }, this.topbar('Профиль'), this.loading('Загружаем профиль…'));
    this.render(h('div', { class: 'screen screen--dim' }, box));
    void renderProfile(this.online)
      .then((el) => box.replaceChildren(this.topbar('Профиль'), el))
      .catch((e: Error) => box.replaceChildren(this.topbar('Профиль'), h('div', { class: 'panel' }, `Не удалось загрузить профиль: ${e.message}`)));
  }

  private showSettings(push = true) {
    this.go('settings', push);
    this.render(h('div', { class: 'screen screen--dim' }, h('div', { class: 'wrap' }, this.topbar('Настройки'), renderSettings({ inGame: false, online: this.online }))));
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
          h('span', { class: 'tag' }, 'Неполадка'),
          h('div', { style: 'font-size:18px;margin-top:8px' }, message),
          retry ? h('button', { class: 'btn', onclick: () => location.reload() }, 'Повторить') : null,
          h('button', { class: 'btn btn--red', onclick: () => this.goMenu() }, 'В меню'),
        ),
      ),
    );
  }

  static standingsName(s: Standing): string {
    return s.isBot ? `${s.name} · бот` : s.name;
  }

  static fmt = fmtDuration;
}
