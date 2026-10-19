import { h, toast } from '../dom.js';
import { getSettings, updateSettings } from '../../app/settings.js';
import type { Settings } from '../../app/settings.js';
import type { OnlineClient } from '../../net/OnlineClient.js';
import { displayNameSchema } from '@blatkom/shared';
import { sfx } from '../../game/audio/Sfx.js';
import { music } from '../../game/audio/Music.js';
import { confirmAsync } from '../../telegram/tg.js';
import { t, getLang, setLang, LANGS } from '../../i18n/index.js';
import { apiErrorText } from '../../net/errors.js';

export function renderSettings(opts: { inGame: boolean; online: OnlineClient | null; onResetLocal?: () => void }): HTMLElement {
  const s = getSettings();
  const seg = <T extends string | number | boolean>(label: string, values: Array<[T, string]>, key: keyof Settings) => {
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
    return h('div', { class: 'col', style: 'gap:6px' }, h('div', { class: 'muted' }, label), box);
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
    return h('div', { class: 'col', style: 'gap:4px' }, h('div', { class: 'row muted' }, h('span', { class: 'grow' }, label), out), input);
  };
  const language = h(
    'div',
    { class: 'panel col' },
    h('span', { class: 'tag' }, t('Language')),
    h(
      'div',
      { class: 'seg', role: 'group', 'aria-label': t('Language'), style: 'margin-top:6px' },
      ...LANGS.map((l) => h('button', { 'aria-pressed': String(getLang() === l), lang: l, onclick: () => setLang(l) }, l === 'en' ? 'English' : 'Русский')),
    ),
  );
  const graphics = h(
    'div',
    { class: 'panel col' },
    h('span', { class: 'tag' }, t('Picture')),
    seg(t('VHS effect (grain, tracking lines, vignette)'), [
      [0, t('Off')],
      [1, t('Worn tape')],
      [2, t('Tenth copy')],
    ], 'vhs'),
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
    { class: 'panel col' },
    h('span', { class: 'tag' }, t('Sound')),
    slider(t('Effects volume'), 'sfxVolume', 0, 1, 0.05),
    music.available() ? slider(t('Music volume (menus)'), 'musicVolume', 0, 1, 0.05) : null,
  );
  const controls = h(
    'div',
    { class: 'panel col' },
    h('span', { class: 'tag' }, t('Controls')),
    seg(t('Right stick fires when pushed all the way'), [
      [true, t('On')],
      [false, t('Button only')],
    ], 'autoFire'),
    seg(t('Left-handed (swap the sticks)'), [
      [false, t('No')],
      [true, t('Yes')],
    ], 'leftHanded'),
    slider(t('Stick size'), 'stickScale', 0.7, 1.4, 0.05),
    h('div', { class: 'muted', style: 'font-size:14px' }, t('Computer: WASD — move, mouse — aim, left click — fire, R — reload, Q / wheel / 1-3 — weapons, G / middle click — equipment, E — pick up, Shift — walk quietly, Tab — score, Esc — menu.')),
  );
  const items: HTMLElement[] = [language, graphics, sound, controls];
  if (opts.online && !opts.inGame) {
    const input = h('input', { class: 'input', value: opts.online.profile?.displayName ?? '', maxlength: '24', 'aria-label': t('In-game name') }) as HTMLInputElement;
    items.push(
      h(
        'div',
        { class: 'panel col' },
        h('span', { class: 'tag' }, t('Profile')),
        h('div', { class: 'muted' }, t('In-game name')),
        input,
        h(
          'button',
          {
            class: 'btn btn--small',
            onclick: async () => {
              const parsed = displayNameSchema.safeParse(input.value);
              if (!parsed.success) return toast(t('A name may contain letters, digits, spaces and _ . -'));
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
        { class: 'panel col' },
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
  return h('div', { class: 'col' }, ...items);
}
