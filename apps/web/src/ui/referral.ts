/**
 * v0.2.25 (the owner: «в разделе алмазов — реферальная программа: алмазы за приглашение друзей по уникальной
 * ссылке, и это надо где-то отобразить»): «Приводи братву» — the player's own link with Copy / Share, what a
 * friend brings (BLATS once they have played their matches, talons after the first one) and the month's limit;
 * «More» opens the invitations screen with every friend's progress. The numbers are the server's.
 */
import { REFERRAL_BLATS, REFERRAL_TALONS } from '@blatkom/shared';
import type { ReferralResponse } from '@blatkom/shared';
import { h, toast } from './dom.js';
import { t } from '../i18n/index.js';
import { shareInvite } from '../telegram/tg.js';
import { blatsCoin } from './coin.js';
import type { OnlineClient } from '../net/OnlineClient.js';

/** What the program pays (the server's numbers once read, the defaults until then). */
export function referralOffer(r: ReferralResponse | null): string {
  const b = r?.blats ?? REFERRAL_BLATS;
  return t('+{blats} BLATS for every friend who plays {m} matches — and +{talons} talons after their first.', { blats: b.amount, m: b.matches, talons: r?.reward ?? REFERRAL_TALONS });
}

/** The link, copied (or shown where the clipboard is shut). */
export async function copyLink(link: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(link);
    toast(t('Link copied'));
  } catch {
    toast(link);
  }
}

export function shareLink(link: string): void {
  if (!shareInvite(link, t('Come to BLATKOM ’89 — district business is serious business.'))) void copyLink(link);
}

/** The card: «Приводи братву» with the link and its buttons (`onMore`: the invitations screen). */
export function referralCard(online: OnlineClient, o: { onMore?: () => void; compact?: boolean } = {}): HTMLElement {
  let data: ReferralResponse | null = null;
  const offer = h('div', { class: 'refcard__offer', 'data-testid': 'ref-offer' }, referralOffer(null));
  const limit = h('div', { class: 'refcard__limit muted' });
  const link = h('input', { class: 'input refcard__link', readonly: true, value: '…', 'aria-label': t('Your link'), 'data-testid': 'ref-link', onfocus: (e: Event) => (e.target as HTMLInputElement).select() }) as HTMLInputElement;
  const copy = h('button', { class: 'btn btn--red btn--small', 'data-testid': 'ref-copy', disabled: true, onclick: () => data && void copyLink(data.link) }, t('Copy'));
  const share = h('button', { class: 'btn btn--small', 'data-testid': 'ref-share', disabled: true, onclick: () => data && shareLink(data.link) }, t('Share'));
  const more = o.onMore ? h('button', { class: 'btn btn--small btn--ghost', 'data-testid': 'ref-more', onclick: o.onMore }, `${t('Your friends')} ›`) : null;
  const el = h(
    'div',
    { class: `panel col refcard ${o.compact ? 'refcard--compact' : ''}`, 'data-testid': 'ref-card' },
    h('span', { class: 'tag refcard__tag' }, t('Bring your crew')),
    h('div', { class: 'refcard__head' }, h('span', { class: 'refcard__coin', 'aria-hidden': 'true' }, blatsCoin(o.compact ? 28 : 36, '')), h('div', { class: 'col refcard__txt' }, offer, limit)),
    h('div', { class: 'refcard__row' }, link, copy, share, more),
  );
  void online.api
    .referrals()
    .then((r) => {
      data = r;
      offer.textContent = referralOffer(r);
      limit.textContent = r.blats ? t('Up to {n} friends a month pay BLATS · this month: {k}', { n: r.blats.monthlyCap, k: r.blats.thisMonth }) : '';
      link.value = r.link;
      copy.disabled = false;
      share.disabled = false;
    })
    .catch(() => {
      link.value = t('Could not load the link — try again later');
    });
  return el;
}

/**
 * The strip at the top of the BLATS tab: «Приводи братву — +50 БЛАТ за каждого друга» and «Позвать ›» (the
 * invitations screen, with the link and every friend's progress).
 */
export function referralStrip(o: { onOpen: () => void; blats?: number }): HTMLElement {
  const n = o.blats ?? REFERRAL_BLATS.amount;
  return h(
    'button',
    { class: 'refstrip', type: 'button', 'data-testid': 'ref-strip', onclick: o.onOpen },
    h('span', { class: 'refstrip__coin', 'aria-hidden': 'true' }, blatsCoin(26, '')),
    h('span', { class: 'refstrip__txt' }, h('b', null, t('Bring your crew')), h('span', null, t('+{n} BLATS for every friend', { n }))),
    h('span', { class: 'refstrip__go' }, `${t('Invite')} ›`),
  );
}

