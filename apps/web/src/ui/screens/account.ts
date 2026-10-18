/**
 * Account safety: attach an email + password to the current account (so purchases and progress
 * survive a new phone or a cleared browser), sign in by email on another device, change or reset
 * the password.
 */
import { h, toast } from '../dom.js';
import type { OnlineClient } from '../../net/OnlineClient.js';
import { ApiError } from '../../net/api.js';

const field = (type: string, placeholder: string, autocomplete: string, value = '') =>
  h('input', { class: 'input', type, placeholder, autocomplete, value, autocapitalize: 'off', spellcheck: 'false', 'aria-label': placeholder }) as HTMLInputElement;

const errText = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Не получилось');

/** Profile panel: link an email, or show the linked one with a password change. */
export function renderAccountPanel(online: OnlineClient, o: { root: HTMLElement; onChanged: () => void }): HTMLElement {
  const p = online.profile;
  const panel = h('div', { class: 'panel col' }, h('span', { class: 'tag' }, 'Аккаунт'));
  if (p?.email) {
    const cur = field('password', 'Текущий пароль', 'current-password');
    const next = field('password', 'Новый пароль (от 8 символов)', 'new-password');
    const form = h(
      'div',
      { class: 'col hidden' },
      cur,
      next,
      h(
        'button',
        {
          class: 'btn btn--small',
          onclick: async () => {
            try {
              await online.api.changePassword(cur.value, next.value);
              toast('Пароль изменён');
              form.classList.add('hidden');
            } catch (e) {
              toast(errText(e));
            }
          },
        },
        'Сохранить пароль',
      ),
    );
    panel.append(
      h('div', { style: 'margin-top:8px' }, 'Почта: ', h('b', null, p.email)),
      h('div', { class: 'muted' }, 'С этой почтой и паролем аккаунт открывается на любом устройстве — прогресс и покупки не потеряются.'),
      h('div', { class: 'row' }, h('button', { class: 'btn btn--small', onclick: () => form.classList.toggle('hidden') }, 'Сменить пароль'), h('button', { class: 'btn btn--small btn--ghost', onclick: () => openEmailLogin(o.root, online, { onDone: o.onChanged }) }, 'Войти в другой аккаунт')),
      form,
    );
    return panel;
  }
  const email = field('email', 'Почта', 'email');
  const pass = field('password', 'Пароль (от 8 символов)', 'new-password');
  const pass2 = field('password', 'Пароль ещё раз', 'new-password');
  panel.append(
    h('div', { style: 'margin-top:8px' }, 'Привяжите почту, чтобы не потерять аккаунт: без неё прогресс и покупки живут только в этом браузере.'),
    email,
    pass,
    pass2,
    h(
      'button',
      {
        class: 'btn btn--red',
        onclick: async () => {
          if (pass.value.length < 8) return toast('Пароль — минимум 8 символов');
          if (pass.value !== pass2.value) return toast('Пароли не совпадают');
          try {
            await online.linkEmail(email.value.trim(), pass.value);
            toast('Почта привязана');
            o.onChanged();
          } catch (e) {
            toast(errText(e));
          }
        },
      },
      'Привязать почту',
    ),
    h('button', { class: 'btn btn--small btn--ghost', onclick: () => openEmailLogin(o.root, online, { onDone: o.onChanged }) }, 'Уже есть аккаунт с почтой? Войти'),
  );
  return panel;
}

/** Sign-in dialog (another device / expired session). */
export function openEmailLogin(root: HTMLElement, online: OnlineClient, o: { email?: string; note?: string; onDone: () => void }): void {
  const ov = h('div', { class: 'overlay overlay--top' });
  const close = () => ov.remove();
  const email = field('email', 'Почта', 'email', o.email ?? '');
  const pass = field('password', 'Пароль', 'current-password');
  const submit = async () => {
    try {
      await online.loginEmail(email.value.trim(), pass.value);
      close();
      toast('Вы вошли в аккаунт');
      o.onDone();
    } catch (e) {
      toast(errText(e));
    }
  };
  pass.addEventListener('keydown', (e) => (e as KeyboardEvent).key === 'Enter' && void submit());
  ov.append(
    h(
      'div',
      { class: 'panel modal col' },
      h('span', { class: 'tag' }, 'Вход по почте'),
      h('div', { class: 'muted', style: 'margin-top:8px' }, o.note ?? 'Войдите в аккаунт, к которому привязана почта. Текущий гостевой профиль этого браузера останется на сервере.'),
      email,
      pass,
      h('button', { class: 'btn btn--red', onclick: () => void submit() }, 'Войти'),
      h(
        'button',
        {
          class: 'btn btn--small btn--ghost',
          onclick: async () => {
            const v = email.value.trim();
            if (!v) return toast('Введите почту');
            try {
              await online.api.resetRequest(v);
              toast('Если такой аккаунт есть — письмо со ссылкой уже в пути');
            } catch (e) {
              toast(errText(e));
            }
          },
        },
        'Забыли пароль?',
      ),
      h('button', { class: 'btn', onclick: close }, 'Отмена'),
    ),
  );
  root.append(ov);
  setTimeout(() => (o.email ? pass : email).focus(), 50);
}

/** Password reset from the emailed link (?reset=…). */
export function openPasswordReset(root: HTMLElement, online: OnlineClient, token: string, onDone: () => void): void {
  const ov = h('div', { class: 'overlay overlay--top' });
  const close = () => ov.remove();
  const pass = field('password', 'Новый пароль (от 8 символов)', 'new-password');
  const pass2 = field('password', 'Ещё раз', 'new-password');
  ov.append(
    h(
      'div',
      { class: 'panel modal col' },
      h('span', { class: 'tag' }, 'Новый пароль'),
      pass,
      pass2,
      h(
        'button',
        {
          class: 'btn btn--red',
          onclick: async () => {
            if (pass.value.length < 8) return toast('Пароль — минимум 8 символов');
            if (pass.value !== pass2.value) return toast('Пароли не совпадают');
            try {
              await online.api.resetConfirm(token, pass.value);
              close();
              toast('Пароль сохранён — войдите с ним');
              onDone();
            } catch (e) {
              toast(errText(e));
            }
          },
        },
        'Сохранить',
      ),
      h('button', { class: 'btn', onclick: close }, 'Отмена'),
    ),
  );
  root.append(ov);
}
