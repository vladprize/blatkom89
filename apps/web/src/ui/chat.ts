/**
 * Room chat (v0.23, text only): a panel in the lobby and on the results screen, an overlay during
 * the match (Enter — everybody, T — your team, or the chat button on the HUD). The server passes
 * the lines to the players in the room and stores none of them; the client keeps the last lines of
 * the current room. Clicking a name in the panel mutes that player for this visit.
 */
import { h, fill, toast } from './dom.js';
import { t } from '../i18n/index.js';
import { CHAT_RULES } from '@blatkom/shared';
import type { ChatLine } from '../net/OnlineClient.js';
import { hudBus, hudLayout } from '../game/scenes/hudBus.js';
import type { HudLayout } from '../game/scenes/hudBus.js';

export interface ChatSource {
  lines(): readonly ChatLine[];
  send(text: string, team: boolean): void;
  /** Team chat is possible right now (a team mode and the player is in a team). */
  canTeam(): boolean;
}

/** Players muted in this visit (by player id): their lines are not shown anywhere. */
const muted = new Set<string>();

export function isMuted(line: ChatLine): boolean {
  return !line.system && muted.has(line.id);
}

/** Ready-made lines for thumbs (sent in the sender's language, like anything typed). */
function quickLines(): string[] {
  return [t('Hi, lads!'), t('Good game!'), t('Follow me!'), t('Cover me!'), t('Nice one!'), t('One more?')];
}

/** How long a line stays on the screen during the match (the overlay closed). */
const FRESH_MS = 10_000;

function lineEl(l: ChatLine, onName?: (l: ChatLine) => void): HTMLElement {
  if (l.system) return h('div', { class: 'chatline chatline--sys', 'data-testid': 'room-chat-line' }, l.text);
  const side = l.team === 0 ? ' chatline__name--red' : l.team === 1 ? ' chatline__name--blue' : l.mine ? ' chatline__name--me' : '';
  const name =
    onName && !l.mine
      ? h('button', { class: `chatline__name${side}`, type: 'button', title: t('Mute or unmute this player'), onclick: () => onName(l) }, l.name)
      : h('b', { class: `chatline__name${side}` }, l.name);
  return h('div', { class: `chatline${l.toTeam ? ' chatline--team' : ''}`, 'data-testid': 'room-chat-line' }, l.toTeam ? h('span', { class: 'chatline__tag' }, t('team')) : null, name, h('span', { class: 'chatline__text' }, l.text));
}

/** The input with the scope switch (everybody / team), the send button and the ready-made lines. */
class Composer {
  readonly input: HTMLInputElement;
  readonly row: HTMLElement;
  readonly quick: HTMLElement;
  team = false;
  private readonly scopeBtn: HTMLButtonElement;
  private readonly sendBtn: HTMLButtonElement;

  constructor(
    private readonly src: ChatSource,
    private readonly onSent: () => void,
  ) {
    this.input = h('input', {
      class: 'input rchat__input',
      maxlength: String(CHAT_RULES.maxLength),
      autocomplete: 'off',
      enterkeyhint: 'send',
      'data-testid': 'room-chat-input',
    }) as HTMLInputElement;
    this.scopeBtn = h('button', { class: 'rchat__scope', type: 'button', 'data-testid': 'room-chat-scope', onclick: () => (this.setTeam(!this.team), this.input.focus()) }) as HTMLButtonElement;
    this.sendBtn = h('button', { class: 'btn btn--small btn--red rchat__send', type: 'button', 'data-testid': 'room-chat-send', onclick: () => this.send() }) as HTMLButtonElement;
    this.row = h('div', { class: 'rchat__row' }, this.scopeBtn, this.input, this.sendBtn);
    this.quick = h('div', { class: 'rchat__quick', 'data-testid': 'room-chat-quick' });
    // a press on the buttons must not take the focus away from the input (the overlay closes on blur)
    for (const b of [this.scopeBtn, this.sendBtn]) b.addEventListener('pointerdown', (e) => e.preventDefault());
    this.quick.addEventListener('pointerdown', (e) => e.preventDefault());
    this.relabel();
  }

  /** Texts in the current language; the scope switch only where a team chat exists. */
  relabel(): void {
    this.input.placeholder = t('Say something…');
    this.input.setAttribute('aria-label', t('Chat message'));
    this.sendBtn.textContent = t('Send');
    fill(this.quick, ...quickLines().map((q) => h('button', { class: 'chip', type: 'button', onclick: () => this.send(q) }, q)));
    this.setTeam(this.team);
  }

  setTeam(v: boolean): void {
    const can = this.src.canTeam();
    this.team = v && can;
    this.scopeBtn.hidden = !can;
    this.scopeBtn.textContent = this.team ? t('Team') : t('All');
    this.scopeBtn.setAttribute('aria-pressed', String(this.team));
    this.scopeBtn.title = this.team ? t('Only your team reads this (Tab — everybody)') : t('Everybody in the room reads this (Tab — team)');
    this.input.classList.toggle('rchat__input--team', this.team);
  }

  /** Sends the input (or a ready-made line); false when there was nothing to send. */
  send(text?: string): boolean {
    const s = (text ?? this.input.value).trim();
    if (!s) return false;
    this.src.send(s, this.team);
    if (text === undefined) this.input.value = '';
    this.onSent();
    return true;
  }
}

/** The chat panel of the lobby and the results screen (one per room, kept across re-renders). */
export class ChatPanel {
  readonly el: HTMLElement;
  private readonly log: HTMLElement;
  private readonly tag: HTMLElement;
  private readonly composer: Composer;
  private readonly note: HTMLElement;

  constructor(private readonly src: ChatSource) {
    this.log = h('div', { class: 'rchat__log', role: 'log', 'aria-live': 'polite', 'data-testid': 'room-chat-log' });
    this.composer = new Composer(src, () => this.scrollDown());
    this.composer.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        this.composer.send();
      }
    });
    this.tag = h('span', { class: 'tag' });
    this.note = h('div', { class: 'muted rchat__note' });
    this.el = h('div', { class: 'panel col rchat', 'data-testid': 'room-chat-panel' }, this.tag, this.log, this.composer.row, this.composer.quick, this.note);
    this.refresh();
  }

  /** Draws everything again (the language changed, the room changed, a player muted). */
  refresh(): void {
    this.tag.textContent = t('Room chat');
    this.note.textContent = t('Lines go to the players in this room and aren’t stored. Click a name to mute that player.');
    this.composer.relabel();
    const lines = this.src.lines().filter((l) => !isMuted(l));
    fill(this.log, ...(lines.length ? lines.map((l) => lineEl(l, (x) => this.toggleMute(x))) : [h('div', { class: 'muted rchat__empty' }, t('Nobody has said anything yet.'))]));
    this.scrollDown();
  }

  add(line: ChatLine): void {
    if (isMuted(line)) return;
    const atBottom = this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 24;
    this.log.querySelector('.rchat__empty')?.remove();
    this.log.append(lineEl(line, (x) => this.toggleMute(x)));
    while (this.log.childElementCount > 60) this.log.firstElementChild?.remove();
    if (atBottom || line.mine) this.scrollDown();
  }

  /** Keeps the input's focus and caret and the log's scroll across a re-render of the screen around the panel. */
  keep(render: () => void): void {
    const focused = document.activeElement === this.composer.input;
    const { selectionStart: a, selectionEnd: b } = this.composer.input;
    const top = this.log.scrollTop;
    render();
    this.log.scrollTop = top;
    this.composer.setTeam(this.composer.team);
    if (focused) {
      this.composer.input.focus({ preventScroll: true });
      if (a !== null && b !== null) this.composer.input.setSelectionRange(a, b);
    }
  }

  private toggleMute(l: ChatLine) {
    if (muted.has(l.id)) {
      muted.delete(l.id);
      toast(t('{name} can be heard again', { name: l.name }));
    } else {
      muted.add(l.id);
      toast(t('{name} is muted until you reload the game', { name: l.name }));
    }
    this.refresh();
  }

  private scrollDown() {
    this.log.scrollTop = this.log.scrollHeight;
  }
}

/**
 * The chat over the match: recent lines fade after a few seconds; Enter (everybody) or T (team)
 * opens the input, Enter sends, Esc closes, Tab switches everybody/team. While the input is open
 * the game gets no keys (the mouse still aims; a click on the game closes the input).
 */
export class ChatOverlay {
  readonly el: HTMLElement;
  private readonly box: HTMLElement;
  private readonly log: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly btn: HTMLButtonElement;
  private readonly composer: Composer;
  private opened = false;
  private raf = 0;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(
    src: ChatSource,
    private readonly o: {
      /** The game canvas (its rectangle maps HUD pixels to the page). */
      canvas: () => HTMLCanvasElement | null;
      /** False while the pause menu is up. */
      canOpen: () => boolean;
    },
  ) {
    this.log = h('div', { class: 'chatlay__log', 'data-testid': 'room-chat-overlay-log' });
    // scrolling the log must not take the focus away from the input
    this.log.addEventListener('pointerdown', (e) => e.preventDefault());
    this.composer = new Composer(src, () => undefined);
    const input = this.composer.input;
    input.addEventListener('keydown', (e) => {
      // the game must not see the keys typed here (WASD, Esc, Tab, digits…)
      e.stopPropagation();
      if (e.isComposing) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        this.composer.send();
        this.close();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        this.composer.setTeam(!this.composer.team);
      }
    });
    input.addEventListener('keyup', (e) => e.stopPropagation());
    input.addEventListener('blur', () => {
      if (this.opened) this.close();
    });
    const shut = h('button', { class: 'rchat__close', type: 'button', 'aria-label': t('Close'), 'data-testid': 'room-chat-close', onclick: () => this.close() }, '✕');
    shut.addEventListener('pointerdown', (e) => e.preventDefault());
    this.composer.row.append(shut);
    // a ready-made line is sent at once and closes the input
    this.composer.quick.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.chip')) this.close();
    });
    this.bar = h('div', { class: 'chatlay__bar' }, this.composer.row, this.composer.quick);
    this.box = h('div', { class: 'chatlay__box' }, this.log, this.bar);
    this.btn = h('button', { class: 'chatlay__btn', type: 'button', 'data-testid': 'room-chat-button', 'aria-label': t('Chat'), title: t('Chat (Enter)') }, h('i', { 'aria-hidden': 'true' })) as HTMLButtonElement;
    this.btn.addEventListener('pointerdown', (e) => e.preventDefault());
    this.btn.addEventListener('click', () => (this.opened ? this.close() : this.open(false)));
    this.el = h('div', { class: 'chatlay', 'data-testid': 'room-chat-overlay' }, this.box, this.btn);
    // the last lines of the room said just now (in the lobby, before the countdown)
    const now = Date.now();
    for (const l of src.lines().slice(-6)) if (!isMuted(l) && now - l.at < FRESH_MS) this.add(l, l.at);
  }

  mount(parent: HTMLElement): void {
    parent.append(this.el);
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('resize', this.onResize);
    hudBus.on('hud-layout', this.onResize, this);
    this.layout();
  }

  destroy(): void {
    this.opened = false;
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('resize', this.onResize);
    hudBus.off('hud-layout', this.onResize, this);
    cancelAnimationFrame(this.raf);
    for (const tm of this.timers) clearTimeout(tm);
    this.timers.clear();
    this.el.remove();
  }

  get isOpen(): boolean {
    return this.opened;
  }

  add(line: ChatLine, at = Date.now()): void {
    if (isMuted(line)) return;
    const el = lineEl(line);
    this.log.append(el);
    while (this.log.childElementCount > 30) this.log.firstElementChild?.remove();
    const age = Date.now() - at;
    if (age >= FRESH_MS) el.classList.add('chatline--old');
    else {
      const tm = setTimeout(() => {
        this.timers.delete(tm);
        el.classList.add('chatline--old');
      }, FRESH_MS - age);
      this.timers.add(tm);
    }
    this.log.scrollTop = this.log.scrollHeight;
  }

  open(team: boolean): void {
    if (this.opened || !this.o.canOpen()) return;
    this.opened = true;
    this.composer.setTeam(team);
    this.el.classList.add('chatlay--open');
    hudBus.emit('chat-open');
    this.layout();
    this.log.scrollTop = this.log.scrollHeight;
    this.composer.input.focus({ preventScroll: true });
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.el.classList.remove('chatlay--open');
    this.composer.input.blur();
    this.layout();
    this.log.scrollTop = this.log.scrollHeight;
  }

  private readonly onKey = (e: KeyboardEvent) => {
    if (this.opened || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const tg = e.target as HTMLElement | null;
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
    const team = e.code === 'KeyT';
    if (e.key !== 'Enter' && !team) return;
    if (!this.o.canOpen()) return;
    // the key opens the chat and goes nowhere else (no «t» typed into the input, no game action)
    e.preventDefault();
    e.stopPropagation();
    this.open(team);
  };

  private readonly onResize = () => {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.layout());
  };

  /** Places the log, the input and the button over the HUD (HUD pixels → page pixels through the canvas). */
  private layout() {
    const l: HudLayout | null = hudLayout();
    const canvas = this.o.canvas();
    if (!l || !canvas) {
      this.el.style.visibility = 'hidden';
      return;
    }
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const k = r.width / l.W;
    this.el.style.visibility = '';
    this.el.classList.toggle('chatlay--touch', l.touch);
    const s = this.box.style;
    // the lines grow with the HUD on big screens
    this.log.style.fontSize = `${l.touch ? 14 : Math.round(Math.min(20, Math.max(15, 12 * k)))}px`;
    if (l.touch && this.opened) {
      // phones: the input at the top of the screen (the keyboard covers the bottom), the log under it
      s.left = `${Math.round(r.left + 8)}px`;
      s.width = `${Math.round(Math.min(560, r.width - 16))}px`;
      s.top = `${Math.round(r.top + 8)}px`;
      s.bottom = '';
    } else {
      s.left = `${Math.round(r.left + l.chat.left * k)}px`;
      s.width = `${Math.round(Math.max(this.opened ? 340 : 220, l.chat.width * k))}px`;
      if (l.chat.top !== undefined) {
        s.top = `${Math.round(r.top + l.chat.top * k)}px`;
        s.bottom = '';
      } else {
        s.bottom = `${Math.round(window.innerHeight - r.bottom + (l.chat.bottom ?? 0) * k)}px`;
        s.top = '';
      }
    }
    const size = Math.round(Math.max(30, l.chatBtn.size * k));
    const bs = this.btn.style;
    bs.width = bs.height = `${size}px`;
    bs.left = `${Math.round(r.left + l.chatBtn.x * k - size / 2)}px`;
    bs.top = `${Math.round(r.top + l.chatBtn.y * k - size / 2)}px`;
  }
}
