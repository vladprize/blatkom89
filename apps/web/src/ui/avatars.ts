/**
 * Profile avatars: round portraits (assets/avatars/<id>.jpg, cut from the owner's sheet by
 * tools/crop-avatars.py) and the picker — a grid of all of them, PlayStation-style: tap one and it is
 * yours. Without an avatar the lobby shows the character's portrait; the player's own Dossier shows an
 * empty frame that invites them to choose.
 */
import { AVATAR_IDS } from '@blatkom/shared';
import type { AvatarId, CharacterId } from '@blatkom/shared';
import { h, asset, toast } from './dom.js';
import { t } from '../i18n/index.js';
import { avatarName } from '../i18n/content.js';
import { sfx } from '../game/audio/Sfx.js';

export function avatarSrc(id: AvatarId): string {
  return asset(`assets/avatars/${id}.jpg`);
}

/**
 * A round avatar. Without one: the character's portrait in the same circle when `character` is given
 * (other players in the lobby), otherwise an empty frame with «+» (the player's own Dossier).
 */
export function avatarImg(avatar: AvatarId | null | undefined, character: CharacterId | null, cls = ''): HTMLElement {
  if (avatar) return h('img', { class: `ava ${cls}`, src: avatarSrc(avatar), alt: avatarName(avatar), title: avatarName(avatar), draggable: 'false', width: 192, height: 192, 'data-avatar': avatar });
  if (character) return h('img', { class: `ava ava--char ${cls}`, src: asset(`assets/portraits/${character}_small.png`), alt: '', draggable: 'false' });
  return h('span', { class: `ava ava--empty ${cls}`, 'aria-hidden': 'true' }, '+');
}

/** The avatar as a button that opens the picker (Dossier tile, profile). */
export function avatarButton(avatar: AvatarId | null, onClick: () => void, cls = ''): HTMLElement {
  return h(
    'button',
    {
      class: `ava-btn ${cls}`,
      'aria-label': avatar ? `${t('Change avatar')}: ${avatarName(avatar)}` : t('Choose an avatar'),
      title: avatar ? t('Change avatar') : t('Choose an avatar'),
      'data-testid': 'avatar-button',
      onclick: (e: Event) => {
        e.stopPropagation();
        onClick();
      },
    },
    avatarImg(avatar, null),
  );
}

/** The picker. `onPick` saves the choice (it may throw: the dialog stays open with the error). */
export function openAvatarPicker(root: HTMLElement, o: { current: AvatarId | null; onPick: (id: AvatarId) => Promise<void> }): () => void {
  let busy = false;
  const error = h('div', { class: 'muted', role: 'alert', style: 'min-height:18px;font-size:14px;color:#e07a6a' });
  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    overlay.remove();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };
  const pick = async (id: AvatarId, btn: HTMLElement) => {
    if (busy) return;
    if (id === o.current) return close();
    busy = true;
    grid.classList.add('avapick--busy');
    btn.setAttribute('aria-busy', 'true');
    error.textContent = '';
    try {
      await o.onPick(id);
      sfx.play('buy');
      close();
      toast(t('Avatar saved'));
    } catch (e) {
      error.textContent = e instanceof Error && e.message ? e.message : t('Could not save — try again.');
      busy = false;
      grid.classList.remove('avapick--busy');
      btn.removeAttribute('aria-busy');
    }
  };
  const grid = h(
    'div',
    { class: 'avapick', role: 'radiogroup', 'aria-label': t('Choose an avatar') },
    ...AVATAR_IDS.map((id) => {
      const btn: HTMLElement = h(
        'button',
        { role: 'radio', 'aria-checked': String(id === o.current), 'aria-pressed': String(id === o.current), 'aria-label': avatarName(id), title: avatarName(id), 'data-avatar': id, onclick: () => void pick(id, btn) },
        avatarImg(id, null),
      );
      return btn;
    }),
  );
  const overlay: HTMLElement = h(
    'div',
    { class: 'overlay overlay--top overlay--scroll', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('Choose an avatar'), onclick: (e: Event) => e.target === overlay && close() },
    h(
      'div',
      { class: 'panel modal modal--wide col' },
      h('span', { class: 'tag' }, t('Personal file')),
      h('div', { class: 'h2', style: 'margin-top:8px' }, t('Choose an avatar')),
      h('div', { class: 'muted', style: 'font-size:15px' }, t('Others see it next to your alias in the rooms.')),
      grid,
      error,
      h('div', { class: 'row' }, h('button', { class: 'btn btn--small btn--ghost', onclick: close }, t('Cancel'))),
    ),
  );
  document.addEventListener('keydown', onKey, true);
  root.append(overlay);
  setTimeout(() => (grid.querySelector<HTMLElement>('[aria-checked="true"]') ?? grid.querySelector<HTMLElement>('button'))?.focus(), 50);
  return close;
}
