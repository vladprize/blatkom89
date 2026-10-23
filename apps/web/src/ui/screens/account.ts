/**
 * Account safety: attach an email + password to the current account (so purchases and progress
 * survive a new phone or a cleared browser), sign in by email on another device, change or reset
 * the password. V2.0 part E: attach Telegram to this account through the bot (on the website), and an
 * email sign-in inside Telegram attaches that Telegram account to the email's account.
 */
import { REAL_MONEY } from '@blatkom/shared';
import type { TelegramLinkOutcome } from '@blatkom/shared';
import { h, toast } from '../dom.js';
import type { OnlineClient } from '../../net/OnlineClient.js';
import { t } from '../../i18n/index.js';
import { apiErrorText } from '../../net/errors.js';
import { PROVIDER_NAME, providerButtons } from './signin.js';
import type { LoginProvider } from '../../net/oauth.js';
import { inTelegram } from '../../telegram/tg.js';

/** V2.0 part E: what the player is told after Telegram was (or wasn't) attached. */
export function telegramLinkText(o: TelegramLinkOutcome, via: 'code' | 'email'): string {
  switch (o) {
    case 'linked':
      return via === 'email' ? t('Signed in — from now on Telegram opens this account') : t('Telegram is linked — your progress from the website is here');
    case 'already':
      return via === 'email' ? t('Signed in') : t('Telegram is already linked to this account');
    case 'conflict':
      return via === 'email' ? t('Signed in. This Telegram has progress of its own, so Telegram keeps opening that account') : t('This Telegram has progress of its own — it stays a separate account, nothing was linked');
    case 'expired':
      return t('The linking link has run out — ask for a new one on the website: Profile → Link Telegram');
    default:
      return t('The linking link was already used or is wrong — ask for a new one on the website');
  }
}

/** How long the website waits for the player to press the bot's button (the code's life). */
const LINK_WAIT_MS = 10 * 60_000;

/**
 * V2.0 part E (the website): attach Telegram to this account — the bot's one-time link; the game in
 * Telegram then opens this very account. The block waits for Telegram and says when it is done.
 */
function telegramLinkBlock(online: OnlineClient, o: { onChanged: () => void }): HTMLElement {
  const box = h('div', { class: 'col tglink', hidden: true, 'data-testid': 'account-tglink' });
  const p = online.profile;
  if (!p || p.telegramLinked || inTelegram()) return box;
  void online.providers().then((info) => {
    if (!info?.telegramLink) return;
    const start = h('button', { class: 'btn btn--small', 'data-testid': 'account-tglink-start' }, t('Link Telegram'));
    const body = h('div', { class: 'col tglink__body' }, h('div', { class: 'muted' }, t('Play in Telegram too? Link it: the game in Telegram opens this same account, with all your progress — no second profile.')), start);
    start.onclick = async () => {
      start.setAttribute('disabled', '');
      try {
        const r = await online.api.telegramLinkCode();
        const wait = h('div', { class: 'muted tglink__wait', 'data-testid': 'account-tglink-wait' }, t('Waiting for Telegram…'));
        body.replaceChildren(
          h('div', { class: 'muted' }, t('Open the bot and press «Start», then «Link and play». The link works once, for 10 minutes.')),
          h('a', { class: 'btn btn--small btn--red', href: r.url, target: '_blank', rel: 'noopener', 'data-testid': 'account-tglink-open' }, t('Open Telegram')),
          wait,
        );
        // the bot's button opens the game in Telegram; this page notices once the account has Telegram
        const until = Math.min(Date.parse(r.expiresAt), Date.now() + LINK_WAIT_MS);
        const poll = window.setInterval(async () => {
          if (!box.isConnected || Date.now() > until) {
            window.clearInterval(poll);
            if (box.isConnected) wait.textContent = t('The link has run out — press «Link Telegram» again.');
            return;
          }
          try {
            const me = await online.refreshProfile();
            if (!me.telegramLinked) return;
            window.clearInterval(poll);
            toast(t('Telegram is linked — the game in Telegram opens this account'));
            o.onChanged();
          } catch {
            /* the next tick tries again */
          }
        }, 4000);
      } catch (e) {
        start.removeAttribute('disabled');
        toast(errText(e));
      }
    };
    box.append(body);
    box.hidden = false;
  });
  return box;
}

const field = (type: string, placeholder: string, autocomplete: string, value = '') =>
  h('input', { class: 'input', type, placeholder, autocomplete, value, autocapitalize: 'off', spellcheck: 'false', 'aria-label': placeholder }) as HTMLInputElement;

const errText = (e: unknown) => (e instanceof Error ? apiErrorText(e) : t('Didn’t work out, comrade'));

/** v0.3: the providers the account signs in with (✓) and buttons for the others. */
function providersBlock(online: OnlineClient): HTMLElement {
  const p = online.profile;
  const linked = [...(p?.identities ?? []), ...(p?.telegramLinked ? ['telegram'] : [])];
  const box = h('div', { class: 'col', hidden: true, style: 'margin-top:8px', 'data-testid': 'account-providers' });
  // V2.0 part E: inside the Mini App the account is the Telegram account, and a provider's page can't
  // open in Telegram's window — these are for the website
  if (inTelegram()) return box;
  void online.providers().then((info) => {
    const buttons = providerButtons(online, info, { linked, testid: 'account-provider-buttons' });
    if (!buttons.childElementCount) return;
    buttons.classList.add('providers--start');
    const names = linked.map((x) => PROVIDER_NAME[x as LoginProvider] ?? x).join(', ');
    box.append(h('div', { class: 'muted' }, names ? t('Signs in with: {list}. Add another way:', { list: names }) : t('Sign in with one tap — your progress stays with this account:')), buttons);
    box.hidden = false;
  });
  return box;
}

/** Profile panel: link an email, or show the linked one with a password change. */
export function renderAccountPanel(online: OnlineClient, o: { root: HTMLElement; onChanged: () => void }): HTMLElement {
  const p = online.profile;
  const panel = h('div', { class: 'panel col' }, h('span', { class: 'tag' }, t('Account')), providersBlock(online), telegramLinkBlock(online, o));
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
  // with Google, Telegram… attached the account is already safe: the email is just one more way in
  const safe = (p?.identities?.length ?? 0) > 0 || !!p?.telegramLinked;
  panel.append(
    h(
      'div',
      { style: 'margin-top:8px' },
      safe
        ? t('An email and a password: one more way into this account, on any device.')
        : REAL_MONEY
          ? t('Register an email so the account doesn’t go missing: without it, progress and purchases live only in this browser.')
          : t('Register an email so the account doesn’t go missing: without it, your progress lives only in this browser.'),
    ),
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
      // V2.0 part E: inside Telegram the sign-in also attaches this Telegram account
      const link = online.takeTelegramLinkOutcome();
      toast(link ? telegramLinkText(link, 'email') : t('Signed in'));
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
      h(
        'div',
        { class: 'muted', style: 'margin-top:8px' },
        o.note ??
          (inTelegram()
            ? t('Sign in to the account your email is registered to. If this Telegram profile has no progress yet, Telegram opens that account from now on.')
            : t('Sign in to the account your email is registered to. This browser’s guest profile stays on the server.')),
      ),
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
