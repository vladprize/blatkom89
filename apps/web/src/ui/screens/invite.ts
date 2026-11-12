/**
 * Invite friends (V2.0; v0.2.18: an invitation that counts pays talons — the $BLAT screen is gone with the
 * whole crypto theme): the player's link with Copy / Share, how many came, counted, wait, are checked,
 * the talons earned, and the latest invitations.
 */
import type { ReferralResponse } from '@blatkom/shared';
import { h, toast } from '../dom.js';
import { t } from '../../i18n/index.js';
import { shareInvite } from '../../telegram/tg.js';
import { amount } from './shop.js';

const STATUS: Record<ReferralResponse['recent'][number]['status'], () => string> = {
  pending: () => t('waiting for their first match'),
  confirmed: () => t('counted'),
  held: () => t('being checked'),
  rejected: () => t('not counted'),
};

export function renderInvite(r: ReferralResponse): HTMLElement {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(r.link);
      toast(t('Link copied'));
    } catch {
      toast(r.link);
    }
  };
  const share = () => {
    if (!shareInvite(r.link, t('Come to BLATKOM ’89 — district business is serious business.'))) void copy();
  };
  return h(
    'div',
    { class: 'col invite fitcol', 'data-testid': 'invite' },
    h(
      'div',
      { class: 'panel col invite__main', 'data-testid': 'invite-referral' },
      h('span', { class: 'tag' }, t('Invite friends')),
      // v0.2.25: BLATS for a friend's first matches, on top of the talons
      r.blats ? h('div', { class: 'invite__offer invite__offer--blats', 'data-testid': 'invite-blats' }, h('b', null, amount(r.blats.amount, 'diamonds'), ` ${t('BLATS')}`), ' ', t('for every friend who plays {m} whole online matches.', { m: r.blats.matches })) : null,
      h('div', { class: 'invite__offer' }, t('For every friend who comes through your link and plays a whole online match:'), ' ', h('b', { class: 'invite__reward', 'data-testid': 'invite-reward' }, amount(r.reward, 'tokens'), ` ${t('talons')}`)),
      h('div', { class: 'invite__link' }, h('input', { class: 'input', readonly: true, value: r.link, 'aria-label': t('Your link'), 'data-testid': 'invite-link', onfocus: (e: Event) => (e.target as HTMLInputElement).select() })),
      h(
        'div',
        { class: 'row invite__actions' },
        h('button', { class: 'btn btn--red btn--small', 'data-testid': 'invite-copy', onclick: () => void copy() }, t('Copy')),
        h('button', { class: 'btn btn--small', 'data-testid': 'invite-share', onclick: share }, t('Share')),
      ),
      h(
        'div',
        { class: 'invstats' },
        ...[
          [t('invited'), r.invited, 'invite-invited'],
          [t('counted'), r.confirmed, 'invite-confirmed'],
          [t('waiting'), r.pending, 'invite-pending'],
          [t('being checked'), r.held, 'invite-held'],
        ].map(([label, n, id]) => h('span', { class: 'invstats__item', 'data-testid': String(id) }, h('b', null, String(n)), h('small', null, String(label)))),
      ),
      h('div', { 'data-testid': 'invite-earned' }, t('Earned for invitations: {n} talons.', { n: r.earned }), r.blats ? ` ${t('BLATS: {n}.', { n: r.blats.earned })}` : ''),
      r.blats ? h('div', { class: 'muted', 'data-testid': 'invite-blats-limit' }, t('Up to {n} friends a month pay BLATS · this month: {k}', { n: r.blats.monthlyCap, k: r.blats.thisMonth })) : null,
      h('div', { class: 'muted' }, t('A friend counts when they open the game through your link, get an account and play a whole online match. Players who already had an account don’t count.')),
    ),
    h(
      'div',
      { class: 'panel col invite__recent' },
      h('span', { class: 'tag' }, t('Your invitations')),
      r.recent.length
        ? h(
            'div',
            { class: 'invrecent', 'data-testid': 'invite-recent' },
            ...r.recent.map((x) =>
              h(
                'div',
                { class: 'invrecent__row', 'data-status': x.status },
                h('b', null, x.name),
                h('span', { class: 'muted' }, STATUS[x.status]()),
                x.reward > 0 ? amount(x.reward, 'tokens') : null,
                // v0.2.25: the BLATS part — paid, or the friend's matches so far
                r.blats && x.blatsStatus === 'paid' && x.blats ? amount(x.blats, 'diamonds') : null,
                r.blats && x.blatsStatus === 'pending' && x.status !== 'rejected' ? h('span', { class: 'invrecent__progress', 'data-testid': 'invite-progress' }, t('{k} of {m} matches', { k: Math.min(x.matches ?? 0, r.blats.matches), m: r.blats.matches })) : null,
                r.blats && x.blatsStatus === 'capped' ? h('span', { class: 'muted' }, t('over the month’s limit')) : null,
              ),
            ),
          )
        : h('div', { class: 'muted' }, t('Nobody yet — send your link to a friend.')),
    ),
  );
}
