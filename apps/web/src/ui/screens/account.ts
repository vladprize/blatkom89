/**
 * Account safety: attach an email + password to the current account (so purchases and progress
 * survive a new phone or a cleared browser), sign in by email on another device, change or reset
 * the password.
 */
import { REAL_MONEY } from '@blatkom/shared';
import { h, toast } from '../dom.js';
import type { OnlineClient } from '../../net/OnlineClient.js';
import { t } from '../../i18n/index.js';
import { apiErrorText } from '../../net/errors.js';

const field = (type: string, placeholder: string, autocomplete: string, value = '') =>
  h('input', { class: 'input', type, placeholder, autocomplete, value, autocapitalize: 'off', spellcheck: 'false', 'aria-label': placeholder }) as HTMLInputElement;

const errText = (e: unknown) => (e instanceof Error ? apiErrorText(e) : t('Didn’t work out, comrade'));

/** Profile panel: link an email, or show the linked one with a password change. */
export function renderAccountPanel(online: OnlineClient, o: { root: HTMLElement; onChanged: () => void }): HTMLElement {
  const p = online.profile;
  const panel = h('div', { class: 'panel col' }, h('span', { class: 'tag' }, t('Account')));
  if (p?.email) {
    const cur = field('password', t('Current password'), 'current-password');
    const next = field('password', t('New password (8+ characters)'), 'new-password');
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
              toast(t('Password changed'));
              form.classList.add('hidden');
            } catch (e) {
              toast(errText(e));
            }
          },
        },
        t('Save password'),
      ),
    );
    panel.append(
      h('div', { style: 'margin-top:8px' }, t('Email:'), ' ', h('b', null, p.email)),
      h('div', { class: 'muted' }, REAL_MONEY ? t('With this email and password the account opens on any device — progress and purchases stay on the books.') : t('With this email and password the account opens on any device — your progress stays on the books.')),
      h('div', { class: 'row' }, h('button', { class: 'btn btn--small', onclick: () => form.classList.toggle('hidden') }, t('Change password')), h('button', { class: 'btn btn--small btn--ghost', onclick: () => openEmailLogin(o.root, online, { onDone: o.onChanged }) }, t('Sign in to another account'))),
      form,
    );
    return panel;
  }
  const email = field('email', t('Email'), 'email');
  const pass = field('password', t('Password (8+ characters)'), 'new-password');
  const pass2 = field('password', t('Password again'), 'new-password');
  panel.append(
    h('div', { style: 'margin-top:8px' }, REAL_MONEY ? t('Register an email so the account doesn’t go missing: without it, progress and purchases live only in this browser.') : t('Register an email so the account doesn’t go missing: without it, your progress lives only in this browser.')),
    email,
    pass,
    pass2,
    h(
      'button',
      {
        class: 'btn btn--red',
        onclick: async () => {
          if (pass.value.length < 8) return toast(t('Password: 8 characters minimum'));
          if (pass.value !== pass2.value) return toast(t('Passwords don’t match'));
          try {
            await online.linkEmail(email.value.trim(), pass.value);
            toast(t('Email registered'));
            o.onChanged();
          } catch (e) {
            toast(errText(e));
          }
        },
      },
      t('Register email'),
    ),
    h('button', { class: 'btn btn--small btn--ghost', onclick: () => openEmailLogin(o.root, online, { onDone: o.onChanged }) }, t('Already have an account with email? Sign in')),
  );
  return panel;
}

/** Sign-in dialog (another device / expired session). */
export function openEmailLogin(root: HTMLElement, online: OnlineClient, o: { email?: string; note?: string; onDone: () => void }): void {
  const ov = h('div', { class: 'overlay overlay--top' });
  const close = () => ov.remove();
  const email = field('email', t('Email'), 'email', o.email ?? '');
  const pass = field('password', t('Password'), 'current-password');
  const submit = async () => {
    try {
      await online.loginEmail(email.value.trim(), pass.value);
      close();
      toast(t('Signed in'));
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
      h('span', { class: 'tag' }, t('Sign in by email')),
      h('div', { class: 'muted', style: 'margin-top:8px' }, o.note ?? t('Sign in to the account your email is registered to. This browser’s guest profile stays on the server.')),
      email,
      pass,
      h('button', { class: 'btn btn--red', onclick: () => void submit() }, t('Sign in')),
      h(
        'button',
        {
          class: 'btn btn--small btn--ghost',
          onclick: async () => {
            const v = email.value.trim();
            if (!v) return toast(t('Enter your email'));
            try {
              await online.api.resetRequest(v);
              toast(t('If such an account exists, a letter with a link is already in the post'));
            } catch (e) {
              toast(errText(e));
            }
          },
        },
        t('Forgot password?'),
      ),
      h('button', { class: 'btn', onclick: close }, t('Cancel')),
    ),
  );
  root.append(ov);
  setTimeout(() => (o.email ? pass : email).focus(), 50);
}

/** Password reset from the emailed link (?reset=…). */
export function openPasswordReset(root: HTMLElement, online: OnlineClient, token: string, onDone: () => void): void {
  const ov = h('div', { class: 'overlay overlay--top' });
  const close = () => ov.remove();
  const pass = field('password', t('New password (8+ characters)'), 'new-password');
  const pass2 = field('password', t('Once more'), 'new-password');
  ov.append(
    h(
      'div',
      { class: 'panel modal col' },
      h('span', { class: 'tag' }, t('New password')),
      pass,
      pass2,
      h(
        'button',
        {
          class: 'btn btn--red',
          onclick: async () => {
            if (pass.value.length < 8) return toast(t('Password: 8 characters minimum'));
            if (pass.value !== pass2.value) return toast(t('Passwords don’t match'));
            try {
              await online.api.resetConfirm(token, pass.value);
              close();
              toast(t('Password saved — sign in with it'));
              onDone();
            } catch (e) {
              toast(errText(e));
            }
          },
        },
        t('Save'),
      ),
      h('button', { class: 'btn', onclick: close }, t('Cancel')),
    ),
  );
  root.append(ov);
}
