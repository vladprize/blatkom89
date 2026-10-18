/**
 * Nickname helpers: district-style random suggestions and the «What do they call you round here?» dialog
 * (first launch, and «✎» in the menu/profile). Validation is the shared `displayNameSchema`,
 * the same one the server applies to PATCH /api/me.
 */
import { displayNameSchema } from '@blatkom/shared';
import { h, toast } from '../ui/dom.js';
import { sfx } from '../game/audio/Sfx.js';
import { randomNickname } from './nickname-words.js';

export { randomNickname };

export interface NicknameDialogOptions {
  /** Prefilled value (current name or a suggestion). */
  initial: string;
  title?: string;
  note?: string;
  /** Saves the validated name; throw to keep the dialog open (the message is shown as a toast). */
  onSave: (name: string) => Promise<void> | void;
  /** Without onCancel the dialog can only be closed by saving. */
  onCancel?: () => void;
  cancelLabel?: string;
  /** Called once when the dialog goes away (saved or cancelled). */
  onClose?: () => void;
}

/** Opens the nickname dialog on top of `root`; returns a function that closes it. */
export function openNicknameDialog(root: HTMLElement, o: NicknameDialogOptions): () => void {
  const input = h('input', { class: 'input input--big', value: o.initial, maxlength: '24', autocomplete: 'off', autocapitalize: 'words', spellcheck: 'false', 'aria-label': 'Alias' }) as HTMLInputElement;
  const error = h('div', { class: 'muted', style: 'min-height:18px;font-size:14px;color:#e07a6a' });
  let busy = false;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    o.onClose?.();
  };
  const save = async () => {
    if (busy) return;
    const parsed = displayNameSchema.safeParse(input.value);
    if (!parsed.success) {
      error.textContent = input.value.trim().length < 2 ? 'At least 2 characters.' : (parsed.error.issues[0]?.message ?? 'That alias won’t do.');
      input.focus();
      return;
    }
    busy = true;
    saveBtn.setAttribute('disabled', '');
    try {
      await o.onSave(parsed.data);
      sfx.play('click');
      close();
    } catch (e) {
      toast((e as Error).message || 'Couldn’t save it');
    } finally {
      busy = false;
      saveBtn.removeAttribute('disabled');
    }
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void save();
    } else if (e.key === 'Escape' && o.onCancel) {
      e.preventDefault();
      close();
      o.onCancel();
    }
  };
  input.addEventListener('input', () => (error.textContent = ''));
  const saveBtn = h('button', { class: 'btn btn--red grow', onclick: () => void save() }, 'Done');
  const overlay = h(
    'div',
    { class: 'overlay overlay--top', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Alias' },
    h(
      'div',
      { class: 'panel modal col' },
      h('span', { class: 'tag' }, 'Personal file'),
      h('div', { class: 'h2', style: 'margin-top:8px' }, o.title ?? 'What do they call you round here?'),
      h('div', { class: 'muted', style: 'font-size:15px' }, o.note ?? 'Rivals see your alias — above your character, on the scoreboard and in the results. You can change it in the profile.'),
      input,
      error,
      h(
        'div',
        { class: 'row' },
        h(
          'button',
          {
            class: 'btn btn--small',
            onclick: () => {
              input.value = randomNickname();
              error.textContent = '';
              sfx.play('click');
            },
          },
          'Random alias',
        ),
        o.onCancel
          ? h(
              'button',
              {
                class: 'btn btn--small btn--ghost',
                onclick: () => {
                  close();
                  o.onCancel?.();
                },
              },
              o.cancelLabel ?? 'Cancel',
            )
          : null,
      ),
      h('div', { class: 'row' }, saveBtn),
    ),
  );
  document.addEventListener('keydown', onKey, true);
  root.append(overlay);
  setTimeout(() => {
    input.focus();
    input.select();
  }, 50);
  return close;
}
