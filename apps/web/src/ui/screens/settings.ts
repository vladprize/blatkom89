import { h, toast } from '../dom.js';
import { getSettings, onSettings, updateSettings } from '../../app/settings.js';
import type { Settings } from '../../app/settings.js';
import type { OnlineClient } from '../../net/OnlineClient.js';
import { displayNameSchema, nickInput, MAX_NICK_LENGTH } from '@blatkom/shared';
import { sfx } from '../../game/audio/Sfx.js';
import { music } from '../../game/audio/Music.js';
import { confirmAsync } from '../../telegram/tg.js';
import { t, getLang, setLang, LANGS, getSwear, setSwear } from '../../i18n/index.js';
import { apiErrorText } from '../../net/errors.js';
import { inPane, paneTabs } from '../panes.js';
import { isTouchDevice } from '../../game/input/TouchState.js';

export function renderSettings(opts: { inGame: boolean; online: OnlineClient | null; onResetLocal?: () => void }): HTMLElement {
  const s = getSettings();
  const seg = <T extends string | number | boolean>(label: string, values: Array<[T, string]>, key: keyof Settings, cls = '') => {
    const box = h('div', { class: 'seg', role: 'group', 'aria-label': label });
    const draw = () =>
      box.replaceChildren(
        ...values.map(([v, text]) =>
          h(
            'button',
            {
              'aria-pressed': String(getSettings()[key] === v),
              onclick: () => {
                updateSettings({ [key]: v } as Partial<Settings>);
                sfx.play('click');
                draw();
              },
            },
            text,
          ),
        ),
      );
    draw();
    return h('div', { class: `col setrow${cls ? ` ${cls}` : ''}`, style: 'gap:6px' }, h('div', { class: 'muted' }, label), box);
  };
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const slider = (label: string, key: 'sfxVolume' | 'musicVolume' | 'stickScale', min: number, max: number, step: number) => {
    const show = (v: number) => (key === 'stickScale' ? `×${v.toFixed(2)}` : pct(v));
    const out = h('span', null, show(s[key]));
    const input = h('input', { class: 'range', type: 'range', min: String(min), max: String(max), step: String(step), value: String(s[key]), 'aria-label': label }) as HTMLInputElement;
    input.addEventListener('input', () => {
      const v = Number(input.value);
      if (key === 'musicVolume') music.setVolume(v);
      else updateSettings({ [key]: v } as Partial<Settings>);
      out.textContent = show(v);
      if (key === 'sfxVolume') sfx.setVolume(v);
    });
    input.addEventListener('change', () => key === 'sfxVolume' && sfx.play('pistol', { volume: 0.6 }));
    return h('div', { class: 'col setslider', style: 'gap:4px' }, h('div', { class: 'row muted' }, h('span', { class: 'grow' }, label), out), input);
  };
  const language = h(
    'div',
    { class: 'panel col settings__lang' },
    h('span', { class: 'tag' }, t('Language')),
    h(
      'div',
      { class: 'seg settings__langseg', role: 'group', 'aria-label': t('Language'), style: 'margin-top:6px' },
      ...LANGS.map((l) =>
        h('button', { 'aria-pressed': String(getLang() === l), lang: l, 'aria-label': l === 'en' ? 'English' : 'Русский', onclick: () => setLang(l) }, h('span', { class: 'lang--long' }, l === 'en' ? 'English' : 'Русский'), h('span', { class: 'lang--short' }, l === 'en' ? 'EN' : 'RU')),
      ),
    ),
    // v0.2.25 (the owner): the texts swear by default — the game is 18+; «No swearing» brings the plain ones back
    h(
      'div',
      { class: 'col setrow settings__swear', style: 'gap:6px;margin-top:10px' },
      h('div', { class: 'muted settings__swearlabel' }, t('Swearing (18+)')),
      h(
        'div',
        { class: 'seg', role: 'group', 'aria-label': t('Swearing (18+)'), 'data-testid': 'settings-swear' },
        ...([true, false] as const).map((on) =>
          h('button', { 'aria-pressed': String(getSwear() === on), 'data-swear': on ? 'on' : 'off', onclick: () => (sfx.play('click'), setSwear(on)) }, on ? t('Swear') : t('No swearing')),
        ),
      ),
      h('div', { class: 'muted settings__note' }, t('Prices, odds, payments and the legal texts are always without swearing.')),
    ),
  );
  // v0.2.26 (the owner: «сделай тогда просто FableCut главный… убери предыдущую»): one picture — what is chosen is how
  // much of it the device draws. A row of its own where the screen has room (and always in the pause menu); on a
  // small settings screen the same three buttons sit on the panel's top edge, beside its tag (styles.css), so the
  // screen still fits. A step the game took by itself shows here too; a tap on another one makes it the player's.
  const qualityBox = h('div', { class: 'seg', role: 'group', 'aria-label': t('Picture quality'), 'data-testid': 'settings-quality' });
  const shown = () => Math.max(0, getSettings().quality);
  const drawQuality = () =>
    qualityBox.replaceChildren(
      ...([[0, t('Fast')], [1, t('Balanced')], [2, t('Cinema')]] as const).map(([tier, text]) =>
        h(
          'button',
          {
            'aria-pressed': String(shown() === tier),
            'data-quality': String(tier),
            onclick: () => {
              // the one already on stays as it is (also where the game itself went a step below «Быстро»)
              if (shown() === tier) return;
              updateSettings({ quality: tier, qualityPicked: true });
              sfx.play('click');
              drawQuality();
            },
          },
          text,
        ),
      ),
    );
  drawQuality();
  // the game may step the quality down while this is open (the pause menu's settings do not stop a match)
  const offQuality = onSettings(() => (qualityBox.isConnected ? drawQuality() : offQuality()));
  const graphics = h(
    'div',
    { class: 'panel col settings__picture' },
    h('span', { class: 'tag' }, t('Picture')),
    h(
      'div',
      { class: 'col setrow settings__quality', style: 'gap:6px' },
      // (a small screen: the buttons stand on the panel's edge after its tag — this hidden copy of the tag keeps its width for them)
      h('span', { class: 'tag settings__ghost', 'aria-hidden': 'true' }, t('Picture')),
      h('div', { class: 'muted' }, t('Picture quality')),
      qualityBox,
    ),
    seg(t('VHS effect (grain, tracking lines, vignette)'), [
      [0, t('Off')],
      [1, t('Worn tape')],
      [2, t('Tenth copy')],
      // v0.2.26: the row with the longest buttons — in a narrow column its name goes above them (styles.css)
    ], 'vhs', 'setrow--long'),
    seg(t('Camera shake'), [
      [true, t('On')],
      [false, t('Off')],
    ], 'shake'),
    seg(t('FPS counter'), [
      [false, t('Hidden')],
      [true, t('Show')],
    ], 'showFps'),
  );
  const sound = h(
    'div',
    { class: 'panel col settings__sound' },
    h('span', { class: 'tag' }, t('Sound')),
    slider(t('Effects volume'), 'sfxVolume', 0, 1, 0.05),
    music.available() ? slider(t('Music volume (menus)'), 'musicVolume', 0, 1, 0.05) : null,
  );
  // v0.2.21: a computer sees its keys only; a touch screen its sticks' settings (with the aim assist) and its help
  const touchUi = isTouchDevice();
  const controls = h(
    'div',
    { class: 'panel col settings__controls' },
    h('span', { class: 'tag' }, t('Controls')),
    ...(touchUi
      ? [
          seg(t('Right stick fires when pushed all the way'), [
            [true, t('On')],
            [false, t('Button only')],
          ], 'autoFire'),
          seg(t('Aim assist'), [
            [true, t('On')],
            [false, t('Off')],
          ], 'aimAssist'),
          seg(t('Left-handed (swap the sticks)'), [
            [false, t('No')],
            [true, t('Yes')],
          ], 'leftHanded'),
          slider(t('Stick size'), 'stickScale', 0.7, 1.4, 0.05),
          // v0.2.20: the sprint (the move stick past its ring)
          h('div', { class: 'muted', style: 'font-size:14px' }, t('Phone: pull the move stick past its ring to sprint — the blue bar under your health is your breath.')),
        ]
      : [h('div', { class: 'muted', style: 'font-size:14px' }, t('Computer: WASD — move, Shift — sprint (while your breath lasts), mouse — aim, left click — fire, R — reload, Q / wheel / 1-3 — weapons, G / middle click — equipment, E — pick up, C — walk quietly, Tab — score, Esc — menu.'))]),
  );
  const chat = opts.online
    ? h(
        'div',
        { class: 'panel col settings__chat' },
        h('span', { class: 'tag' }, t('Chat')),
        seg(t('Room chat (lobby, match, results)'), [
          [true, t('Shown')],
          [false, t('Hidden')],
        ], 'chat'),
        // v0.2.21: the keys are a computer's; a phone has the chat button
        touchUi ? null : h('div', { class: 'muted', style: 'font-size:14px' }, t('Enter — say something to everybody, T — to your team, Tab — switch. Lines go to the players in the room and aren’t stored.')),
      )
    : null;
  const items: HTMLElement[] = [language, graphics, sound, controls];
  if (chat) items.push(chat);
  if (opts.online && !opts.inGame) {
    const input = h('input', { class: 'input', value: opts.online.profile?.displayName ?? '', maxlength: String(MAX_NICK_LENGTH), autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', 'aria-label': t('In-game name') }) as HTMLInputElement;
    // v0.2.19: one word of small letters (typed letters become small, a space «_»)
    input.addEventListener('input', () => {
      const fixed = nickInput(input.value);
      if (fixed !== input.value) input.value = fixed;
    });
    items.push(
      h(
        'div',
        { class: 'panel col settings__profile' },
        h('span', { class: 'tag' }, t('Profile')),
        h('div', { class: 'muted' }, t('In-game name')),
        input,
        h(
          'button',
          {
            class: 'btn btn--small',
            onclick: async () => {
              const parsed = displayNameSchema.safeParse(input.value);
              if (!parsed.success) return toast(t('An alias is one word: small Latin letters (a–z), digits and _ . -'));
              try {
                await opts.online!.rename(parsed.data);
                toast(t('Name saved'));
              } catch (e) {
                toast(apiErrorText(e));
              }
            },
          },
          t('Save name'),
        ),
        h(
          'button',
          {
            class: 'btn btn--small btn--ghost',
            onclick: async () => {
              if (!(await confirmAsync(t('Delete the profile and all statistics for good? There’s no getting it back.')))) return;
              try {
                await opts.online!.api.deleteAccount();
                opts.online!.forgetLocalSession();
                toast(t('Profile deleted'));
                setTimeout(() => location.reload(), 800);
              } catch (e) {
                toast(apiErrorText(e));
              }
            },
          },
          t('Delete my data'),
        ),
      ),
    );
  }
  if (!opts.online && !opts.inGame && opts.onResetLocal) {
    const reset = opts.onResetLocal;
    items.push(
      h(
        'div',
        { class: 'panel col settings__profile' },
        h('span', { class: 'tag' }, t('Profile')),
        h('div', { class: 'muted' }, t('The demo’s alias, experience and statistics are kept only in this browser.')),
        h(
          'button',
          {
            class: 'btn btn--small btn--ghost',
            onclick: async () => {
              if (await confirmAsync(t('Reset the alias, experience and statistics in this browser?'))) reset();
            },
          },
          t('Reset local profile'),
        ),
      ),
    );
  }
  if (opts.inGame) return h('div', { class: 'col' }, ...items);
  // v0.2.17: the settings screen fits the window — two columns on a computer, one part at a time on a
  // phone (the picture and the sound · the controls and the chat · the profile)
  const root = h('div', { class: 'col settings fitcol', 'data-testid': 'settings' });
  const profile = items.find((el) => el.classList.contains('settings__profile')) ?? null;
  const tabs = paneTabs(root, 'settings', [
    { id: 'a', label: t('Picture and sound'), testid: 'settings-pane-picture' },
    { id: 'b', label: t('Controls'), testid: 'settings-pane-controls' },
    ...(profile ? [{ id: 'c' as const, label: t('Profile'), testid: 'settings-pane-profile' }] : []),
  ]);
  for (const el of [language, graphics, sound]) inPane(el, 'a');
  for (const el of [controls, chat]) if (el) inPane(el, 'b');
  if (profile) inPane(profile, 'c');
  root.append(
    tabs,
    h('div', { class: 'col settings__col' }, language, graphics, sound),
    h('div', { class: 'col settings__col' }, controls, chat, profile),
  );
  return root;
}
