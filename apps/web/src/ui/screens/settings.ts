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
    h('span', { class: 'tag' }, 'Изображение'),
    seg('VHS-эффект (зерно, полосы, виньетка)', [
      [0, 'Выкл'],
      [1, 'Слабый'],
      [2, 'Сильный'],
    ], 'vhs'),
    seg('Тряска камеры', [
      [true, 'Вкл'],
      [false, 'Выкл'],
    ], 'shake'),
    seg('Счётчик FPS', [
      [false, 'Скрыт'],
      [true, 'Показать'],
    ], 'showFps'),
  );
  const sound = h('div', { class: 'panel col' }, h('span', { class: 'tag' }, 'Звук'), slider('Громкость эффектов', 'sfxVolume', 0, 1, 0.05));
  const controls = h(
    'div',
    { class: 'panel col' },
    h('span', { class: 'tag' }, 'Управление'),
    seg('Огонь правым стиком при полном отклонении', [
      [true, 'Вкл'],
      [false, 'Только кнопка'],
    ], 'autoFire'),
    seg('Левша (стики поменять местами)', [
      [false, 'Нет'],
      [true, 'Да'],
    ], 'leftHanded'),
    slider('Размер стиков', 'stickScale', 0.7, 1.4, 0.05),
    h('div', { class: 'muted', style: 'font-size:14px' }, 'Компьютер: WASD — движение, мышь — прицел, ЛКМ — огонь, R — перезарядка, Q/колесо/1-3 — оружие, E — подобрать, Shift — шагом, Tab — счёт, Esc — меню.'),
  );
  const items: HTMLElement[] = [graphics, sound, controls];
  if (opts.online && !opts.inGame) {
    const input = h('input', { class: 'input', value: opts.online.profile?.displayName ?? '', maxlength: '24', 'aria-label': 'Имя в игре' }) as HTMLInputElement;
    items.push(
      h(
        'div',
        { class: 'panel col' },
        h('span', { class: 'tag' }, 'Профиль'),
        h('div', { class: 'muted' }, 'Имя в игре'),
        input,
        h(
          'button',
          {
            class: 'btn btn--small',
            onclick: async () => {
              const parsed = displayNameSchema.safeParse(input.value);
              if (!parsed.success) return toast(parsed.error.issues[0]?.message ?? 'Неверное имя');
              try {
                await opts.online!.rename(parsed.data);
                toast('Имя сохранено');
              } catch (e) {
                toast((e as Error).message);
              }
            },
          },
          'Сохранить имя',
        ),
        h(
          'button',
          {
            class: 'btn btn--small btn--ghost',
            onclick: async () => {
              if (!(await confirmAsync('Удалить профиль и всю статистику без возможности восстановления?'))) return;
              try {
                await opts.online!.api.deleteAccount();
                opts.online!.forgetLocalSession();
                toast('Профиль удалён');
                setTimeout(() => location.reload(), 800);
              } catch (e) {
                toast((e as Error).message);
              }
            },
          },
          'Удалить мои данные',
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
        h('span', { class: 'tag' }, 'Профиль'),
        h('div', { class: 'muted' }, 'Кличка, опыт и статистика демо-версии хранятся только в этом браузере.'),
        h(
          'button',
          {
            class: 'btn btn--small btn--ghost',
            onclick: async () => {
              if (await confirmAsync('Сбросить кличку, опыт и статистику в этом браузере?')) reset();
            },
          },
          'Сбросить локальный профиль',
        ),
      ),
    );
  }
  return h('div', { class: 'col' }, ...items);
}
