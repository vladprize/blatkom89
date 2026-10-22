/**
 * Nickname helpers: district-style random suggestions and the «What do they call you round here?» dialog
 * (first launch, and «✎» in the menu/profile). Validation is the shared `displayNameSchema`,
 * the same one the server applies to PATCH /api/me.
 */
import { displayNameSchema, latinName, sameAlias } from '@blatkom/shared';
import type { NameCheckResponse } from '@blatkom/shared';
import { h, fill, toast } from '../ui/dom.js';
import { sfx } from '../game/audio/Sfx.js';
import { randomNickname } from './nickname-words.js';
import { t } from '../i18n/index.js';
import { apiErrorText } from '../net/errors.js';

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
  /** Online: aliases are unique — checks one as it is typed and offers free variants. */
  check?: (name: string) => Promise<NameCheckResponse>;
}

/** Opens the nickname dialog on top of `root`; returns a function that closes it. */
export function openNicknameDialog(root: HTMLElement, o: NicknameDialogOptions): () => void {
  const input = h('input', { class: 'input input--big', value: o.initial, maxlength: '24', autocomplete: 'off', autocapitalize: 'words', spellcheck: 'false', 'aria-label': t('Alias') }) as HTMLInputElement;
  const error = h('div', { class: 'muted', style: 'min-height:18px;font-size:14px;color:#e07a6a' });
  // online: «✓ free» or «taken — try: …» with free variants to tap
  const hint = h('div', { class: 'namehint', 'data-testid': 'name-hint', 'aria-live': 'polite' });
  let checkTimer: ReturnType<typeof setTimeout> | null = null;
  let checkSeq = 0;
  const showTaken = (r: NameCheckResponse) => {
    fill(
      hint,
      h('span', { class: 'namehint__bad' }, t('«{name}» is taken.', { name: r.name })),
      r.suggestions.length ? h('span', { class: 'muted' }, ' ', t('Free:')) : null,
      ...r.suggestions.map((sug) =>
        h(
          'button',
          {
            class: 'chip',
            'data-testid': 'name-suggestion',
            onclick: () => {
              input.value = sug;
              hint.replaceChildren(h('span', { class: 'namehint__ok' }, t('✓ free')));
              error.textContent = '';
              input.focus();
            },
          },
          sug,
        ),
      ),
    );
  };
  const runCheck = (name: string) => {
    const check = o.check;
    if (!check) return;
    const seq = ++checkSeq;
    void check(name)
      .then((r) => {
        if (seq !== checkSeq || closed || !sameAlias(input.value, r.name)) return;
        if (r.available) hint.replaceChildren(h('span', { class: 'namehint__ok' }, t('✓ free')));
        else showTaken(r);
      })
      .catch(() => {
        if (seq === checkSeq) hint.replaceChildren();
      });
  };
  /** v0.3: aliases are Latin — Cyrillic (or accents) typed: offer the same name in Latin letters. */
  const latinHint = (): boolean => {
    const v = input.value.trim();
    if (!/[^\x20-\x7E’]/.test(v)) return false;
    const fixed = latinName(v, '');
    fill(
      hint,
      h('span', { class: 'namehint__bad' }, t('Latin letters only.')),
      fixed && fixed !== v
        ? h(
            'button',
            {
              class: 'chip',
              'data-testid': 'name-latin',
              onclick: () => {
                input.value = fixed;
                error.textContent = '';
                scheduleCheck();
                input.focus();
              },
            },
            fixed,
          )
        : null,
    );
    return true;
  };
  const scheduleCheck = () => {
    if (checkTimer) clearTimeout(checkTimer);
    hint.replaceChildren();
    if (latinHint() || !o.check) return;
    const parsed = displayNameSchema.safeParse(input.value);
    if (!parsed.success) return;
    checkTimer = setTimeout(() => runCheck(parsed.data), 350);
  };
  let busy = false;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    if (checkTimer) clearTimeout(checkTimer);
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    o.onClose?.();
  };
  const save = async () => {
    if (busy) return;
    const parsed = displayNameSchema.safeParse(input.value);
    if (!parsed.success) {
      error.textContent = input.value.trim().length < 2 ? t('At least 2 characters.') : input.value.trim().length > 24 ? t('At most 24 characters.') : t('A name may contain Latin letters (A–Z), digits, spaces and _ . -');
      latinHint();
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
      // taken meanwhile (or never checked): show the free variants right here
      if (o.check && e && typeof e === 'object' && (e as { code?: string }).code === 'name_taken') {
        error.textContent = '';
        runCheck(parsed.data);
      } else toast(e instanceof Error && e.message ? apiErrorText(e) : t('Couldn’t save it'));
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
  input.addEventListener('input', () => {
    error.textContent = '';
    scheduleCheck();
  });
  const saveBtn = h('button', { class: 'btn btn--red grow', onclick: () => void save() }, t('Done'));
  const overlay = h(
    'div',
    { class: 'overlay overlay--top', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('Alias') },
    h(
      'div',
      { class: 'panel modal col' },
      h('span', { class: 'tag' }, t('Personal file')),
      h('div', { class: 'h2', style: 'margin-top:8px' }, o.title ?? t('What do they call you round here?')),
      h('div', { class: 'muted', style: 'font-size:15px' }, o.note ?? t('Rivals see your alias — above your character, on the scoreboard and in the results. You can change it in the profile.')),
      input,
      error,
      hint,
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
              scheduleCheck();
              sfx.play('click');
            },
          },
          t('Random alias'),
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
              o.cancelLabel ?? t('Cancel'),
            )
          : null,
      ),
      h('div', { class: 'row' }, saveBtn),
    ),
  );
  document.addEventListener('keydown', onKey, true);
  root.append(overlay);
  scheduleCheck();
  setTimeout(() => {
    input.focus();
    input.select();
  }, 50);
  return close;
}
