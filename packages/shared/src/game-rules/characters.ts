/**
 * Playable characters. Combat attributes are identical by design (see CHARACTER_BASE_STATS);
 * the differences are visual and narrative only.
 */
export const CHARACTER_IDS = ['petya', 'valuta', 'uchastkovy', 'mihalych'] as const;
export type CharacterId = (typeof CHARACTER_IDS)[number];

export interface CharacterDef {
  id: CharacterId;
  /** Display name as used on the reference sheets. */
  name: string;
  nickname: string;
  species: string;
  role: string;
  personality: string;
  quote: string;
  district: string;
  business: string;
  weaponsNote: string;
  /** UI accent colour (hex) taken from the character's palette. */
  accent: string;
  /** Short label used in kill feed / name tags. */
  tag: string;
}

export const CHARACTER_BASE_STATS = Object.freeze({ maxHp: 100, speed: 1, radius: 10 });

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  petya: {
    id: 'petya',
    name: 'Петя',
    nickname: 'Комендант',
    species: 'Петух',
    role: 'Бывший комендант общежития',
    personality: 'Следит за порядком. Знает каждый угол во дворе.',
    quote: 'Здесь мой двор. Здесь мои правила.',
    district: '3-й микрорайон',
    business: 'Контроль двора',
    weaponsNote: 'Любое, главное чтобы было понятие.',
    accent: '#c8312a',
    tag: 'Петя',
  },
  valuta: {
    id: 'valuta',
    name: 'Валюта',
    nickname: 'Фарцовщик',
    species: 'Пантера',
    role: 'Фарцовщик и решальщик',
    personality: 'Всегда знает, где достать. Решает вопросы любого уровня.',
    quote: 'Связи решают всё.',
    district: 'Гаражный кооператив',
    business: 'Обмен, поставки, валюта',
    weaponsNote: 'Ствол, связи и хорошая информация.',
    accent: '#d8a637',
    tag: 'Валюта',
  },
  uchastkovy: {
    id: 'uchastkovy',
    name: 'Участковый',
    nickname: 'Всех знает',
    species: 'Волк',
    role: 'Участковый. Следит за районом, знает всех и всё.',
    personality: 'Подозрительный, наблюдательный, бюрократически настойчивый.',
    quote: 'Ты куда? Документы покажи.',
    district: '3-й микрорайон',
    business: 'Порядок, протоколы, районные дела',
    weaponsNote: 'Пистолет, автомат, дубинка, обрез.',
    accent: '#3d5a8c',
    tag: 'Участковый',
  },
  mihalych: {
    id: 'mihalych',
    name: 'Михалыч',
    nickname: 'Дембель',
    species: 'Медведь',
    role: 'Бывший военный. Вышел за хлебом — теперь решает дела в районе.',
    personality: 'Спокойный, опытный, не лезет в суету, но если надо — разберётся. Уважает своих, держит слово.',
    quote: 'Порядок — это не то, что пишут. Порядок — это то, что держится на людях.',
    district: 'Гаражный кооператив',
    business: 'Охрана, силовые вопросы, разбор конфликтов',
    weaponsNote: 'Автомат, обрез, пистолет, ближний бой.',
    accent: '#6b7536',
    tag: 'Михалыч',
  },
};

export function isCharacterId(v: unknown): v is CharacterId {
  return typeof v === 'string' && (CHARACTER_IDS as readonly string[]).includes(v);
}
