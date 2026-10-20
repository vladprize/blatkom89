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
  crate_wood: P(16, 16, 'rect', 'low', true, 'Crate'),
  crate_stack: P(32, 32, 'rect', 'high', true, 'Stack of crates'),
  crate_green: P(20, 14, 'rect', 'low', true, 'Army crate'),
  barrel_red: P(14, 14, 'circle', 'low', true, 'Barrel', { radius: 7 }),
  barrel_blue: P(14, 14, 'circle', 'low', true, 'Barrel', { radius: 7 }),
  barrel_rust: P(14, 14, 'circle', 'low', true, 'Rusty barrel', { radius: 7 }),
  pallet: P(26, 20, 'none', 'floor', false, 'Pallet'),
  sandbags: P(40, 12, 'rect', 'low', true, 'Sandbags'),
  forklift: P(26, 52, 'rect', 'high', true, 'Forklift', { inset: 1 }),
  truck: P(50, 144, 'rect', 'high', true, 'Lorry', { inset: 2 }),
  machine_lathe: P(40, 22, 'rect', 'high', true, 'Lathe'),
  machine_press: P(32, 32, 'rect', 'high', true, 'Press'),
  tank_vertical: P(32, 32, 'circle', 'high', true, 'Tank', { radius: 16 }),
  tank_horizontal: P(30, 68, 'rect', 'high', true, 'Vessel', { inset: 2 }),
  turbine: P(76, 76, 'circle', 'high', true, 'Plant unit', { radius: 34 }),
  locker_row: P(52, 12, 'rect', 'high', true, 'Lockers'),
  desk: P(30, 16, 'rect', 'low', false, 'Desk'),
  chair: P(9, 9, 'none', 'floor', false, 'Chair'),
  file_cabinet: P(18, 12, 'rect', 'high', true, 'Cabinet'),
  plant_pot: P(14, 14, 'circle', 'low', false, 'Ficus', { radius: 5 }),
  turnstile: P(8, 22, 'rect', 'low', false, 'Turnstile'),
  boom_barrier: P(60, 6, 'none', 'floor', false, 'Boom barrier'),
  conveyor: P(88, 22, 'rect', 'low', false, 'Conveyor'),
  electric_box: P(16, 8, 'rect', 'high', true, 'Fuse box'),
  cable_reel: P(18, 18, 'circle', 'low', true, 'Cable drum', { radius: 9 }),
  tire_stack: P(16, 16, 'circle', 'low', true, 'Tyres', { radius: 8 }),
  workbench: P(36, 14, 'rect', 'low', false, 'Workbench'),
  scrap_pile: P(30, 26, 'rect', 'low', true, 'Scrap metal', { inset: 3 }),
  container: P(48, 116, 'rect', 'high', true, 'Container'),
  // vehicles
  car_zhiguli: P(34, 80, 'rect', 'low', true, 'Zhiguli', { inset: 1 }),
  car_volga: P(36, 92, 'rect', 'low', true, 'Volga', { inset: 1 }),
  car_wreck: P(34, 80, 'rect', 'low', true, 'Car wreck', { inset: 2 }),
  bus_paz: P(50, 136, 'rect', 'high', true, 'Bus', { inset: 1 }),
  // garages & yard
  garage: P(64, 112, 'rect', 'high', true, 'Garage'),
  garage_shell: P(46, 92, 'rect', 'high', true, 'Shell garage', { inset: 1 }),
  trash_container: P(34, 20, 'rect', 'low', true, 'Rubbish skip'),
  bench: P(38, 11, 'rect', 'low', false, 'Bench'),
  domino_table: P(22, 22, 'rect', 'low', false, 'Dominoes table', { inset: 3 }),
  swing: P(50, 14, 'rect', 'low', false, 'Swing', { inset: 4 }),
  slide: P(16, 44, 'rect', 'low', false, 'Slide', { inset: 2 }),
  carousel: P(34, 34, 'circle', 'low', false, 'Roundabout', { radius: 14 }),
  sandbox: P(44, 44, 'none', 'floor', false, 'Sandpit'),
  monkey_bars: P(40, 10, 'rect', 'low', false, 'Pull-up bar', { inset: 2 }),
  kiosk: P(40, 30, 'rect', 'high', true, 'Kiosk'),
  lamp_post: P(8, 8, 'circle', 'low', true, 'Street lamp', { radius: 3 }),
  tree_trunk: P(10, 10, 'circle', 'low', true, 'Tree', { radius: 4 }),
  phone_booth: P(18, 18, 'rect', 'high', true, 'Phone box'),
  water_pump: P(12, 12, 'circle', 'low', true, 'Water pump', { radius: 4 }),
  // construction site «Стройка»
  brick_pallet: P(24, 20, 'rect', 'low', true, 'Brick pallet'),
  cinder_blocks: P(24, 24, 'rect', 'high', true, 'Cinder blocks'),
  concrete_pipes: P(66, 40, 'rect', 'high', true, 'Concrete pipes', { inset: 2 }),
  timber: P(46, 16, 'rect', 'low', true, 'Timber'),
  cement_bags: P(26, 18, 'rect', 'low', true, 'Cement bags'),
  mixer_truck: P(46, 116, 'rect', 'high', true, 'Mixer truck', { inset: 2 }),
  excavator: P(58, 92, 'rect', 'high', true, 'Excavator', { inset: 3 }),
  sand_pile: P(64, 52, 'circle', 'low', true, 'Sand pile', { radius: 23 }),
  crane_mast: P(28, 28, 'rect', 'high', true, 'Tower crane'),
  scaffold: P(64, 14, 'rect', 'high', false, 'Scaffolding', { inset: 2 }),
  rebar: P(40, 12, 'none', 'floor', false, 'Rebar'),
  wheelbarrow: P(14, 24, 'none', 'floor', false, 'Wheelbarrow'),
  // shop «Гастроном» (shelves also serve the pharmacy and the library)
  shelf: P(44, 14, 'rect', 'high', true, 'Shelving'),
  fridge_case: P(46, 18, 'rect', 'low', true, 'Fridge counter'),
  counter: P(50, 14, 'rect', 'low', true, 'Counter'),
  cash_desk: P(34, 16, 'rect', 'low', true, 'Cash desk'),
  produce_stall: P(40, 24, 'rect', 'low', true, 'Produce stall'),
  sacks: P(26, 20, 'rect', 'low', true, 'Sacks'),
  soda_machine: P(16, 14, 'rect', 'high', true, 'Soda machine'),
  // house of culture «Дом культуры»
  theater_seats: P(54, 12, 'rect', 'low', false, 'Row of seats'),
  stage_speaker: P(14, 14, 'rect', 'high', true, 'Water pump'),
  drum_kit: P(28, 22, 'rect', 'low', false, 'Drum kit', { inset: 2 }),
  pool_table: P(46, 26, 'rect', 'low', true, 'Pool table'),
  cafe_table: P(20, 20, 'circle', 'low', false, 'Café table', { radius: 7 }),
  piano: P(34, 14, 'rect', 'high', true, 'Piano'),
  statue: P(30, 30, 'rect', 'high', true, 'Monument'),
  bust: P(18, 18, 'rect', 'high', true, 'Bust'),
  planter: P(32, 32, 'rect', 'low', true, 'Flower bed'),
  column: P(18, 18, 'circle', 'high', true, 'Column', { radius: 8 }),
  coat_rack: P(44, 10, 'rect', 'high', false, 'Coat rack'),
  sofa: P(36, 14, 'rect', 'low', false, 'Sofa'),
  curtain: P(48, 8, 'rect', 'high', false, 'Stage curtain'),
  mixing_desk: P(30, 14, 'rect', 'low', true, 'Mixing desk'),
  // hospital «Больница»
  hospital_bed: P(22, 40, 'rect', 'low', false, 'Hospital bed'),
  operating_table: P(20, 40, 'rect', 'low', false, 'Operating table'),
  med_screen: P(36, 6, 'rect', 'high', false, 'Screen'),
  med_cabinet: P(32, 12, 'rect', 'high', true, 'Medicine cabinet'),
  xray: P(40, 32, 'rect', 'high', true, 'X-ray machine'),
  bench_row: P(54, 12, 'rect', 'low', false, 'Row of seats'),
  wheelchair: P(14, 16, 'none', 'floor', false, 'Wheelchair'),
  stretcher: P(16, 36, 'rect', 'low', false, 'Stretcher'),
  ambulance: P(36, 80, 'rect', 'high', true, 'Ambulance', { inset: 1 }),
  tent: P(52, 52, 'rect', 'high', true, 'Tent'),
  iv_stand: P(8, 8, 'none', 'floor', false, 'IV stand'),
  // v0.23: the cemetery, the square and the pioneer camp (shared: flagpole)
  flagpole: P(30, 10, 'circle', 'high', false, 'Flagpole', { radius: 2 }),
  grave: P(16, 8, 'rect', 'low', true, 'Gravestone'),
  grave_mound: P(16, 26, 'none', 'floor', false, 'Grave'),
  tomb: P(20, 34, 'rect', 'low', true, 'Tomb'),
  wreath: P(14, 14, 'none', 'floor', false, 'Wreath'),
  mourner: P(24, 24, 'rect', 'high', true, 'Statue'),
  memorial: P(44, 44, 'rect', 'high', true, 'Memorial', { inset: 2 }),
  dome: P(48, 48, 'none', 'high', false, 'Dome'),
  dome_small: P(28, 28, 'none', 'high', false, 'Dome'),
  spire: P(56, 56, 'none', 'high', false, 'Tower roof'),
  btr: P(40, 92, 'rect', 'high', true, 'Armoured carrier', { inset: 1 }),
  hedgehog: P(20, 20, 'rect', 'low', false, 'Anti-tank hedgehog', { inset: 3 }),
  barrier: P(44, 6, 'rect', 'low', false, 'Barrier'),
  campfire: P(30, 30, 'circle', 'low', false, 'Campfire', { radius: 9 }),
  watchtower: P(36, 36, 'rect', 'high', true, 'Watchtower', { inset: 4 }),
  goal: P(12, 44, 'rect', 'low', false, 'Goal', { inset: 1 }),
  boat: P(18, 44, 'rect', 'low', false, 'Boat', { inset: 2 }),
  bunk_bed: P(18, 38, 'rect', 'low', false, 'Bunk bed'),
  long_table: P(70, 26, 'rect', 'low', false, 'Dining table', { inset: 1 }),
  bugler: P(26, 26, 'rect', 'high', true, 'Pioneer statue'),
  rock: P(34, 26, 'circle', 'low', true, 'Rock', { radius: 11 }),
} as const satisfies Record<string, PropDef>;

export type PropType = keyof typeof PROP_DEFS;
export const PROP_TYPES = Object.keys(PROP_DEFS) as PropType[];

export function isPropType(v: string): v is PropType {
  return Object.prototype.hasOwnProperty.call(PROP_DEFS, v);
}
