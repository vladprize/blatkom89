/**
 * v0.2.23: the characters whose full-height picture exists (apps/web/public/assets/fullbody/<id>.jpg, made by
 * tools/make-fullbody.py from the owner's pictures). The big tall fighter cards draw them; everyone else — and the
 * small and wide cards — keep the waist-up hero art.
 */
import type { CharacterId } from '@blatkom/shared';

export const FULLBODY: ReadonlySet<CharacterId> = new Set<CharacterId>([
  // the first batch (10)
  'uchastkovy',
  'mihalych',
  'vorona',
  'zmeya',
  'varan',
  'popugay',
  'golub',
  'tarakan',
  'krysa',
  'svinya',
  // the second batch (9), sent on 9 November
  'piranya',
  'akula',
  'oryol',
  'leopard',
  'slon',
  'lobster',
  'buyvol',
  'koshka',
  'lisa',
]);
