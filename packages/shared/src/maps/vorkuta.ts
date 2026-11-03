import { MapBuilder, mirrorHelpers } from './builder.js';
import type { MapDef } from './types.js';

/**
 * «Воркута» — a mining town in the polar night, from the product owner's layout (references/78-map-vorkuta.png),
 * symmetric about the north–south axis (the owner, 2 Nov 2026: Vorkuta instead of Magadan — a mining
 * town). The mine with its headframe and chimneys closes the north (spawn B at its gate) with coal
 * wagons on the sidings either side, the House of Culture stands over the square with the miners'
 * monument, five-storey blocks, the department store and the canteen, the services house and the post
 * office on the sides, heating mains on low supports along the edges (they stop you, not bullets), the
 * town's arch in the south. Nothing of the camps — no barbed wire, no watchtowers — and no portraits:
 * the monument is a generic miner raising his lamp, the slogans are about the work.
 */
export function buildVorkutaMap(): MapDef {
  const W = 1500;
  const H = 1000;
  const SODIUM = 0xffa840;
  const WINDOW = 0xffc870;
  const COLD = 0x8aa8ff;
  const FIRE = 0xff8a2a;
  const b = new MapBuilder(
    'vorkuta',
    'Vorkuta',
    'The polar night, the coal and the district’s business',
    'The mine with its headframe, the House of Culture over the square with the miners’ monument, five-storey blocks, the department store and the canteen. Snowdrifts for cover, heating mains that stop you but not a bullet.',
    W,
    H,
    'snow',
  )
    .ambient(0x1a2644, 0.46)
    .minimap('#5a6474')
    .weather('snow');
  const m = mirrorHelpers(b, W);

  // ── Roads of trodden snow ────────────────────────────────────────────────
  b.floor('snow_trodden', 40, 104, W - 80, 90); // along the mine
  m.floor('snow_trodden', 246, 194, 60, 766); // the west street (the east one mirrored)
  m.floor('snow_trodden', 40, 596, 480, 108); // the west cross street
  b.floor('snow_trodden', 500, 360, 500, 350); // the square
  b.floor('snow_trodden', 680, 700, 140, 260); // to the town gate
  b.floor('snow_trodden', 40, 840, W - 80, 120); // along the fence
  // tyre tracks across the square and up to the mine
  for (const x of [712, 788]) b.decal({ kind: 'line', x, y: 700, w: 6, h: 250, color: '#4a5260', alpha: 0.35 });
  for (const y of [628, 672]) m.decal({ kind: 'line', x: 60, y, w: 440, h: 5, color: '#4a5260', alpha: 0.3 });
  b.decal({ kind: 'line', x: 60, y: 138, w: W - 120, h: 5, color: '#4a5260', alpha: 0.3 }).decal({ kind: 'line', x: 60, y: 162, w: W - 120, h: 5, color: '#4a5260', alpha: 0.3 });

  // ── North: the mine, its headframe and chimneys, the sidings with coal wagons ─
  b.wall('roof_snow', 420, 0, 660, 104, 'mine');
  b.prop('headframe', 750, 52, 0);
  m.prop('chimney', 520, 44, 0);
  b.decal({ kind: 'line', x: 660, y: 86, w: 180, h: 14, color: '#2a2e36', alpha: 0.95, layer: 'roof' }).decal({ kind: 'text', x: 750, y: 93, text: 'ШАХТА № 3', size: 9, color: '#f0d890', alpha: 0.95, layer: 'roof', font: 'sign' });
  m.decal({ kind: 'text', x: 600, y: 74, text: 'СЛАВА ШАХТЁРСКОМУ ТРУДУ!', size: 8, color: '#d83a2a', alpha: 0.8, layer: 'roof', font: 'sign' }, { text: 'ДАЁШЬ УГОЛЬ СТРАНЕ!' });
  m.decal({ kind: 'rails', x: 0, y: 24, w: 420, h: 30 });
  m.prop('wagon', 110, 39, 90, 0, 1);
  m.prop('wagon', 252, 39, 90, 1, 0);
  m.prop('mine_cart', 384, 39, 90);
  m.prop('coal_pile', 352, 150, 0);
  m.prop('barrel_rust', 414, 136);
  m.light(414, 136, 120, FIRE, 0.66, { fixture: 'none', flicker: 'soft' });
  m.light(560, 112, 160, SODIUM, 0.62, { fixture: 'street' });
  b.light(750, 112, 200, SODIUM, 0.66, { fixture: 'street', flicker: 'soft' });

  // ── The House of Culture over the square, its columns and steps ──────────
  b.wall('roof_snow', 600, 210, 300, 122, 'dk');
  b.decal({ kind: 'line', x: 646, y: 246, w: 208, h: 20, color: '#e8dcc0', alpha: 0.9, layer: 'roof' }).decal({ kind: 'text', x: 750, y: 256, text: 'ДОМ КУЛЬТУРЫ', size: 10, color: '#7a1c16', alpha: 0.95, layer: 'roof', font: 'sign' });
  b.decal({ kind: 'star', x: 750, y: 292, r: 10, color: '#c8261c', alpha: 0.9, layer: 'roof' });
  b.decal({ kind: 'stairs', x: 620, y: 332, w: 260, h: 26 });
  m.prop('column', 636, 346);
  m.prop('column', 694, 346);
  m.light(750, 350, 180, WINDOW, 0.55, { fixture: 'none' });
  m.light(606, 240, 100, WINDOW, 0.45, { fixture: 'window' });

  // ── The square: the miners' monument, drifts, benches, lamps ─────────────
  b.prop('miner_statue', 750, 470, 0);
  b.decal({ kind: 'stain', x: 750, y: 470, r: 34, color: '#e8eef8', alpha: 0.55, seed: 3 });
  b.light(750, 470, 140, COLD, 0.32, { fixture: 'none' });
  m.prop('snowdrift', 620, 520, 0, 0, 1);
  m.prop('snowdrift', 662, 652, 0, 2, 0);
  m.prop('bench', 600, 420, 0);
  m.prop('kiosk', 548, 560, 90);
  for (const [x, y] of [
    [520, 372],
    [520, 700],
  ] as const) {
    m.prop('lamp_post', x, y);
    m.light(x, y + 8, 170, SODIUM, 0.62, { fixture: 'street', flicker: y === 700 ? 'broken' : 'soft' });
  }

  // ── West (east mirrored): block 12 / 14, the store / the canteen, the bus ─
  m.wall('roof_snow', 110, 200, 120, 250, 'block12', 'block14');
  m.decal({ kind: 'text', x: 170, y: 250, text: '12', size: 24, color: '#2a3446', alpha: 0.75, layer: 'roof', font: 'sign' }, { text: '14' });
  for (const y of [226, 300, 374, 430]) m.light(236, y, 70, WINDOW, 0.42, { fixture: 'window', flicker: y === 300 ? 'soft' : 'none' });
  m.wall('roof_snow', 320, 470, 180, 100, 'univermag', 'stolovaya');
  m.decal({ kind: 'line', x: 340, y: 500, w: 140, h: 18, color: '#2a2e36', alpha: 0.95, layer: 'roof' });
  m.decal({ kind: 'text', x: 410, y: 509, text: 'УНИВЕРМАГ', size: 9, color: '#f0d890', alpha: 0.95, layer: 'roof', font: 'sign' }, { text: 'СТОЛОВАЯ' });
  m.light(410, 578, 130, WINDOW, 0.55, { fixture: 'window' });
  m.prop('bus_paz', 420, 420, 90, 0, 0);
  m.prop('container', 400, 280, 90, 1, 2);
  m.prop('crate_stack', 340, 342);
  m.prop('snowdrift', 540, 300, 90, 1, 2);
  m.prop('phone_booth', 286, 470);

  // the heating mains along the edge, raised over the cross street
  m.wall('heat_pipe', 24, 104, 16, 492, 'pipes');
  m.wall('heat_pipe', 24, 704, 16, 256, 'pipes');
  m.overhead({ kind: 'pipe', x: 24, y: 590, w: 16, h: 120 });
  m.prop('snowdrift', 78, 470, 90, 1, 2);

  // the services house / the post office, the garages, the parked Zhiguli
  m.wall('roof_snow', 300, 730, 160, 92, 'dombyta', 'pochta');
  m.decal({ kind: 'line', x: 320, y: 762, w: 120, h: 16, color: '#e8dcc0', alpha: 0.9, layer: 'roof' });
  m.decal({ kind: 'text', x: 380, y: 770, text: 'ДОМ БЫТА', size: 8, color: '#7a1c16', alpha: 0.95, layer: 'roof', font: 'sign' }, { text: 'ПОЧТА' });
  m.light(380, 830, 110, WINDOW, 0.48, { fixture: 'window' });
  m.prop('garage', 140, 786, 0, 1, 2);
  m.prop('garage', 208, 786, 0, 3, 0);
  m.prop('car_zhiguli', 560, 790, 0, 3, 0);
  m.prop('concrete_pipes', 420, 904, 0);
  m.prop('snowdrift', 180, 560, 0, 2, 1);
  m.prop('snowdrift', 470, 180, 0, 0, 2);
  m.prop('trash_container', 496, 652, 90);
  m.prop('tire_stack', 320, 650);
  for (const [x, y] of [
    [276, 194],
    [276, 712],
    [626, 840],
  ] as const) {
    m.prop('lamp_post', x, y);
    m.light(x, y + 8, 160, SODIUM, 0.62, { fixture: 'street', flicker: x === 626 ? 'soft' : 'none' });
  }

  // ── South: the concrete fence and the town's arch over the closed gate ───
  m.wall('fence_concrete', 0, 960, 680, 16, 'fence');
  m.wall('brick', 680, 900, 30, 76, 'pillar');
  b.wall('fence_iron', 710, 962, 80, 8);
  b.overhead({ kind: 'arch', x: 640, y: 890, w: 220, h: 40, text: 'ВОРКУТА', sub: 'ГОРОД ШАХТЁРОВ', seed: 5 });
  m.light(695, 900, 130, SODIUM, 0.62, { fixture: 'lamp', flicker: 'soft' });
  m.prop('snowdrift', 600, 944, 0, 1, 0);

  // ── Spawns: A west, B at the mine's gate, C east (mirrored pairs) ────────
  m.spawn(90, 650, 0);
  m.spawn(90, 150, 45);
  m.spawn(90, 900, -45);
  m.spawn(276, 300, 90);
  m.spawn(560, 150, 90);
  m.spawn(520, 900, -90);
  m.spawn(640, 760, -60);
  m.spawn(700, 150, 90);

  // ── Loot, first aid, «дефицит» drop points ───────────────────────────────
  b.pickup('avtomat', 750, 404, 20_000).pickup('avtomat', 750, 800, 20_000);
  m.pickup('obrez', 276, 520, 16_000);
  m.pickup('obrez', 420, 646, 16_000);
  m.pickup('avtomat', 77, 380, 20_000);
  m.medkit(560, 610, 22_000);
  m.medkit(276, 860, 22_000);
  b.supply(750, 590);
  m.supply(276, 650);
  m.supply(640, 870);

  // ── Capture the flag: deep west and east by the blocks; bases A, B, C ────
  b.flagStand(0, 77, 280).flagStand(1, W - 77, 280);
  b.base(276, 650).base(750, 590).base(W - 276, 650);
  return b.build();
}
