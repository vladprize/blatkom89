import { MapBuilder } from './builder.js';
import type { MapDef } from './types.js';

/**
 * «Больница» — City Hospital No. 3 at night, from the product owner's layout
 * (references/22-map-bolnica.png). Wards, the operating theatre, two staircases and the X-ray room
 * line a long corridor; the central hall with the registration desk and waiting benches joins the
 * north and south entrances; the emergency department and the pharmacy close the south wing.
 * More first-aid kits than anywhere else — it is a hospital. Spawns: A west, B north, C east.
 */
export function buildHospitalMap(): MapDef {
  const W = 1500;
  const H = 1000;
  const COLD = 0xd8f0ff;
  const PALE = 0xc8f0d8;
  const WARM = 0xffcf8a;
  const SODIUM = 0xffb04a;
  const ER = 0xff3a32;
  const XRAY = 0x60e0ff;
  const b = new MapBuilder(
    'hospital',
    'City Hospital No. 3',
    'The people’s health is the country’s wealth',
    'Wards, the operating theatre, X-ray and the pharmacy along one long corridor, with the registration hall in the middle. Tight rooms and an open corridor.',
    W,
    H,
    'asphalt_cracked',
  )
    .ambient(0x182232, 0.42)
    .minimap('#38403a');

  // ── Grounds ──────────────────────────────────────────────────────────────
  b.floor('grass', 12, 12, 188, 200)
    .floor('grass', 12, 620, 188, 364)
    .floor('grass', 1355, 560, 133, 240)
    .floor('paving', 340, 150, 1015, 75)
    .floor('paving', 200, 790, 1155, 194)
    .floor('asphalt', 12, 212, 188, 408)
    .floor('asphalt', 1355, 130, 133, 430);

  // ── Boundary ─────────────────────────────────────────────────────────────
  b.hwall('fence_chain', 0, 340, 0, 4)
    .vwall('fence_chain', 0, 0, H - 16, 4)
    .vwall('fence_chain', W - 4, 0, H - 16, 4)
    .hwall('fence_concrete', 0, W, H - 16, 16);

  // ── North: hospital blocks, the plaza, spawn B ───────────────────────────
  b.wall('roof_flat', 340, 0, 200, 110, 'wing_w')
    .wall('roof_flat', 540, 0, 590, 150, 'main')
    .wall('roof_flat', 1130, 0, 370, 118, 'wing_e');
  b.decal({ kind: 'line', x: 600, y: 54, w: 500, h: 38, color: '#d9c7a3', alpha: 0.92, layer: 'roof' })
    .decal({ kind: 'cross', x: 630, y: 73, r: 12, color: '#c8312a', alpha: 0.95 })
    .decal({ kind: 'text', x: 860, y: 73, text: 'ГОРОДСКАЯ БОЛЬНИЦА №3', size: 15, color: '#9e2a22', alpha: 0.95, layer: 'roof' })
    .decal({ kind: 'line', x: 1240, y: 36, w: 220, h: 60, color: '#d9c7a3', alpha: 0.9, layer: 'roof' })
    .decal({ kind: 'text', x: 1350, y: 56, text: 'ЗДОРОВЬЕ НАРОДА —', size: 9, color: '#9e2a22', alpha: 0.95, layer: 'roof' })
    .decal({ kind: 'text', x: 1350, y: 76, text: 'БОГАТСТВО СТРАНЫ!', size: 9, color: '#9e2a22', alpha: 0.95, layer: 'roof' });
  b.prop('planter', 732, 182)
    .prop('planter', 962, 182)
    .prop('bench', 1050, 176)
    .prop('bench', 640, 176)
    .prop('lamp_post', 780, 160)
    .prop('lamp_post', 920, 160)
    .prop('ambulance', 1380, 186, 90, 0)
    .prop('lamp_post', 1470, 140);
  b.decal({ kind: 'stairs', x: 812, y: 196, w: 76, h: 66 });
  b.light(780, 168, 150, WARM, 0.85, { fixture: 'street' })
    .light(920, 168, 150, WARM, 0.85, { fixture: 'street' })
    .light(1470, 148, 170, SODIUM, 0.8, { fixture: 'street' });
  b.spawn(850, 176, 90).spawn(1460, 260, 180);

  // ── Hospital shell ───────────────────────────────────────────────────────
  b.hwall('brick', 200, 1355, 225, 12, [[810, 890]])
    .vwall('brick', 200, 237, 778, 12, [[396, 432]])
    .vwall('brick', 1343, 237, 778, 12, [
      [396, 432],
      [540, 576],
    ])
    .hwall('brick', 200, 680, 778, 12, [[444, 504]])
    .vwall('brick', 680, 778, 870, 12)
    .hwall('brick', 680, 1030, 858, 12, [[790, 890]])
    .vwall('brick', 1018, 778, 870, 12)
    .hwall('brick', 1018, 1355, 778, 12);
  b.floor('tile_green', 212, 237, 1131, 541).floor('tile_green', 692, 778, 326, 80);
  b.decal({ kind: 'line', x: 690, y: 860, w: 330, h: 14, color: '#d9c7a3', alpha: 0.9, layer: 'roof' })
    .decal({ kind: 'text', x: 855, y: 867, text: 'БОЛЬНИЦА СПАСАЕТ ЖИЗНИ', size: 9, color: '#9e2a22', alpha: 0.95, layer: 'roof' });

  // ── North wing: operating theatre, washroom, stairs, wards ───────────────
  b.hwall('plaster', 212, 1343, 380, 8, [
    [396, 432],
    [470, 500],
    [540, 576],
    [690, 726],
    [800, 900],
    [976, 1012],
    [1100, 1136],
    [1200, 1236],
  ]);
  for (const x of [435, 520, 600, 800, 900, 1075, 1160]) b.vwall('plaster', x, 237, 380, 8);
  b.floor('tile_white', 212, 237, 223, 143).floor('tile_white', 443, 237, 77, 143).floor('concrete_painted', 528, 237, 72, 143).floor('concrete_painted', 1083, 237, 77, 143);
  // operating theatre
  b.prop('operating_table', 330, 310, 90)
    .prop('med_cabinet', 300, 246)
    .prop('med_cabinet', 400, 246)
    .prop('hospital_bed', 236, 300)
    .prop('iv_stand', 360, 280)
    .prop('stretcher', 410, 340, 90)
    .prop('xray', 250, 352, 0);
  b.decal({ kind: 'stain', x: 380, y: 330, r: 10, color: '#6a0e0a', alpha: 0.55, seed: 3 });
  // washroom and stairs 1
  b.prop('med_cabinet', 478, 246).prop('wheelchair', 490, 340);
  b.decal({ kind: 'stairs', x: 536, y: 250, w: 56, h: 90 })
    .decal({ kind: 'line', x: 540, y: 342, w: 48, h: 16, color: '#9e2a22', alpha: 0.85 })
    .decal({ kind: 'text', x: 564, y: 350, text: 'ЛЕСТНИЦА 1', size: 6, color: '#e8dcc0', alpha: 0.9 });
  // ward 1
  b.prop('hospital_bed', 640, 290).prop('hospital_bed', 710, 290).prop('med_screen', 676, 330, 90).prop('iv_stand', 740, 260).prop('file_cabinet', 780, 250, 90);
  // ward 2
  b.prop('desk', 960, 256)
    .prop('chair', 960, 272)
    .prop('hospital_bed', 1040, 290)
    .prop('med_screen', 1000, 330)
    .prop('med_screen', 920, 330)
    .prop('med_cabinet', 1050, 246);
  // stairs 2
  b.decal({ kind: 'stairs', x: 1091, y: 250, w: 56, h: 90 })
    .decal({ kind: 'line', x: 1094, y: 342, w: 50, h: 16, color: '#9e2a22', alpha: 0.85 })
    .decal({ kind: 'text', x: 1119, y: 350, text: 'ЛЕСТНИЦА 2', size: 6, color: '#e8dcc0', alpha: 0.9 });
  // ward 3
  b.prop('med_screen', 1220, 300, 90)
    .prop('med_screen', 1280, 300, 90)
    .prop('hospital_bed', 1250, 270)
    .prop('hospital_bed', 1312, 270)
    .prop('stretcher', 1320, 350, 90)
    .prop('iv_stand', 1190, 260);
  b.light(330, 300, 130, COLD, 0.95)
    .light(478, 300, 80, PALE, 0.6, { flicker: 'soft' })
    .light(560, 300, 80, COLD, 0.55)
    .light(700, 300, 120, PALE, 0.75)
    .light(990, 300, 120, PALE, 0.75, { flicker: 'soft' })
    .light(1118, 300, 80, COLD, 0.55)
    .light(1250, 300, 120, PALE, 0.7, { flicker: 'broken' });

  // ── Corridor ─────────────────────────────────────────────────────────────
  b.decal({ kind: 'cross', x: 850, y: 426, r: 14, color: '#9e2a22', alpha: 0.6 })
    .decal({ kind: 'cross', x: 850, y: 268, r: 10, color: '#9e2a22', alpha: 0.55 })
    .decal({ kind: 'stain', x: 620, y: 420, r: 12, color: '#6a0e0a', alpha: 0.5, seed: 7 })
    .decal({ kind: 'stain', x: 1180, y: 440, r: 9, color: '#6a0e0a', alpha: 0.5, seed: 11 });
  b.prop('bench_row', 300, 448).prop('plant_pot', 230, 448).prop('wheelchair', 1300, 444).prop('plant_pot', 1330, 400).prop('stretcher', 760, 420, 90);
  b.light(300, 420, 150, COLD, 0.7, { flicker: 'soft' })
    .light(600, 420, 150, COLD, 0.7)
    .light(1100, 420, 150, COLD, 0.7, { flicker: 'broken' })
    .light(1300, 420, 120, COLD, 0.65);

  // ── Middle row: X-ray, offices, the hall with the registration desk ──────
  b.hwall('plaster', 212, 688, 460, 8, [
    [260, 296],
    [420, 456],
    [620, 656],
  ])
    .hwall('plaster', 1022, 1343, 460, 8, [
      [1050, 1086],
      [1150, 1186],
      [1270, 1306],
    ])
    .vwall('plaster', 350, 460, 600, 8)
    .vwall('plaster', 540, 460, 600, 8)
    .vwall('plaster', 600, 460, 600, 8)
    .vwall('plaster', 1110, 460, 600, 8)
    .vwall('plaster', 1240, 460, 600, 8)
    .vwall('plaster', 680, 460, 778, 8, [
      [520, 556],
      [680, 716],
    ])
    .vwall('plaster', 1022, 460, 778, 8, [
      [520, 556],
      [680, 716],
    ])
    .hwall('plaster', 212, 688, 600, 8, [
      [290, 326],
      [560, 596],
    ])
    .hwall('plaster', 1022, 1343, 600, 8, [
      [1060, 1096],
      [1240, 1276],
    ]);
  b.floor('concrete_painted', 358, 468, 182, 132);
  b.prop('xray', 460, 520).prop('med_cabinet', 400, 476).prop('desk', 500, 580).prop('chair', 500, 564).prop('stretcher', 380, 560, 90);
  b.decal({ kind: 'line', x: 410, y: 588, w: 70, h: 12, color: '#1a3a40', alpha: 0.9 }).decal({ kind: 'text', x: 445, y: 594, text: 'РЕНТГЕН', size: 7, color: '#bfefff', alpha: 0.9 });
  b.prop('desk', 270, 520).prop('chair', 270, 536).prop('file_cabinet', 330, 480, 90).prop('med_cabinet', 640, 476, 90).prop('desk', 640, 560, 90);
  b.prop('desk', 1060, 520, 90).prop('med_cabinet', 1210, 476).prop('hospital_bed', 1200, 540).prop('desk', 1290, 500).prop('chair', 1290, 516).prop('file_cabinet', 1320, 580, 90);
  b.light(460, 530, 130, XRAY, 1.0, { fixture: 'none' })
    .light(280, 530, 90, WARM, 0.6)
    .light(640, 530, 80, COLD, 0.55)
    .light(1176, 530, 100, PALE, 0.6)
    .light(1290, 530, 100, WARM, 0.6, { flicker: 'soft' });
  // registration and waiting benches
  b.prop('counter', 800, 560, 0, 2)
    .prop('counter', 850, 560, 0, 2)
    .prop('counter', 900, 560, 0, 2)
    .prop('counter', 776, 520, 90, 2)
    .prop('counter', 924, 520, 90, 2)
    .prop('file_cabinet', 830, 486)
    .prop('file_cabinet', 870, 486)
    .prop('bench_row', 790, 640)
    .prop('bench_row', 910, 640)
    .prop('bench_row', 790, 684)
    .prop('bench_row', 910, 684)
    .prop('bench_row', 790, 728)
    .prop('bench_row', 910, 728)
    .prop('plant_pot', 704, 640)
    .prop('plant_pot', 996, 640)
    .prop('plant_pot', 704, 760)
    .prop('plant_pot', 996, 760);
  b.decal({ kind: 'line', x: 790, y: 590, w: 120, h: 14, color: '#d9c7a3', alpha: 0.9 }).decal({ kind: 'text', x: 850, y: 597, text: 'РЕГИСТРАТУРА', size: 8, color: '#9e2a22', alpha: 0.95 });
  b.light(850, 520, 140, WARM, 0.9).light(850, 690, 170, PALE, 0.7).light(850, 820, 120, WARM, 0.8);

  // ── South row: emergency, wards, pharmacy ────────────────────────────────
  b.vwall('plaster', 540, 600, 778, 8, [[680, 716]]).vwall('plaster', 1180, 600, 778, 8, [[690, 726]]);
  b.prop('hospital_bed', 260, 690)
    .prop('hospital_bed', 320, 690)
    .prop('stretcher', 400, 700)
    .prop('med_screen', 290, 740)
    .prop('med_cabinet', 480, 616)
    .prop('iv_stand', 360, 650)
    .prop('wheelchair', 500, 740);
  b.decal({ kind: 'line', x: 330, y: 610, w: 110, h: 14, color: '#7a1c16', alpha: 0.95 })
    .decal({ kind: 'text', x: 385, y: 617, text: 'ПРИЁМНОЕ ОТДЕЛЕНИЕ', size: 6, color: '#e8dcc0', alpha: 0.95 })
    .decal({ kind: 'stain', x: 350, y: 720, r: 14, color: '#6a0e0a', alpha: 0.55, seed: 13 })
    .decal({ kind: 'stairs', x: 444, y: 790, w: 60, h: 44 });
  b.prop('hospital_bed', 580, 660).prop('med_cabinet', 650, 616).prop('iv_stand', 610, 700);
  b.prop('hospital_bed', 1060, 660).prop('med_cabinet', 1130, 616).prop('med_screen', 1100, 720);
  b.floor('linoleum_checker', 1188, 608, 155, 170);
  b.prop('shelf', 1230, 616, 0, 2)
    .prop('shelf', 1274, 616, 0, 2)
    .prop('shelf', 1318, 650, 90, 2)
    .prop('counter', 1240, 700, 0, 2)
    .prop('counter', 1290, 700, 0, 2);
  b.decal({ kind: 'line', x: 1220, y: 740, w: 80, h: 14, color: '#2a4a3a', alpha: 0.9 }).decal({ kind: 'text', x: 1260, y: 747, text: 'АПТЕКА', size: 8, color: '#e8dcc0', alpha: 0.95 });
  b.light(370, 690, 170, ER, 1.0, { flicker: 'soft' })
    .light(610, 690, 90, PALE, 0.55)
    .light(1100, 690, 90, PALE, 0.55, { flicker: 'broken' })
    .light(1270, 680, 120, COLD, 0.8);

  // ── Outside: west yard, south square, east yard ──────────────────────────
  b.prop('container', 120, 300, 0, 3)
    .prop('kiosk', 160, 490, 90)
    .prop('trash_container', 60, 420)
    .prop('lamp_post', 180, 240)
    .prop('lamp_post', 180, 600)
    .prop('ambulance', 470, 890, 90, 0)
    .prop('stretcher', 300, 850)
    .prop('bench', 600, 950)
    .prop('planter', 720, 920)
    .prop('planter', 980, 920)
    .prop('lamp_post', 640, 800)
    .prop('lamp_post', 1060, 800)
    .prop('bench', 1160, 950)
    .prop('container', 1410, 340, 0, 3)
    .prop('crate_wood', 1400, 420)
    .prop('crate_wood', 1417, 420)
    .prop('barrel_blue', 1400, 450)
    .prop('barrel_blue', 1416, 462)
    .prop('tent', 1452, 680)
    .prop('crate_stack', 1460, 760)
    .prop('car_volga', 1380, 870, 90, 2)
    .prop('lamp_post', 1370, 600);
  b.decal({ kind: 'stairs', x: 790, y: 872, w: 100, h: 56 });
  b.tree(110, 110, 64, 1)
    .tree(60, 700, 72, 2)
    .tree(150, 860, 64, 3)
    .tree(330, 940, 56, 4)
    .tree(1250, 930, 64, 5)
    .tree(1460, 560, 56, 6)
    .tree(1470, 920, 56, 7)
    .tree(440, 140, 56, 8)
    .tree(1100, 940, 48, 9);
  b.light(180, 248, 170, SODIUM, 0.8, { fixture: 'street' })
    .light(180, 608, 170, SODIUM, 0.75, { fixture: 'street', flicker: 'soft' })
    .light(640, 808, 160, SODIUM, 0.8, { fixture: 'street' })
    .light(1060, 808, 160, SODIUM, 0.8, { fixture: 'street' })
    .light(1370, 608, 170, SODIUM, 0.75, { fixture: 'street' })
    .light(470, 880, 100, ER, 0.6, { flicker: 'soft', fixture: 'none' });
  b.spawn(98, 540, 0).spawn(1427, 520, 180).spawn(100, 130, 45).spawn(300, 930, -45).spawn(1200, 900, -90).spawn(1450, 960, -135);

  // ── Loot, first aid (plenty), «дефицит» drop points ──────────────────────
  b.pickup('obrez', 365, 352, 16_000)
    .pickup('avtomat', 660, 340, 20_000)
    .pickup('obrez', 990, 350, 16_000)
    .pickup('avtomat', 1290, 350, 20_000)
    .pickup('obrez', 510, 520, 16_000)
    .pickup('avtomat', 1160, 560, 20_000)
    .pickup('obrez', 440, 680, 16_000)
    .pickup('avtomat', 1230, 745, 20_000)
    .pickup('obrez', 110, 700, 16_000)
    .pickup('avtomat', 1440, 820, 20_000);
  b.medkit(1280, 655, 18_000).medkit(250, 260, 18_000).medkit(620, 740, 20_000).medkit(1000, 430, 20_000).medkit(1452, 732, 20_000).medkit(850, 610, 20_000);
  b.supply(850, 460).supply(300, 410).supply(1250, 420).supply(720, 960).supply(120, 400).supply(1440, 500);

  return b.build();
}
