/**
 * Prop registry: footprint, collision and render layer for every placeable object.
 * Collision is derived from this table on both client and server.
 */
export type PropLayer = 'floor' | 'low' | 'high';

export interface PropDef {
  /** Footprint at rotation 0 in world px. */
  w: number;
  h: number;
  shape: 'rect' | 'circle' | 'none';
  /** Optional collision inset (rect) or radius override (circle). */
  inset?: number;
  radius?: number;
  blocksMove: boolean;
  blocksShot: boolean;
  layer: PropLayer;
  label: string;
}

const P = (
  w: number,
  h: number,
  shape: PropDef['shape'],
  layer: PropLayer,
  blocksShot: boolean,
  label: string,
  extra: Partial<PropDef> = {},
): PropDef => ({ w, h, shape, layer, blocksMove: shape !== 'none', blocksShot: shape !== 'none' && blocksShot, label, ...extra });

export const PROP_DEFS = {
  // generic industrial
  crate_wood: P(16, 16, 'rect', 'low', true, 'Ящик'),
  crate_stack: P(32, 32, 'rect', 'high', true, 'Штабель ящиков'),
  crate_green: P(20, 14, 'rect', 'low', true, 'Армейский ящик'),
  barrel_red: P(14, 14, 'circle', 'low', true, 'Бочка', { radius: 7 }),
  barrel_blue: P(14, 14, 'circle', 'low', true, 'Бочка', { radius: 7 }),
  barrel_rust: P(14, 14, 'circle', 'low', true, 'Ржавая бочка', { radius: 7 }),
  pallet: P(26, 20, 'none', 'floor', false, 'Поддон'),
  sandbags: P(40, 12, 'rect', 'low', true, 'Мешки с песком'),
  forklift: P(26, 52, 'rect', 'high', true, 'Погрузчик', { inset: 1 }),
  truck: P(50, 144, 'rect', 'high', true, 'Грузовик', { inset: 2 }),
  machine_lathe: P(40, 22, 'rect', 'high', true, 'Станок'),
  machine_press: P(32, 32, 'rect', 'high', true, 'Пресс'),
  tank_vertical: P(32, 32, 'circle', 'high', true, 'Цистерна', { radius: 16 }),
  tank_horizontal: P(30, 68, 'rect', 'high', true, 'Ёмкость', { inset: 2 }),
  turbine: P(76, 76, 'circle', 'high', true, 'Установка', { radius: 34 }),
  locker_row: P(52, 12, 'rect', 'high', true, 'Шкафчики'),
  desk: P(30, 16, 'rect', 'low', false, 'Стол'),
  chair: P(9, 9, 'none', 'floor', false, 'Стул'),
  file_cabinet: P(18, 12, 'rect', 'high', true, 'Шкаф'),
  plant_pot: P(14, 14, 'circle', 'low', false, 'Фикус', { radius: 5 }),
  turnstile: P(8, 22, 'rect', 'low', false, 'Турникет'),
  boom_barrier: P(60, 6, 'none', 'floor', false, 'Шлагбаум'),
  conveyor: P(88, 22, 'rect', 'low', false, 'Конвейер'),
  electric_box: P(16, 8, 'rect', 'high', true, 'Щиток'),
  cable_reel: P(18, 18, 'circle', 'low', true, 'Катушка кабеля', { radius: 9 }),
  tire_stack: P(16, 16, 'circle', 'low', true, 'Покрышки', { radius: 8 }),
  workbench: P(36, 14, 'rect', 'low', false, 'Верстак'),
  scrap_pile: P(30, 26, 'rect', 'low', true, 'Металлолом', { inset: 3 }),
  container: P(48, 116, 'rect', 'high', true, 'Контейнер'),
  // vehicles
  car_zhiguli: P(34, 80, 'rect', 'low', true, 'Жигули', { inset: 1 }),
  car_volga: P(36, 92, 'rect', 'low', true, 'Волга', { inset: 1 }),
  car_wreck: P(34, 80, 'rect', 'low', true, 'Остов машины', { inset: 2 }),
  bus_paz: P(50, 136, 'rect', 'high', true, 'Автобус', { inset: 1 }),
  // garages & yard
  garage: P(64, 112, 'rect', 'high', true, 'Гараж'),
  garage_shell: P(46, 92, 'rect', 'high', true, 'Гараж-ракушка', { inset: 1 }),
  trash_container: P(34, 20, 'rect', 'low', true, 'Мусорный контейнер'),
  bench: P(38, 11, 'rect', 'low', false, 'Лавочка'),
  domino_table: P(22, 22, 'rect', 'low', false, 'Стол доминошников', { inset: 3 }),
  swing: P(50, 14, 'rect', 'low', false, 'Качели', { inset: 4 }),
  slide: P(16, 44, 'rect', 'low', false, 'Горка', { inset: 2 }),
  carousel: P(34, 34, 'circle', 'low', false, 'Карусель', { radius: 14 }),
  sandbox: P(44, 44, 'none', 'floor', false, 'Песочница'),
  monkey_bars: P(40, 10, 'rect', 'low', false, 'Турник', { inset: 2 }),
  kiosk: P(40, 30, 'rect', 'high', true, 'Киоск'),
  lamp_post: P(8, 8, 'circle', 'low', true, 'Фонарь', { radius: 3 }),
  tree_trunk: P(10, 10, 'circle', 'low', true, 'Дерево', { radius: 4 }),
  phone_booth: P(18, 18, 'rect', 'high', true, 'Телефонная будка'),
  water_pump: P(12, 12, 'circle', 'low', true, 'Колонка', { radius: 4 }),
} as const satisfies Record<string, PropDef>;

export type PropType = keyof typeof PROP_DEFS;
export const PROP_TYPES = Object.keys(PROP_DEFS) as PropType[];

export function isPropType(v: string): v is PropType {
  return Object.prototype.hasOwnProperty.call(PROP_DEFS, v);
}
