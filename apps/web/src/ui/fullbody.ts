/**
 * v0.2.23: the characters whose full-height picture exists (apps/web/public/assets/fullbody/<id>.jpg, made by
 * tools/make-fullbody.py from the owner's pictures). The big tall fighter cards draw them; everyone else — and the
 * small and wide cards — keep the waist-up hero art.
 *
 * v0.2.24: all 36 (the owner: «все карточки в полный рост поставь — абсолютно все»), the rooster's and the
 * panther's first pictures and the six with three stripes on their sneakers included at the owner's word; a
 * corrected picture replaces its file (`python3 tools/make-fullbody.py <id>=<picture>`), nothing else changes.
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
  // the last 15, sent on 10 November, and the first two held back on 9 November
  'nosorog',
  'gorilla',
  'lev',
  'zaychiha',
  'zayac',
  'vasilisk',
  'lenivec',
  'kozel',
  'pingvin',
  'tigr',
  'pauk',
  'bogomol',
  'ezh',
  'kasatka',
  'zvezda',
  'petya',
  'valuta',
]);
