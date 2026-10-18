import { h, toast } from '../dom.js';
import { getSettings, updateSettings } from '../../app/settings.js';
import type { Settings } from '../../app/settings.js';
import type { OnlineClient } from '../../net/OnlineClient.js';
import { displayNameSchema } from '@blatkom/shared';
import { sfx } from '../../game/audio/Sfx.js';
import { confirmAsync } from '../../telegram/tg.js';

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
  const slider = (label: string, key: 'sfxVolume' | 'musicVolume' | 'stickScale', min: number, max: number, step: number) => {
    const out = h('span', null, String(s[key]));
    const input = h('input', { class: 'range', type: 'range', min: String(min), max: String(max), step: String(step), value: String(s[key]), 'aria-label': label }) as HTMLInputElement;
    input.addEventListener('input', () => {
      updateSettings({ [key]: Number(input.value) } as Partial<Settings>);
      out.textContent = input.value;
      if (key === 'sfxVolume') sfx.setVolume(Number(input.value));
    });
    input.addEventListener('change', () => key === 'sfxVolume' && sfx.play('pistol', { volume: 0.6 }));
    return h('div', { class: 'col', style: 'gap:4px' }, h('div', { class: 'row muted' }, h('span', { class: 'grow' }, label), out), input);
  };
  const graphics = h(
    'div',
    { class: 'panel col' },
    h('span', { class: 'tag' }, 'Picture'),
    seg('VHS effect (grain, tracking lines, vignette)', [
      [0, 'Off'],
      [1, 'Worn tape'],
      [2, 'Tenth copy'],
    ], 'vhs'),
    seg('Camera shake', [
      [true, 'On'],
      [false, 'Off'],
    ], 'shake'),
    seg('FPS counter', [
      [false, 'Hidden'],
      [true, 'Show'],
    ], 'showFps'),
  );
  const sound = h('div', { class: 'panel col' }, h('span', { class: 'tag' }, 'Sound'), slider('Effects volume', 'sfxVolume', 0, 1, 0.05));
  const controls = h(
    'div',
    { class: 'panel col' },
    h('span', { class: 'tag' }, 'Controls'),
    seg('Right stick fires when pushed all the way', [
      [true, 'On'],
      [false, 'Button only'],
    ], 'autoFire'),
    seg('Left-handed (swap the sticks)', [
      [false, 'No'],
      [true, 'Yes'],
    ], 'leftHanded'),
    slider('Stick size', 'stickScale', 0.7, 1.4, 0.05),
    h('div', { class: 'muted', style: 'font-size:14px' }, 'Computer: WASD — move, mouse — aim, left click — fire, R — reload, Q / wheel / 1-3 — weapons, G / middle click — equipment, E — pick up, Shift — walk quietly, Tab — score, Esc — menu.'),
  );
  const items: HTMLElement[] = [graphics, sound, controls];
  if (opts.online && !opts.inGame) {
    const input = h('input', { class: 'input', value: opts.online.profile?.displayName ?? '', maxlength: '24', 'aria-label': 'In-game name' }) as HTMLInputElement;
    items.push(
      h(
        'div',
        { class: 'panel col' },
        h('span', { class: 'tag' }, 'Profile'),
        h('div', { class: 'muted' }, 'In-game name'),
        input,
        h(
          'button',
          {
            class: 'btn btn--small',
            onclick: async () => {
              const parsed = displayNameSchema.safeParse(input.value);
              if (!parsed.success) return toast(parsed.error.issues[0]?.message ?? 'That name won’t do');
              try {
                await opts.online!.rename(parsed.data);
                toast('Name saved');
              } catch (e) {
                toast((e as Error).message);
              }
            },
          },
          'Save name',
        ),
        h(
          'button',
          {
            class: 'btn btn--small btn--ghost',
            onclick: async () => {
              if (!(await confirmAsync('Delete the profile and all statistics for good? There’s no getting it back.'))) return;
              try {
                await opts.online!.api.deleteAccount();
                opts.online!.forgetLocalSession();
                toast('Profile deleted');
                setTimeout(() => location.reload(), 800);
              } catch (e) {
                toast((e as Error).message);
              }
            },
          },
          'Delete my data',
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
        h('span', { class: 'tag' }, 'Profile'),
        h('div', { class: 'muted' }, 'The demo’s alias, experience and statistics are kept only in this browser.'),
        h(
          'button',
          {
            class: 'btn btn--small btn--ghost',
            onclick: async () => {
              if (await confirmAsync('Reset the alias, experience and statistics in this browser?')) reset();
            },
          },
          'Reset local profile',
        ),
      ),
    );
  }
  return h('div', { class: 'col' }, ...items);
}
