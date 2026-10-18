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
  // construction site «Стройка»
  brick_pallet: P(24, 20, 'rect', 'low', true, 'Поддон кирпича'),
  cinder_blocks: P(24, 24, 'rect', 'high', true, 'Шлакоблоки'),
  concrete_pipes: P(66, 40, 'rect', 'high', true, 'Бетонные трубы', { inset: 2 }),
  timber: P(46, 16, 'rect', 'low', true, 'Доски'),
  cement_bags: P(26, 18, 'rect', 'low', true, 'Мешки цемента'),
  mixer_truck: P(46, 116, 'rect', 'high', true, 'Бетономешалка', { inset: 2 }),
  excavator: P(58, 92, 'rect', 'high', true, 'Экскаватор', { inset: 3 }),
  sand_pile: P(64, 52, 'circle', 'low', true, 'Куча песка', { radius: 23 }),
  crane_mast: P(28, 28, 'rect', 'high', true, 'Башенный кран'),
  scaffold: P(64, 14, 'rect', 'high', false, 'Леса', { inset: 2 }),
  rebar: P(40, 12, 'none', 'floor', false, 'Арматура'),
  wheelbarrow: P(14, 24, 'none', 'floor', false, 'Тачка'),
  // shop «Гастроном» (shelves also serve the pharmacy and the library)
  shelf: P(44, 14, 'rect', 'high', true, 'Стеллаж'),
  fridge_case: P(46, 18, 'rect', 'low', true, 'Холодильная витрина'),
  counter: P(50, 14, 'rect', 'low', true, 'Прилавок'),
  cash_desk: P(34, 16, 'rect', 'low', true, 'Касса'),
  produce_stall: P(40, 24, 'rect', 'low', true, 'Лоток с овощами'),
  sacks: P(26, 20, 'rect', 'low', true, 'Мешки'),
  soda_machine: P(16, 14, 'rect', 'high', true, 'Автомат газводы'),
  // house of culture «Дом культуры»
  theater_seats: P(54, 12, 'rect', 'low', false, 'Ряд кресел'),
  stage_speaker: P(14, 14, 'rect', 'high', true, 'Колонка'),
  drum_kit: P(28, 22, 'rect', 'low', false, 'Ударная установка', { inset: 2 }),
  pool_table: P(46, 26, 'rect', 'low', true, 'Бильярдный стол'),
  cafe_table: P(20, 20, 'circle', 'low', false, 'Столик', { radius: 7 }),
  piano: P(34, 14, 'rect', 'high', true, 'Пианино'),
  statue: P(30, 30, 'rect', 'high', true, 'Памятник'),
  bust: P(18, 18, 'rect', 'high', true, 'Бюст'),
  planter: P(32, 32, 'rect', 'low', true, 'Клумба'),
  column: P(18, 18, 'circle', 'high', true, 'Колонна', { radius: 8 }),
  coat_rack: P(44, 10, 'rect', 'high', false, 'Вешалка'),
  sofa: P(36, 14, 'rect', 'low', false, 'Диван'),
  curtain: P(48, 8, 'rect', 'high', false, 'Занавес'),
  mixing_desk: P(30, 14, 'rect', 'low', true, 'Пульт'),
  // hospital «Больница»
  hospital_bed: P(22, 40, 'rect', 'low', false, 'Койка'),
  operating_table: P(20, 40, 'rect', 'low', false, 'Операционный стол'),
  med_screen: P(36, 6, 'rect', 'high', false, 'Ширма'),
  med_cabinet: P(32, 12, 'rect', 'high', true, 'Медицинский шкаф'),
  xray: P(40, 32, 'rect', 'high', true, 'Рентген-аппарат'),
  bench_row: P(54, 12, 'rect', 'low', false, 'Ряд кресел'),
  wheelchair: P(14, 16, 'none', 'floor', false, 'Кресло-каталка'),
  stretcher: P(16, 36, 'rect', 'low', false, 'Каталка'),
  ambulance: P(36, 80, 'rect', 'high', true, 'Скорая помощь', { inset: 1 }),
  tent: P(52, 52, 'rect', 'high', true, 'Палатка'),
  iv_stand: P(8, 8, 'none', 'floor', false, 'Капельница'),
} as const satisfies Record<string, PropDef>;

export type PropType = keyof typeof PROP_DEFS;
export const PROP_TYPES = Object.keys(PROP_DEFS) as PropType[];

export function isPropType(v: string): v is PropType {
  return Object.prototype.hasOwnProperty.call(PROP_DEFS, v);
}
