import { MapBuilder, mirrorHelpers } from './builder.js';
import type { MapDef, Rotation } from './types.js';

/**
 * «Черкизон» — the clothes market at night, from the product owner's layout (references/77-map-cherkizon.png),
 * symmetric about the north–south axis (the owner, 2 Nov 2026). The brick wall with the gate and its
 * signboard closes the north (spawn B inside the gate), blocks of stalls with tarps and awnings stand
 * in two columns on each side, the covered pavilion is in the middle, the shawarma stand and its
 * parasols below it, the carpet row along the south railing; containers line the west and east edges
 * (spawn A west, C east). Nothing from the reference's real marks: no portraits, no sportswear or
 * jeans brand on any sign — the signs say what is sold («ДЖИНСЫ», «СПОРТТОВАРЫ», «ВИДЕО»…).
 */
export function buildCherkizonMap(): MapDef {
  const W = 1500;
  const H = 1000;
  const SODIUM = 0xffb04a;
  const BULB = 0xffd08a;
  const NEON = 0xd860ff;
  const GRILL = 0xff7a2a;
  const b = new MapBuilder(
    'cherkizon',
    'Cherkizon Market',
    'Wholesale and retail — and the rest is settled in the aisles',
    'Rows of stalls under tarps and awnings, the covered pavilion in the middle, the shawarma stand and the carpet row. Narrow aisles, sudden corners, cover at every step.',
    W,
    H,
    'paving',
  )
    .ambient(0x2a2230, 0.5)
    .minimap('#3a342c');
  const m = mirrorHelpers(b, W);

  // ── The ground: worn slabs, the main aisles in cracked asphalt, puddles ──
  b.floor('asphalt_cracked', 670, 40, 160, 920); // the central avenue from the gate
  m.floor('asphalt_cracked', 54, 40, 90, 920); // the west aisle (the east one mirrored)
  m.floor('asphalt_cracked', 54, 446, 640, 108); // the cross street
  m.floor('asphalt', 0, 960, 750, 40);
  for (const [x, y, r, s] of [
    [380, 300, 16, 1],
    [250, 520, 12, 2],
    [600, 690, 18, 3],
    [120, 860, 14, 4],
    [480, 905, 12, 5],
  ] as const) {
    m.decal({ kind: 'stain', x, y, r, color: '#16222c', alpha: 0.6, seed: s }, { seed: s + 20 });
  }
  b.decal({ kind: 'manhole', x: 750, y: 500 }).decal({ kind: 'manhole', x: 750, y: 760 });
  m.decal({ kind: 'manhole', x: 369, y: 714 });

  // ── North: the brick wall, the gate and its signboard ────────────────────
  m.wall('brick', 0, 0, 670, 36, 'wall');
  m.wall('brick', 670, 0, 30, 62, 'gatepost');
  b.wall('fence_iron', 700, 16, 100, 8); // the gate itself: closed, bullets pass through the bars
  b.overhead({ kind: 'arch', x: 626, y: 28, w: 248, h: 46, text: 'ЧЕРКИЗОН', sub: 'ВЕЩЕВОЙ РЫНОК · ОПТ · РОЗНИЦА', seed: 3 });
  m.decal(
    { kind: 'text', x: 360, y: 18, text: 'ТОРГУЕМ ЧЕСТНО', size: 12, color: '#e8dcc0', alpha: 0.55, layer: 'roof', font: 'hand' },
    { text: 'ПРИХОДИТЕ ЕЩЁ' },
  );
  m.light(685, 70, 150, SODIUM, 0.85, { fixture: 'street', flicker: 'soft' });
  // the cabins by the wall and the parked lorries
  m.prop('porta_toilet', 80, 52, 0, 0, 1);
  m.prop('porta_toilet', 104, 52, 0, 0, 1);
  m.prop('truck', 252, 62, 90, 0, 1);
  m.prop('crate_stack', 352, 56);
  m.prop('pallet', 400, 60, 90);
  m.prop('kiosk', 610, 82, 90);

  // ── The edges: containers, a corrugated fence between them ───────────────
  for (const [y, v] of [
    [130, 0],
    [260, 1],
    [740, 2],
    [870, 3],
  ] as const)
    m.prop('container', 30, y, 0, v, (v + 1) % 4);
  m.wall('corrugated', 0, 318, 14, 364, 'fence');

  // ── The stall blocks: two back-to-back rows, the goods in front ──────────
  // a block's top row faces north (rot 180), the bottom row south (rot 0); `cols` stalls of 60
  const SIGNS_L = ['СПОРТТОВАРЫ', 'ВИДЕО', 'ОБУВЬ', 'СИГАРЕТЫ · ПИВО', 'ДЖИНСЫ', 'ЧАСЫ', 'ЭЛЕКТРОНИКА', 'ШАПКИ'];
  const SIGNS_R = ['ДЖИНСЫ', 'КАССЕТЫ · ДИСКИ', 'КОЖА', 'ИГРУШКИ', 'СПОРТТОВАРЫ', 'ПОСУДА', 'ВИДЕО', 'ДУБЛЁНКИ'];
  let signNo = 0;
  const block = (x0: number, y0: number, cols: number, seed: number, front: { top: boolean; bottom: boolean; sign?: boolean } = { top: true, bottom: true }) => {
    for (let i = 0; i < cols; i++) {
      const x = x0 + 30 + i * 60;
      const v = (seed + i) % 6;
      m.prop('stall', x, y0 + 36, 180 as Rotation, v, (v + 3) % 6);
      m.prop('stall', x, y0 + 80, 0, (v + 2) % 6, (v + 4) % 6);
      // goods in front of every other stall, so the aisles zigzag
      if (front.top && (i + seed) % 2 === 0) m.prop('clothes_rail', x, y0 + 7, 0, (seed + i) % 3, (seed + i + 1) % 3);
      if (front.bottom && (i + seed) % 2 === 1) m.prop('goods_table', x, y0 + 112, 0, (seed + i) % 4, (seed + i + 2) % 4);
    }
    // one bulb per block, at alternate corners (the light map is kept light for phones)
    if (seed % 2) m.light(x0 + 6, y0 + 16, 100, BULB, 0.75, { fixture: 'lamp', flicker: seed % 3 === 0 ? 'soft' : 'none' });
    else m.light(x0 + cols * 60 - 6, y0 + 100, 100, BULB, 0.75, { fixture: 'lamp' });
    if (front.sign === false) return;
    // a signboard on the roofs
    const sx = x0 + cols * 30;
    const textL = SIGNS_L[signNo % SIGNS_L.length]!;
    const textR = SIGNS_R[signNo % SIGNS_R.length]!;
    signNo++;
    const bw = Math.min(cols * 60 - 16, 150);
    m.decal({ kind: 'line', x: sx - bw / 2, y: y0 + 50, w: bw, h: 16, color: seed % 2 ? '#e8dcc0' : '#2a1c14', alpha: 0.95, layer: 'roof' });
    m.decal(
      { kind: 'text', x: sx, y: y0 + 58, text: textL, size: 9, color: seed % 2 ? '#a8201a' : '#f0d890', alpha: 0.95, layer: 'roof', font: 'sign' },
      { text: textR },
    );
  };
  // the west column (x 144…324) and the inner column (x 414…534), four rows each
  block(144, 126, 3, 0);
  block(414, 126, 2, 1);
  block(144, 330, 3, 2);
  block(414, 330, 2, 3);
  block(144, 554, 3, 4);
  block(414, 554, 2, 5);
  block(144, 758, 3, 1);
  block(414, 758, 2, 2, { top: true, bottom: false });

  // ── The middle: the entrance plaza, the pavilion, the shawarma, the carpets ─
  m.prop('crate_stack', 640, 196);
  m.prop('crate_wood', 612, 214);
  m.prop('barrel_blue', 600, 270);
  m.prop('barrel_rust', 614, 284);
  m.prop('goods_table', 700, 296, 0, 1, 3);
  b.decal({ kind: 'arrow', x: 750, y: 160, w: 30, h: 60, angle: 90, color: '#d8d0bc', alpha: 0.35 });

  // the covered pavilion: one corrugated roof over the inner stalls, a red banner with a star on it
  b.wall('corrugated', 630, 330, 240, 116, 'pavilion');
  b.decal({ kind: 'line', x: 646, y: 344, w: 208, h: 26, color: '#2a4a6e', alpha: 0.55, layer: 'roof' })
    .decal({ kind: 'line', x: 690, y: 378, w: 120, h: 40, color: '#8a1c16', alpha: 0.95, layer: 'roof' })
    .decal({ kind: 'star', x: 712, y: 398, r: 9, color: '#e8c040', alpha: 0.95, layer: 'roof' })
    .decal({ kind: 'text', x: 762, y: 398, text: 'ТОРГОВЫЙ РЯД № 1', size: 7, color: '#f0d890', alpha: 0.95, layer: 'roof', font: 'sign' });
  for (const [i, x] of [660, 712].entries()) m.prop('clothes_rail', x, 322, 0, i % 3, (i + 1) % 3);
  m.prop('goods_table', 660, 458, 0, 2, 0);
  m.prop('goods_table', 712, 458, 0, 3, 1);
  m.light(640, 460, 110, BULB, 0.75, { fixture: 'lamp' });

  // the shawarma stand on the axis, its grill's glow, parasols and tables below
  b.prop('stall', 720, 612, 0, 6).prop('stall', 780, 612, 0, 6);
  b.decal({ kind: 'line', x: 700, y: 598, w: 100, h: 18, color: '#e8dcc0', alpha: 0.95, layer: 'roof' }).decal({ kind: 'text', x: 750, y: 607, text: 'ШАУРМА', size: 10, color: '#a8201a', alpha: 0.95, layer: 'roof', font: 'sign' });
  b.light(750, 650, 150, GRILL, 0.9, { fixture: 'none', flicker: 'soft' });
  m.prop('cafe_table', 646, 714, 0);
  m.prop('cafe_table', 600, 660, 0);
  m.overhead({ kind: 'parasol', x: 624, y: 692, w: 44, h: 44, seed: 0 }, { seed: 1 });
  m.overhead({ kind: 'parasol', x: 578, y: 638, w: 44, h: 44, seed: 1 }, { seed: 0 });
  m.prop('barrel_red', 680, 662);

  // the carpet hall below: two rows of stalls, carpets hung in front
  block(630, 758, 2, 3, { top: false, bottom: false, sign: false });
  m.prop('carpet_stand', 660, 752, 0, 0, 1);
  m.prop('carpet_stand', 720, 752, 0, 2, 0);
  b.decal({ kind: 'line', x: 708, y: 806, w: 84, h: 16, color: '#2a1c14', alpha: 0.95, layer: 'roof' }).decal({ kind: 'text', x: 750, y: 814, text: 'КОВРЫ', size: 9, color: '#f0d890', alpha: 0.95, layer: 'roof', font: 'sign' });

  // ── The south: the railing, the carpets along it, the parked cars ────────
  b.wall('fence_iron', 0, 980, W, 8);
  for (const x of [190, 330, 470]) m.prop('carpet_stand', x, 966, 0, (x / 10) % 3, (x / 10 + 1) % 3);
  m.prop('car_volga', 254, 917, 90, 1, 2);
  m.prop('ambulance', 470, 917, 90, 3, 2); // a beige minibus west, a grey one east
  b.decal({ kind: 'text', x: 750, y: 968, text: 'ВЫХОДА НЕТ', size: 7, color: '#d8d0bc', alpha: 0.35 });

  // ── The aisles: the parked Zhiguli by the west/east entrances, crates, tyres ─
  m.prop('car_zhiguli', 99, 622, 0, 1, 2);
  m.prop('tire_stack', 70, 404);
  m.prop('crate_wood', 128, 392);
  m.prop('sacks', 369, 448, 90);
  m.prop('barrel_rust', 342, 664);
  m.prop('crate_green', 396, 760);
  m.prop('trash_container', 602, 548, 90);

  // ── Lamps over the aisles ────────────────────────────────────────────────
  for (const [x, y] of [
    [99, 286],
    [99, 740],
    [369, 250],
    [369, 714],
    [582, 250],
    [582, 714],
  ] as const) {
    m.light(x, y, 150, SODIUM, 0.75, { fixture: 'street', flicker: y === 714 && x === 582 ? 'broken' : 'soft' });
  }
  b.light(750, 260, 170, SODIUM, 0.75, { fixture: 'street' });
  // neon over the two video stalls
  b.light(474, 232, 110, NEON, 0.6, { fixture: 'neon', flicker: 'soft' }).light(W - 234, 754, 110, 0x40c8ff, 0.6, { fixture: 'neon' });

  // ── Spawns: A west, B inside the gate, C east (each pair mirrored) ───────
  m.spawn(99, 500, 0);
  m.spawn(99, 170, 60);
  m.spawn(99, 840, -60);
  m.spawn(369, 92, 90);
  m.spawn(369, 918, -90);
  m.spawn(690, 104, 90);
  m.spawn(582, 918, -90);

  // ── Loot, first aid, «дефицит» drop points ───────────────────────────────
  b.pickup('avtomat', 750, 214, 20_000).pickup('avtomat', 750, 714, 20_000);
  m.pickup('obrez', 369, 286, 16_000);
  m.pickup('obrez', 369, 714, 16_000);
  m.pickup('avtomat', 99, 700, 20_000);
  m.medkit(582, 380, 22_000);
  m.medkit(99, 360, 22_000);
  b.medkit(750, 900, 20_000);
  b.supply(750, 500);
  m.supply(369, 500);
  m.supply(582, 600);

  // ── Capture the flag: deep in the west and east aisles; bases A, B, C ────
  b.flagStand(0, 99, 420).flagStand(1, W - 99, 420);
  b.base(369, 500).base(750, 520).base(W - 369, 500);
  return b.build();
}
