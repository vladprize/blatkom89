/**
 * v0.2.20 (the owner: «Введи промо код на кристаллы — BLATNOY»): the promo code field of the Arsenal's
 * BLATS tab. The server spells the code out (any case, Russian letters) and pays it once per account.
 */
import { h, toast } from './dom.js';
import type { OnlineClient } from '../net/OnlineClient.js';
import { apiErrorText } from '../net/errors.js';
import { sfx } from '../game/audio/Sfx.js';
import { haptic } from '../telegram/tg.js';
import { t } from '../i18n/index.js';
import { fmtNum } from './coin.js';

/** «Have a promo code? [______] [Activate]» — `onPaid` gets the new balance. */
export function promoForm(online: OnlineClient, onPaid: (balance: number) => void): HTMLElement {
  const input = h('input', {
    class: 'input promo__input',
    type: 'text',
    placeholder: t('Promo code'),
    autocomplete: 'off',
    autocapitalize: 'characters',
    spellcheck: 'false',
    maxlength: '32',
    enterkeyhint: 'done',
    'aria-label': t('Promo code'),
    'data-testid': 'promo-input',
  }) as HTMLInputElement;
  const go = async () => {
    const code = input.value.trim();
    if (!code) return toast(t('Enter a promo code'));
    btn.setAttribute('disabled', '');
    try {
      const r = await online.redeemPromo(code);
      input.value = '';
      sfx.play('buy');
      haptic('notify-success');
      toast(t('Promo code {code}: +{n} BLATS', { code: r.code, n: fmtNum(r.diamonds) }));
      onPaid(r.balance);
    } catch (e) {
      haptic('notify-error');
      toast(apiErrorText(e));
    } finally {
      btn.removeAttribute('disabled');
    }
  };
  const btn = h('button', { class: 'btn btn--small btn--red', 'data-testid': 'promo-apply', onclick: () => void go() }, t('Activate'));
  input.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') void go();
  });
  return h('div', { class: 'promo', 'data-testid': 'promo' }, h('span', { class: 'promo__label' }, t('Have a promo code?')), h('div', { class: 'promo__row' }, input, btn));
}
