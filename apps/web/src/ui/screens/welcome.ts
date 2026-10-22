/**
 * The welcome window of a guest: as the game opens in a browser, it offers to register an email so
 * that the level, talons, diamonds and everything bought survive a new phone or a cleared browser —
 * or to sign in to an account that already has one — or to carry on as a guest (asked again a day
 * later). Inside Telegram the account is the Telegram account, so nothing is asked there.
 */
import { REAL_MONEY } from '@blatkom/shared';
import type { OnlineClient } from '../../net/OnlineClient.js';
import { h, toast } from '../dom.js';
import { t } from '../../i18n/index.js';
import { apiErrorText } from '../../net/errors.js';
import { storageGet, storageSet } from '../../app/settings.js';
import { openEmailLogin } from './account.js';
import { providerButtons } from './signin.js';

/** When the player last chose «continue as guest» (ms since epoch). */
export const WELCOME_KEY = 'blatkom89.welcome.v1';
const ASK_AGAIN_MS = 24 * 3600_000;

export type WelcomeOutcome = 'linked' | 'signed_in' | 'guest';

/** A guest account in a browser that hasn't been asked today. */
export function needsWelcome(online: OnlineClient, inTelegram: boolean): boolean {
  const p = online.profile;
  if (!p || inTelegram || p.email || p.telegramLinked || (p.identities?.length ?? 0) > 0) return false;
  const later = Number(storageGet(WELCOME_KEY) ?? 0);
  return !(later > 0 && Date.now() - later < ASK_AGAIN_MS);
}

const field = (type: string, placeholder: string, autocomplete: string, testid: string) =>
  h('input', { class: 'input', type, placeholder, autocomplete, autocapitalize: 'off', spellcheck: 'false', 'aria-label': placeholder, 'data-testid': testid }) as HTMLInputElement;

export function openWelcome(root: HTMLElement, online: OnlineClient, onDone: (o: WelcomeOutcome) => void): () => void {
  let closed = false;
  const close = (outcome: WelcomeOutcome) => {
    if (closed) return;
    closed = true;
    ov.remove();
    onDone(outcome);
  };
  const email = field('email', t('Email'), 'email', 'welcome-email');
  const pass = field('password', t('Password (8+ characters)'), 'new-password', 'welcome-password');
  const pass2 = field('password', t('Password again'), 'new-password', 'welcome-password2');
  const register = async () => {
    if (!email.value.trim()) return toast(t('Enter your email'));
    if (pass.value.length < 8) return toast(t('Password: 8 characters minimum'));
    if (pass.value !== pass2.value) return toast(t('Passwords don’t match'));
    btn.setAttribute('disabled', '');
    try {
      await online.linkEmail(email.value.trim(), pass.value);
      const tied = online.profile?.email ?? email.value.trim();
      toast(REAL_MONEY ? t('Account created — progress and purchases are tied to {email}', { email: tied }) : t('Account created — your progress is tied to {email}', { email: tied }));
      close('linked');
    } catch (e) {
      toast(apiErrorText(e));
    } finally {
      btn.removeAttribute('disabled');
    }
  };
  pass2.addEventListener('keydown', (e) => (e as KeyboardEvent).key === 'Enter' && void register());
  const btn = h('button', { class: 'btn btn--red', 'data-testid': 'welcome-register', onclick: () => void register() }, t('Create an account'));
  // v0.3: one tap with a provider (the guest's progress is attached to it); shown once the server says which are set up
  const quick = h('div', { class: 'col welcome__providers', hidden: true });
  const intro = h(
    'div',
    { class: 'muted' },
    REAL_MONEY
      ? t('Register an email: your level, talons, diamonds and everything you buy stay with you on any device. As a guest, the account lives only in this browser.')
      : t('Register an email: your level, talons and everything you unlock stay with you on any device. As a guest, the account lives only in this browser.'),
  );
  void online.providers().then((info) => {
    const buttons = providerButtons(online, info, { testid: 'welcome-providers' });
    if (!buttons.childElementCount) return;
    quick.append(h('div', { class: 'muted welcome__or' }, t('In one tap with')), buttons, h('div', { class: 'muted welcome__or' }, t('or with an email')));
    quick.hidden = false;
    if (!REAL_MONEY) intro.textContent = t('Sign in with one tap or register an email: your level, talons and everything you unlock stay with you on any device. As a guest, the account lives only in this browser.');
  });
  const ov = h(
    'div',
    { class: 'overlay overlay--top', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('Keep your progress'), 'data-testid': 'welcome' },
    h(
      'div',
      { class: 'panel modal col welcome' },
      h('span', { class: 'tag' }, t('Account')),
      h('div', { class: 'h2', style: 'margin-top:8px' }, t('Keep your progress')),
      intro,
      quick,
      email,
      pass,
      pass2,
      btn,
      h(
        'button',
        {
          class: 'btn',
          'data-testid': 'welcome-login',
          onclick: () =>
            openEmailLogin(root, online, {
              onDone: () => close('signed_in'),
            }),
        },
        t('I already have an account — sign in'),
      ),
      h(
        'button',
        {
          class: 'btn btn--ghost',
          'data-testid': 'welcome-guest',
          onclick: () => {
            storageSet(WELCOME_KEY, String(Date.now()));
            close('guest');
          },
        },
        t('Continue as guest'),
      ),
    ),
  );
  root.append(ov);
  setTimeout(() => email.focus(), 60);
  return () => close('guest');
}
