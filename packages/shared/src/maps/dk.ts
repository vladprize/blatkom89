import { MapBuilder } from './builder.js';
import type { MapDef } from './types.js';

/**
 * «Дом культуры» — the district house of culture after hours, from the product owner's layout
 * (references/20-map-dom-kultury.png). The auditorium with its stage and rows of seats is the
 * centre; club rooms, the café and the billiard room form the west wing, dressing and costume
 * rooms the east wing; the foyer with the bust and the cloakroom opens to the south portico.
 * Spawns: A west (park), B north (stage entrance), C east (yard).
 */
export function buildDkMap(): MapDef {
  const W = 1500;
  const H = 1000;
  const WARM = 0xffcf8a;
  const LAMP = 0xffb860;
  const SODIUM = 0xffb04a;
  const STAGE = 0xff8a5a;
  const b = new MapBuilder(
    'dk',
    'House of Culture',
    'Art belongs to the people',
    'An auditorium with rows of seats, the stage, dressing rooms, a café and a billiard room. Doors, corridors and long lines of fire.',
    W,
    H,
    'paving',
  )
    .ambient(0x1a2032, 0.42)
    .minimap('#3c3430');

  // ── Grounds: park, plazas, garden ────────────────────────────────────────
  b.floor('grass', 12, 12, 238, 280)
    .floor('grass', 12, 640, 230, 344)
    .floor('grass', 1350, 600, 138, 384)
    .floor('grass', 1400, 12, 88, 230)
    .floor('asphalt', 20, 300, 230, 330) // west drive (bus, vans)
    .floor('asphalt', 1350, 250, 138, 340) // east yard
    .floor('paving', 250, 96, 1150, 94) // north plaza
    .floor('paving', 250, 870, 1100, 114) // south square
    .floor('carpet_red', 800, 870, 60, 114);

  // ── Boundary ─────────────────────────────────────────────────────────────
  b.hwall('fence_concrete', 0, 300, 0, 12)
    .hwall('fence_concrete', 1400, W, 0, 12)
    .vwall('fence_concrete', 0, 12, H - 16, 12)
    .vwall('fence_concrete', W - 12, 12, H - 16, 12)
    .hwall('fence_concrete', 0, W, H - 16, 16);

  // ── North: the facade row with the sign, plaza, spawn B ──────────────────
  b.wall('roof_flat', 300, 0, 200, 96, 'dk_west')
    .wall('roof_flat', 500, 0, 710, 90, 'dk_facade')
    .wall('roof_flat', 1210, 0, 190, 96, 'dk_east');
  b.decal({ kind: 'line', x: 640, y: 14, w: 380, h: 30, color: '#7a1c16', alpha: 0.95, layer: 'roof' })
    .decal({ kind: 'text', x: 830, y: 30, text: 'ДОМ КУЛЬТУРЫ', size: 20, color: '#e8dcc0', alpha: 0.95, layer: 'roof' })
    .decal({ kind: 'line', x: 520, y: 30, w: 70, h: 52, color: '#8a2a20', alpha: 0.85, layer: 'roof' })
    .decal({ kind: 'text', x: 555, y: 66, text: 'КУЛЬТУРА ОБЪЕДИНЯЕТ', size: 6, color: '#e8dcc0', alpha: 0.85, layer: 'roof' })
    .decal({ kind: 'line', x: 1040, y: 24, w: 160, h: 58, color: '#8a2a20', alpha: 0.85, layer: 'roof' })
    .decal({ kind: 'text', x: 1120, y: 52, text: 'ИСКУССТВО НАРОДУ!', size: 11, color: '#e8dcc0', alpha: 0.9, layer: 'roof' });
  b.decal({ kind: 'stairs', x: 700, y: 112, w: 220, h: 64 });
  b.prop('planter', 672, 150)
    .prop('planter', 950, 150)
    .prop('statue', 430, 150)
    .prop('bench', 560, 170)
    .prop('bench', 1090, 170)
    .prop('lamp_post', 650, 104)
    .prop('lamp_post', 970, 104)
    .prop('trash_container', 1260, 128)
    .prop('container', 1240, 160, 90, 3);
  b.light(650, 112, 170, LAMP, 0.9, { fixture: 'street' })
    .light(970, 112, 170, LAMP, 0.9, { fixture: 'street' })
    .light(430, 150, 120, WARM, 0.55, { fixture: 'none' });
  b.spawn(820, 132, 90).spawn(1440, 140, 135);

  // ── West park: the bus, vans, spawn A ────────────────────────────────────
  b.prop('bus_paz', 130, 330, 90)
    .prop('truck', 46, 520)
    .prop('crate_wood', 210, 420)
    .prop('crate_wood', 210, 437)
    .prop('bench', 160, 600)
    .prop('lamp_post', 236, 270)
    .prop('lamp_post', 236, 620)
    .prop('trash_container', 196, 250);
  b.tree(120, 120, 64, 1)
    .tree(220, 60, 56, 2)
    .tree(60, 230, 56, 3)
    .tree(90, 700, 72, 4)
    .tree(180, 780, 56, 5)
    .tree(70, 900, 64, 6)
    .tree(410, 70, 56, 7);
  b.light(236, 278, 180, SODIUM, 0.8, { fixture: 'street' }).light(236, 628, 180, SODIUM, 0.8, { fixture: 'street', flicker: 'soft' });
  b.spawn(158, 480, 0).spawn(120, 170, 45).spawn(130, 930, -45);

  // ── Building shell ───────────────────────────────────────────────────────
  b.hwall('brick', 250, 512, 236, 12)
    .vwall('brick', 500, 190, 248, 12)
    .hwall('brick', 500, 1110, 190, 12, [[790, 850]])
    .vwall('brick', 1098, 190, 228, 12)
    .hwall('brick', 1098, 1340, 216, 12)
    .vwall('brick', 250, 236, 800, 12, [
      [380, 416],
      [610, 646],
    ])
    .hwall('brick', 250, 512, 788, 12, [[384, 430]])
    .vwall('brick', 500, 788, 870, 12)
    .hwall('brick', 500, 1030, 858, 12, [[792, 868]])
    .vwall('brick', 1018, 700, 870, 12, [[760, 796]])
    .hwall('brick', 1018, 1340, 688, 12, [[1240, 1276]])
    .vwall('brick', 1328, 216, 700, 12, [
      [430, 466],
      [590, 626],
    ]);

  // ── Stage and backstage ──────────────────────────────────────────────────
  b.floor('parquet', 512, 202, 586, 418) // hall
    .floor('wood', 640, 202, 380, 128) // stage
    .floor('linoleum_checker', 512, 202, 128, 128)
    .floor('concrete_painted', 1020, 202, 78, 128);
  b.vwall('plaster', 640, 202, 330, 8, [[284, 320]])
    .hwall('plaster', 512, 648, 330, 8, [[530, 566]])
    .vwall('plaster', 1012, 202, 330, 8, [[284, 320]])
    .hwall('plaster', 1012, 1098, 330, 8, [[1040, 1076]]);
  for (const x of [664, 712, 760, 880, 928, 976]) b.prop('curtain', x, 212);
  b.decal({ kind: 'line', x: 744, y: 222, w: 172, h: 18, color: '#9e2a22', alpha: 0.95, layer: 'roof' })
    .decal({ kind: 'text', x: 830, y: 231, text: 'СЛАВА ТРУДУ!', size: 12, color: '#e8dcc0', alpha: 0.95, layer: 'roof' })
    .decal({ kind: 'line', x: 640, y: 326, w: 372, h: 4, color: '#d9c7a3', alpha: 0.5 });
  b.prop('drum_kit', 830, 268)
    .prop('stage_speaker', 726, 296)
    .prop('stage_speaker', 940, 296)
    .prop('stage_speaker', 990, 250)
    .prop('piano', 690, 252)
    .prop('desk', 560, 240)
    .prop('chair', 560, 258)
    .prop('file_cabinet', 600, 214)
    .prop('crate_wood', 526, 228)
    .prop('crate_wood', 1040, 230)
    .prop('chair', 1070, 290)
    .prop('locker_row', 1056, 214);
  b.light(830, 280, 210, STAGE, 1.0, { fixture: 'none' })
    .light(720, 270, 120, 0xffd090, 0.8, { fixture: 'none' })
    .light(940, 270, 120, 0xffd090, 0.8, { fixture: 'none' })
    .light(576, 266, 100, WARM, 0.7)
    .light(1055, 266, 90, WARM, 0.6, { flicker: 'soft' });

  // ── Auditorium: rows of seats, aisles, the sound desk ────────────────────
  b.vwall('plaster', 560, 338, 620, 8, [
    [400, 440],
    [540, 580],
  ]).vwall('plaster', 1092, 338, 620, 8, [
    [400, 440],
    [540, 580],
  ]);
  b.hwall('plaster', 568, 1092, 620, 8, [[800, 860]]);
  for (let i = 0; i < 7; i++) {
    const y = 394 + i * 22;
    b.prop('theater_seats', 726, y).prop('theater_seats', 782, y).prop('theater_seats', 878, y).prop('theater_seats', 934, y);
  }
  b.prop('theater_seats', 655, 420, 90).prop('theater_seats', 655, 486, 90).prop('theater_seats', 1005, 420, 90).prop('theater_seats', 1005, 486, 90);
  b.prop('mixing_desk', 830, 576)
    .prop('chair', 830, 592)
    .prop('cafe_table', 600, 360)
    .prop('cafe_table', 1056, 360)
    .prop('plant_pot', 580, 604)
    .prop('plant_pot', 1076, 604);
  b.decal({ kind: 'line', x: 812, y: 340, w: 36, h: 276, color: '#7a1c16', alpha: 0.6 });
  b.light(700, 470, 150, WARM, 0.55).light(960, 470, 150, WARM, 0.55).light(830, 560, 110, 0xffe0a0, 0.7);

  // ── West wing: club rooms, café, billiards, lounge ───────────────────────
  b.floor('linoleum_checker', 262, 248, 238, 102)
    .floor('wood', 262, 358, 238, 102)
    .floor('carpet_red', 262, 468, 238, 112)
    .floor('parquet', 262, 588, 238, 200)
    .floor('carpet_red', 512, 338, 48, 282);
  b.vwall('plaster', 492, 248, 620, 8, [
    [270, 306],
    [400, 436],
    [520, 556],
  ]);
  b.hwall('plaster', 262, 492, 350, 8, [
    [300, 336],
    [430, 466],
  ])
    .vwall('plaster', 380, 248, 350, 8, [[290, 326]])
    .hwall('plaster', 262, 492, 460, 8, [[440, 476]])
    .hwall('plaster', 262, 492, 580, 8, [[300, 336]]);
  b.decal({ kind: 'stairs', x: 516, y: 450, w: 40, h: 56 });
  // club room and library
  b.prop('desk', 320, 296).prop('chair', 304, 312).prop('chair', 336, 312).prop('file_cabinet', 276, 262, 90).prop('shelf', 440, 258, 0, 3).prop('sofa', 440, 310);
  // café
  b.prop('counter', 330, 446, 0, 0)
    .prop('cafe_table', 330, 420)
    .prop('cafe_table', 390, 400)
    .prop('cafe_table', 450, 430)
    .prop('cafe_table', 300, 440)
    .prop('plant_pot', 478, 372);
  // billiards
  b.prop('pool_table', 356, 522).prop('chair', 290, 490).prop('sofa', 450, 566).prop('cafe_table', 460, 492);
  // lounge
  b.prop('sofa', 320, 620).prop('sofa', 320, 700, 180).prop('cafe_table', 320, 660).prop('plant_pot', 480, 600).prop('piano', 450, 760).prop('shelf', 290, 760, 0, 3);
  b.light(320, 296, 100, WARM, 0.75)
    .light(440, 296, 100, WARM, 0.65)
    .light(380, 410, 120, LAMP, 0.85)
    .light(370, 522, 120, 0xffe8b0, 0.9)
    .light(380, 690, 140, WARM, 0.75, { flicker: 'soft' })
    .light(536, 480, 100, WARM, 0.6);
  b.decal({ kind: 'text', x: 380, y: 370, text: 'КАФЕ', size: 9, color: '#d9c7a3', alpha: 0.5 });

  // ── East wing: corridor, dressing rooms, costumes, rehearsal ─────────────
  b.floor('carpet_red', 1104, 338, 66, 350)
    .floor('linoleum_checker', 1110, 228, 218, 112)
    .floor('wood', 1178, 348, 150, 340);
  b.vwall('plaster', 1170, 340, 688, 8, [
    [400, 436],
    [530, 566],
    [630, 666],
  ])
    .hwall('plaster', 1104, 1328, 340, 8, [
      [1120, 1156],
      [1270, 1306],
    ])
    .vwall('plaster', 1230, 228, 340, 8, [[264, 300]])
    .hwall('plaster', 1178, 1328, 480, 8, [[1240, 1276]])
    .hwall('plaster', 1178, 1328, 600, 8, [[1200, 1236]]);
  b.decal({ kind: 'stairs', x: 1112, y: 470, w: 40, h: 80 });
  b.prop('coat_rack', 1250, 380, 0, 1)
    .prop('coat_rack', 1250, 430, 0, 1)
    .prop('coat_rack', 1290, 456, 0, 1)
    .prop('desk', 1150, 260)
    .prop('chair', 1150, 276)
    .prop('locker_row', 1290, 240)
    .prop('sofa', 1290, 320)
    .prop('cafe_table', 1230, 540)
    .prop('cafe_table', 1290, 520)
    .prop('chair', 1210, 560)
    .prop('crate_wood', 1310, 640)
    .prop('file_cabinet', 1200, 650);
  b.light(1170, 284, 100, WARM, 0.7)
    .light(1280, 284, 100, WARM, 0.65)
    .light(1250, 414, 120, LAMP, 0.8)
    .light(1250, 540, 120, WARM, 0.75, { flicker: 'soft' })
    .light(1137, 600, 100, WARM, 0.6);

  // ── Foyer, bust, cloakroom, portico ──────────────────────────────────────
  b.floor('marble', 512, 628, 506, 230).floor('marble', 1018, 628, 90, 60).floor('carpet_red', 800, 628, 60, 230);
  b.prop('bust', 830, 716)
    .prop('plant_pot', 798, 740)
    .prop('plant_pot', 862, 740)
    .prop('counter', 966, 742, 0, 3)
    .prop('coat_rack', 966, 712, 0, 0)
    .prop('bench', 700, 680)
    .prop('bench', 960, 680)
    .prop('shelf', 600, 648, 0, 3)
    .prop('sofa', 580, 800)
    .prop('plant_pot', 530, 640)
    .prop('plant_pot', 1000, 830)
    .prop('column', 770, 886)
    .prop('column', 890, 886);
  b.decal({ kind: 'text', x: 966, y: 762, text: 'ГАРДЕРОБ', size: 8, color: '#e8dcc0', alpha: 0.6 })
    .decal({ kind: 'stairs', x: 680, y: 904, w: 300, h: 50 })
    .decal({ kind: 'stairs', x: 380, y: 800, w: 50, h: 56 })
    .decal({ kind: 'stairs', x: 1340, y: 586, w: 50, h: 44 });
  b.overhead({ kind: 'canopy', x: 740, y: 868, w: 180, h: 36, seed: 2 });
  b.light(830, 700, 170, 0xffe0a0, 0.9)
    .light(620, 720, 130, WARM, 0.7)
    .light(980, 720, 110, WARM, 0.7)
    .light(1060, 660, 90, WARM, 0.6)
    .light(770, 900, 100, LAMP, 0.8, { fixture: 'street' })
    .light(890, 900, 100, LAMP, 0.8, { fixture: 'street' });

  // ── South garden and east yard ───────────────────────────────────────────
  b.prop('planter', 540, 900)
    .prop('planter', 1130, 900)
    .prop('bench', 420, 940)
    .prop('bench', 1250, 940)
    .prop('lamp_post', 640, 940)
    .prop('lamp_post', 1020, 940)
    .prop('barrel_blue', 1380, 452)
    .prop('barrel_blue', 1396, 464)
    .prop('barrel_blue', 1380, 476)
    .prop('barrel_blue', 1396, 488)
    .prop('ambulance', 1466, 470, 0, 1)
    .prop('container', 1440, 300, 0, 1)
    .prop('truck', 1400, 830)
    .prop('crate_wood', 1360, 720)
    .prop('crate_wood', 1360, 737)
    .prop('lamp_post', 1360, 260)
    .prop('lamp_post', 1360, 620);
  b.tree(300, 930, 56, 8).tree(1180, 950, 64, 9).tree(1450, 620, 64, 10).tree(1440, 80, 64, 11).tree(1370, 940, 56, 12).tree(560, 952, 48, 13);
  b.light(640, 948, 170, SODIUM, 0.8, { fixture: 'street' })
    .light(1020, 948, 170, SODIUM, 0.8, { fixture: 'street', flicker: 'soft' })
    .light(1360, 268, 180, SODIUM, 0.8, { fixture: 'street' })
    .light(1360, 628, 180, SODIUM, 0.75, { fixture: 'street' });
  b.spawn(1427, 540, 180).spawn(1180, 930, -90).spawn(1440, 920, -135);

  // ── Loot, first aid, «дефицит» drop points ───────────────────────────────
  b.pickup('obrez', 300, 270, 16_000)
    .pickup('avtomat', 440, 524, 20_000)
    .pickup('obrez', 600, 300, 16_000)
    .pickup('avtomat', 1066, 300, 20_000)
    .pickup('obrez', 740, 600, 16_000)
    .pickup('avtomat', 1210, 410, 20_000)
    .pickup('obrez', 660, 760, 16_000)
    .pickup('avtomat', 1250, 900, 20_000)
    .pickup('obrez', 200, 700, 16_000)
    .pickup('avtomat', 1420, 380, 20_000);
  b.medkit(430, 700).medkit(1260, 640).medkit(920, 800).medkit(110, 270);
  b.supply(830, 460).supply(220, 860).supply(1420, 720).supply(600, 140).supply(1100, 920).supply(700, 780);

  // more spawn points for 10-player rooms: seven on each half (team matches start on their own half)
  b.spawn(668, 708, -90).spawn(524, 364, 45).spawn(468, 932, -45).spawn(1036, 468, 180).spawn(388, 652, -45).spawn(860, 956, -90);
  return b.build();
}
