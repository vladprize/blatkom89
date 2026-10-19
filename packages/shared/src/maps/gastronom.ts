import { MapBuilder } from './builder.js';
import type { MapDef } from './types.js';

/**
 * «Гастроном» — the neighbourhood grocery store after closing, from the product owner's layout
 * (references/21-map-gastronom.png). Long aisles of shelves and refrigerated counters split the
 * sales floor; the bakery, the butcher’s and the deli counters, the warehouse «Склад», the staff room and
 * the loading dock wrap around it. Spawns: A west (yard), B north (entrance), C east (yard).
 */
export function buildGastronomMap(): MapDef {
  const W = 1500;
  const H = 1000;
  const WARM = 0xffcf8a;
  const SHOP = 0xffe6b0;
  const COLD = 0xd8ecff;
  const SODIUM = 0xffb04a;
  const NEON = 0xff4a3a;
  const b = new MapBuilder(
    'gastronom',
    'Gastronom',
    'Groceries · drinks · always nearby',
    'A sales floor of shelves and counters, the bakery, the butcher’s and the deli, the warehouse and the loading dock. Narrow aisles and ambushes behind the counters.',
    W,
    H,
    'asphalt',
  )
    .ambient(0x1a2236, 0.42)
    .minimap('#3e3830');

  // ── Street, yards ────────────────────────────────────────────────────────
  b.floor('paving', 330, 140, 1000, 56)
    .floor('asphalt_cracked', 12, 196, 224, 790)
    .floor('asphalt_cracked', 1300, 560, 188, 426)
    .floor('asphalt', 336, 800, 1000, 186)
    .floor('grass', 1300, 196, 188, 60);

  // ── Boundary ─────────────────────────────────────────────────────────────
  b.hwall('fence_concrete', 0, 330, 0, 12)
    .hwall('fence_concrete', 1260, W, 0, 12)
    .vwall('fence_concrete', 0, 12, H - 16, 12)
    .vwall('fence_concrete', W - 12, 12, H - 16, 12)
    .hwall('fence_concrete', 0, W, H - 16, 16);

  // ── North: the block with the sign, the pavement, spawn B ────────────────
  b.wall('roof_flat', 330, 0, 170, 140, 'house')
    .wall('roof_flat', 500, 0, 760, 140, 'gastronom');
  b.decal({ kind: 'line', x: 560, y: 16, w: 680, h: 34, color: '#7a1c16', alpha: 0.95, layer: 'roof' })
    .decal({ kind: 'text', x: 720, y: 33, text: 'ГАСТРОНОМ', size: 22, color: '#e8dcc0', alpha: 0.95, layer: 'roof' })
    .decal({ kind: 'text', x: 1050, y: 33, text: 'ПРОДУКТЫ · НАПИТКИ · ВСЕГДА РЯДОМ', size: 7, color: '#e8dcc0', alpha: 0.8, layer: 'roof' })
    .decal({ kind: 'line', x: 1290, y: 40, w: 170, h: 70, color: '#8a2a20', alpha: 0.9 });
  b.wall('concrete', 1290, 108, 170, 8, 'billboard');
  b.decal({ kind: 'text', x: 1375, y: 75, text: 'ВКУСНО · ПОЛЕЗНО · ДОСТУПНО', size: 7, color: '#e8dcc0', alpha: 0.85 });
  b.prop('soda_machine', 560, 150)
    .prop('soda_machine', 580, 150)
    .prop('soda_machine', 1040, 150)
    .prop('soda_machine', 1060, 150)
    .prop('bench', 680, 156)
    .prop('lamp_post', 640, 186)
    .prop('lamp_post', 1100, 186)
    .prop('car_zhiguli', 1400, 216, 90, 3)
    .prop('truck', 130, 250, 90);
  b.tree(1340, 150, 56, 2).tree(1460, 250, 56, 3).tree(560, 970, 48, 4).tree(300, 960, 56, 5).tree(1240, 960, 64, 6);
  b.light(640, 194, 170, SODIUM, 0.85, { fixture: 'street' }).light(1100, 194, 170, SODIUM, 0.85, { fixture: 'street', flicker: 'soft' });
  b.spawn(850, 170, 90).spawn(1460, 150, 135);

  // ── Store shell ──────────────────────────────────────────────────────────
  b.hwall('brick', 236, 1312, 196, 12, [[826, 906]])
    .vwall('brick', 236, 196, 286, 12)
    .hwall('brick', 140, 248, 286, 12)
    .vwall('brick', 140, 286, 660, 12, [
      [330, 366],
      [600, 636],
    ])
    .hwall('brick', 140, 340, 660, 12)
    .vwall('brick', 328, 660, 802, 12)
    .hwall('brick', 328, 1290, 790, 12, [
      [430, 500],
      [660, 712],
      [1240, 1276],
    ])
    .vwall('brick', 1278, 600, 802, 12)
    .hwall('brick', 1278, 1312, 600, 12)
    .vwall('brick', 1300, 196, 612, 12, [[380, 416]])
    .hwall('brick', 1300, 1440, 266, 12)
    .vwall('brick', 1428, 266, 542, 12)
    .hwall('brick', 1300, 1440, 530, 12, [[1360, 1396]]);
  b.floor('tile_beige', 248, 208, 1052, 392).floor('tile_beige', 640, 600, 360, 190);

  // ── North rooms: storage, offices, the butcher's ─────────────────────────
  b.hwall('plaster', 248, 630, 300, 8, [
    [362, 398],
    [440, 476],
    [560, 596],
  ])
    .vwall('plaster', 405, 208, 300, 8)
    .vwall('plaster', 505, 208, 300, 8)
    .vwall('plaster', 630, 208, 308, 8)
    .vwall('plaster', 1040, 208, 308, 8)
    .hwall('plaster', 1040, 1300, 300, 8, [[1180, 1220]]);
  b.floor('concrete_dirty', 248, 208, 157, 92)
    .floor('linoleum_checker', 413, 208, 92, 92)
    .floor('wood', 513, 208, 117, 92)
    .floor('carpet_red', 1048, 208, 252, 92);
  b.prop('sacks', 270, 236)
    .prop('sacks', 270, 260)
    .prop('sacks', 296, 236)
    .prop('crate_stack', 360, 240)
    .prop('crate_wood', 390, 224)
    .prop('desk', 456, 236)
    .prop('chair', 456, 252)
    .prop('file_cabinet', 490, 280, 90)
    .prop('desk', 570, 240)
    .prop('chair', 570, 256)
    .prop('shelf', 590, 214, 0, 5)
    .prop('counter', 1100, 238, 0, 1)
    .prop('counter', 1152, 238, 0, 1)
    .prop('fridge_case', 1250, 230, 0, 0)
    .prop('crate_wood', 1280, 280);
  b.decal({ kind: 'text', x: 1170, y: 220, text: 'МЯСО', size: 8, color: '#e8dcc0', alpha: 0.55 });
  b.light(320, 254, 100, WARM, 0.6, { flicker: 'soft' })
    .light(456, 254, 90, WARM, 0.7)
    .light(570, 254, 90, WARM, 0.75)
    .light(1170, 254, 120, 0xffd0b0, 0.8);

  // ── Sales floor: checkouts, aisles, counters ─────────────────────────────
  b.prop('cash_desk', 712, 336)
    .prop('counter', 756, 336, 0, 0)
    .prop('cash_desk', 902, 336)
    .prop('counter', 946, 336, 0, 0)
    .prop('fridge_case', 560, 352, 0, 1)
    .prop('fridge_case', 1110, 336, 0, 1)
    .prop('fridge_case', 1158, 336, 0, 2);
  b.decal({ kind: 'text', x: 712, y: 316, text: '1', size: 10, color: '#e8dcc0', alpha: 0.7 }).decal({ kind: 'text', x: 902, y: 316, text: '2', size: 10, color: '#e8dcc0', alpha: 0.7 });
  // bakery «Хлеб» along the west wall
  b.prop('shelf', 290, 316, 0, 4)
    .prop('shelf', 334, 316, 0, 4)
    .prop('counter', 300, 370, 0, 0)
    .prop('counter', 352, 370, 0, 0);
  b.decal({ kind: 'line', x: 262, y: 386, w: 120, h: 14, color: '#7a1c16', alpha: 0.85 }).decal({ kind: 'text', x: 322, y: 393, text: 'ХЛЕБ', size: 9, color: '#e8dcc0', alpha: 0.9 });
  // aisles
  // shelf variants: 0 tins and jars, 1 bottles, 5 packets and boxes (2 pharmacy, 3 books, 4 bread)
  const AISLE: Array<[number, number, number]> = [
    [0, 5, 1],
    [1, 0, 5],
    [5, 1, 0],
    [0, 1, 5],
    [1, 5, 0],
  ];
  [660, 750, 840, 930, 1020].forEach((x, i) => {
    const [a, c, d] = AISLE[i]!;
    b.prop('shelf', x, 404, 90, a).prop('shelf', x, 448, 90, c).prop('shelf', x, 492, 90, d);
  });
  b.prop('shelf', 300, 440, 0, 1)
    .prop('shelf', 344, 440, 0, 0)
    .prop('shelf', 500, 410, 0, 5)
    .prop('shelf', 544, 410, 0, 0)
    .prop('fridge_case', 500, 476, 0, 1)
    .prop('fridge_case', 548, 476, 0, 2)
    .prop('fridge_case', 470, 580, 0, 0)
    .prop('fridge_case', 518, 580, 0, 1)
    .prop('shelf', 1140, 420, 0, 1)
    .prop('shelf', 1184, 420, 0, 0)
    .prop('fridge_case', 1150, 520, 0, 1)
    .prop('fridge_case', 1198, 520, 0, 0)
    .prop('shelf', 700, 572, 0, 5)
    .prop('shelf', 744, 572, 0, 0)
    .prop('shelf', 900, 572, 0, 1)
    .prop('shelf', 944, 572, 0, 5)
    .prop('shelf', 1260, 404, 90, 1)
    .prop('shelf', 1260, 448, 90, 0)
    .prop('shelf', 420, 520, 90, 5)
    .prop('shelf', 420, 476, 90, 1)
    .prop('crate_wood', 600, 560)
    .prop('crate_wood', 1256, 360)
    .prop('plant_pot', 1280, 580);
  b.light(500, 450, 170, SHOP, 0.75)
    .light(750, 450, 180, SHOP, 0.8, { flicker: 'soft' })
    .light(930, 450, 180, SHOP, 0.8)
    .light(1180, 460, 170, SHOP, 0.75)
    .light(830, 300, 160, SHOP, 0.85)
    .light(300, 360, 110, WARM, 0.8);

  // ── South departments: freezers, vegetables, «Колбасы», the dock ─────────
  b.vwall('plaster', 640, 600, 790, 8, [[640, 680]])
    .hwall('plaster', 1000, 1278, 600, 8, [[1030, 1070]])
    .vwall('plaster', 995, 600, 790, 8, [[700, 740]]);
  b.prop('fridge_case', 690, 640, 0, 2)
    .prop('fridge_case', 738, 640, 0, 0)
    .prop('fridge_case', 690, 700, 0, 1)
    .prop('fridge_case', 738, 700, 0, 2)
    .prop('fridge_case', 786, 700, 0, 0)
    .prop('fridge_case', 660, 760, 90, 1)
    .prop('produce_stall', 880, 650)
    .prop('produce_stall', 940, 650)
    .prop('produce_stall', 910, 700);
  b.decal({ kind: 'line', x: 856, y: 612, w: 120, h: 16, color: '#3a5a2a', alpha: 0.9 })
    .decal({ kind: 'text', x: 916, y: 620, text: 'ОВОЩИ ФРУКТЫ', size: 8, color: '#e8dcc0', alpha: 0.9 });
  b.floor('tile_beige', 1003, 608, 275, 182).floor('carpet_red', 1003, 700, 275, 90);
  b.prop('counter', 1100, 676, 0, 1)
    .prop('counter', 1152, 676, 0, 1)
    .prop('counter', 1204, 676, 0, 1)
    .prop('shelf', 1150, 640, 0, 0)
    .prop('crate_wood', 1260, 640)
    .prop('sacks', 1030, 640);
  b.decal({ kind: 'line', x: 1100, y: 606, w: 120, h: 14, color: '#7a1c16', alpha: 0.9 }).decal({ kind: 'text', x: 1160, y: 613, text: 'КОЛБАСЫ', size: 9, color: '#e8dcc0', alpha: 0.95 });
  b.light(740, 690, 150, COLD, 0.8)
    .light(910, 670, 120, WARM, 0.75)
    .light(1150, 700, 150, 0xffc8a0, 0.85)
    .light(1240, 760, 80, NEON, 0.7, { flicker: 'broken', fixture: 'neon' });

  // warehouse «Склад» and the west rooms
  b.hwall('plaster', 148, 236, 420, 8, [[170, 206]])
    .hwall('plaster', 148, 248, 530, 8, [[190, 226]])
    .vwall('plaster', 236, 286, 530, 8, [[380, 416]])
    .vwall('plaster', 248, 530, 660, 8, [[600, 636]]);
  b.floor('linoleum_checker', 152, 298, 84, 122).floor('concrete_dirty', 152, 428, 96, 232);
  b.prop('desk', 190, 330).prop('chair', 190, 346).prop('file_cabinet', 162, 400, 90).prop('crate_stack', 180, 470).prop('sacks', 220, 500).prop('crate_wood', 170, 600).prop('crate_wood', 187, 600).prop('sacks', 214, 630);
  b.decal({ kind: 'text', x: 290, y: 560, text: 'СКЛАД', size: 12, color: '#d9c7a3', alpha: 0.6 });
  b.light(190, 356, 90, WARM, 0.7).light(200, 560, 110, WARM, 0.65, { flicker: 'soft' });

  // loading dock (inside the south-west corner of the compound)
  b.floor('concrete_slab', 340, 612, 300, 178);
  b.hwall('fence_chain', 340, 640, 612, 4, [[440, 520]]);
  b.prop('forklift', 380, 700, 90)
    .prop('crate_stack', 470, 660)
    .prop('crate_stack', 506, 660)
    .prop('sacks', 560, 700)
    .prop('pallet', 600, 740)
    .prop('barrel_blue', 360, 640)
    .prop('crate_green', 520, 740);
  b.decal({ kind: 'hazard', x: 430, y: 786, w: 70, h: 6, alpha: 0.8 });
  b.light(480, 700, 160, SODIUM, 0.8, { flicker: 'soft' });

  // staff room «Служебное помещение»
  b.floor('linoleum_checker', 1312, 278, 116, 252);
  b.prop('locker_row', 1370, 286).prop('desk', 1380, 360).prop('chair', 1380, 376).prop('crate_wood', 1406, 470).prop('crate_wood', 1406, 487).prop('file_cabinet', 1324, 320, 90);
  b.decal({ kind: 'stairs', x: 1316, y: 470, w: 36, h: 54 }).decal({ kind: 'text', x: 1370, y: 420, text: 'СЛУЖЕБНОЕ', size: 8, color: '#d9c7a3', alpha: 0.6 });
  b.light(1370, 380, 110, WARM, 0.75);

  // ── Outside: west yard, east yard, south parking ─────────────────────────
  b.prop('kiosk', 120, 455, 90)
    .prop('crate_stack', 40, 490)
    .prop('crate_wood', 36, 530)
    .prop('trash_container', 60, 700)
    .prop('lamp_post', 100, 760)
    .prop('crate_stack', 1470, 620)
    .prop('crate_stack', 1470, 656)
    .prop('crate_stack', 1470, 740)
    .prop('pallet', 1460, 800)
    .prop('barrel_red', 1336, 640)
    .prop('barrel_red', 1352, 652)
    .prop('lamp_post', 1340, 580)
    .prop('truck', 995, 890, 90)
    .prop('ambulance', 365, 880, 0, 2)
    .prop('pallet', 460, 880)
    .prop('pallet', 460, 906)
    .prop('crate_wood', 600, 880)
    .prop('crate_wood', 617, 880)
    .prop('lamp_post', 760, 840)
    .prop('lamp_post', 1220, 850)
    .prop('trash_container', 1160, 940);
  b.decal({ kind: 'dashrect', x: 860, y: 830, w: 260, h: 120, color: '#d9c7a3', alpha: 0.35 })
    .decal({ kind: 'line', x: 336, y: 822, w: 1000, h: 3, color: '#d9c7a3', alpha: 0.25 })
    .decal({ kind: 'stain', x: 1000, y: 920, r: 30, color: '#0f0d0b', alpha: 0.5, seed: 8 });
  b.light(100, 768, 180, SODIUM, 0.8, { fixture: 'street' })
    .light(1340, 588, 180, SODIUM, 0.8, { fixture: 'street' })
    .light(760, 848, 190, SODIUM, 0.85, { fixture: 'street' })
    .light(1220, 858, 180, SODIUM, 0.75, { fixture: 'street', flicker: 'soft' })
    .light(130, 300, 150, SODIUM, 0.6, { fixture: 'none' });
  b.spawn(108, 590, 0).spawn(1380, 600, 180).spawn(100, 920, -45).spawn(720, 930, -90).spawn(1440, 930, -135);

  // ── Loot, first aid, «дефицит» drop points ───────────────────────────────
  b.pickup('obrez', 330, 280, 16_000)
    .pickup('avtomat', 600, 270, 20_000)
    .pickup('obrez', 1220, 270, 16_000)
    .pickup('avtomat', 705, 450, 20_000)
    .pickup('obrez', 975, 450, 16_000)
    .pickup('avtomat', 1370, 440, 20_000)
    .pickup('obrez', 200, 560, 16_000)
    .pickup('avtomat', 600, 660, 20_000)
    .pickup('obrez', 1110, 750, 16_000)
    .pickup('avtomat', 820, 930, 20_000);
  b.medkit(190, 380).medkit(1400, 330).medkit(700, 750).medkit(560, 930);
  b.supply(840, 530).supply(1200, 470).supply(420, 560).supply(700, 880).supply(1380, 760).supply(90, 650);

  // more spawn points for 10-player rooms: seven on each half (team matches start on their own half)
  b.spawn(284, 36, 45).spawn(548, 516, 0).spawn(964, 612, -135).spawn(412, 828, -45).spawn(1076, 956, -135).spawn(36, 260, 0).spawn(1156, 276, 135);
  return b.build();
}
