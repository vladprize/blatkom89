/**
 * Nickname helpers: district-style random suggestions and the «What do they call you round here?» dialog
 * (first launch, and «✎» in the menu/profile). Validation is the shared `displayNameSchema`,
 * the same one the server applies to PATCH /api/me.
 */
import { displayNameSchema, isNick, nickInput, sameAlias, toNick, MAX_NICK_LENGTH, MIN_NICK_LENGTH } from '@blatkom/shared';
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
  // v0.2.19 (the owner): one word of small Latin letters, digits and _ . — typed letters become small, a space
  // becomes «_», Cyrillic is spelled in Latin letters as it is typed
  const input = h('input', { class: 'input input--big', value: isNick(o.initial) ? o.initial : toNick(o.initial), maxlength: String(MAX_NICK_LENGTH), autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', inputmode: 'text', 'aria-label': t('Alias') }) as HTMLInputElement;
  const rule = h('div', { class: 'muted namerule', 'data-testid': 'name-rule' }, t('One word: a–z, 0–9 and _ . - · {min}–{max} characters', { min: MIN_NICK_LENGTH, max: MAX_NICK_LENGTH }));
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
  const scheduleCheck = () => {
    if (checkTimer) clearTimeout(checkTimer);
    hint.replaceChildren();
    if (!o.check) return;
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
      const n = input.value.trim().length;
      error.textContent = n < MIN_NICK_LENGTH ? t('At least {n} characters.', { n: MIN_NICK_LENGTH }) : n > MAX_NICK_LENGTH ? t('At most {n} characters.', { n: MAX_NICK_LENGTH }) : t('An alias is one word: small Latin letters (a–z), digits and _ . -');
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
    const v = input.value;
    const fixed = nickInput(v);
    if (fixed !== v) {
      // keep the caret where it was when only letters changed case or a space became «_»
      const at = input.selectionStart ?? fixed.length;
      input.value = fixed;
      const caret = fixed.length === v.length ? at : fixed.length;
      try {
        input.setSelectionRange(caret, caret);
      } catch {
        /* not a text input in this browser */
      }
    }
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
      rule,
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
