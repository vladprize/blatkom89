/**
 * «Sign in with …» (v0.3): one button per provider the server has set up — Google, Telegram, Discord,
 * Facebook, Reddit — in the welcome window and in the account panel. Plain labelled buttons (no brand
 * marks are drawn here); a tap leaves for the provider and comes back signed in, with the progress of the
 * guest account attached when the provider is new to the game.
 */
import { h, toast } from '../dom.js';
import { t } from '../../i18n/index.js';
import { apiErrorText } from '../../net/errors.js';
import type { OnlineClient } from '../../net/OnlineClient.js';
import { goToProvider, goToTelegram } from '../../net/oauth.js';
import type { LoginProvider, ProvidersInfo } from '../../net/oauth.js';

export const PROVIDER_NAME: Record<LoginProvider, string> = { google: 'Google', telegram: 'Telegram', discord: 'Discord', facebook: 'Facebook', reddit: 'Reddit' };
const ORDER: LoginProvider[] = ['google', 'telegram', 'discord', 'facebook', 'reddit'];

/** The buttons for the providers that are set up (an empty element when none is). `linked` ones show ✓. */
export function providerButtons(online: OnlineClient, info: ProvidersInfo | null, o: { linked?: ReadonlyArray<string>; testid?: string } = {}): HTMLElement {
  const box = h('div', { class: 'providers', 'data-testid': o.testid ?? 'providers' });
  if (!info) return box;
  const available = ORDER.filter((p) => (p === 'telegram' ? !!info.telegram : (info.providers as string[]).includes(p)));
  for (const p of available) {
    const done = o.linked?.includes(p) ?? false;
    box.append(
      h(
        'button',
        {
          class: `btn btn--small provider provider--${p}${done ? ' provider--done' : ''}`,
          'data-provider': p,
          disabled: done,
          onclick: () =>
            void (async () => {
              try {
                if (p === 'telegram') return goToTelegram(info.telegram!.botId);
                const { intent } = await online.api.oauthIntent();
                goToProvider(p, intent);
              } catch (e) {
                toast(apiErrorText(e));
              }
            })(),
        },
        done ? `✓ ${PROVIDER_NAME[p]}` : PROVIDER_NAME[p],
      ),
    );
  }
  return box;
}

/** Text for a sign-in that came back with an error (`?login_error=`). */
export function loginErrorText(reason: string): string {
  switch (reason) {
    case 'cancelled':
      return t('Sign-in cancelled');
    case 'already_linked':
      return t('This account already has another sign-in of that kind');
    case 'not_configured':
      return t('This sign-in isn’t set up on the server yet');
    case 'expired':
    case 'state':
      return t('The sign-in took too long — try again');
    default:
      return t('The sign-in didn’t work — try again');
  }
}
