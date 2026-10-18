import { MapBuilder } from './builder.js';
import type { MapDef } from './types.js';

/**
 * «Заводская проходная» — flagship map. A factory checkpoint splits the territory (north) from the
 * outer yard (south). Four crossings: the west breach, the checkpoint turnstiles, the vehicle gate
 * and the east gap. Rooms: office, locker room, workshop «Цех №3», guard booth, warehouse.
 */
export function buildFactoryMap(): MapDef {
  const W = 1440;
  const H = 1024;
  const SODIUM = 0xffb04a;
  const WARM = 0xffcf8a;
  const COLD = 0xcfe6ff;
  const RED = 0xff3a2a;
  const b = new MapBuilder(
    'factory',
    'Заводская проходная',
    'Работаем круглосуточно',
    'Промышленные помещения, металлические конструкции, коридоры и открытые участки. Контроль ключевых точек.',
    W,
    H,
    'concrete_slab',
  )
    .ambient(0x1c2436, 0.42)
    .minimap('#3b3733');

  // ── Floors ───────────────────────────────────────────────────────────────
  b.floor('concrete_slab', 16, 252, 684, 290) // north courtyard
    .floor('metal_plate', 700, 16, 724, 352) // workshop hall
    .floor('concrete_dirty', 700, 380, 724, 160) // east yard
    .floor('asphalt', 16, 552, 584, 456) // loading yard
    .floor('asphalt_cracked', 600, 600, 380, 408) // plaza
    .floor('concrete_dirty', 992, 612, 432, 396) // warehouse
    .floor('concrete_dirty', 820, 552, 604, 48) // corridor along the fence
    .floor('gravel', 110, 536, 60, 30); // breach rubble

  // ── Boundary ─────────────────────────────────────────────────────────────
  b.hwall('brick', 0, W, 0, 16)
    .hwall('brick', 0, W, H - 16, 16)
    .vwall('brick', 0, 16, H - 16, 16)
    .vwall('brick', W - 16, 16, H - 16, 16);

  // ── Office «Контора» (NW) ────────────────────────────────────────────────
  b.floor('linoleum_checker', 16, 16, 372, 232)
    .hwall('brick', 16, 400, 248, 12, [
      [70, 118],
      [280, 330],
    ])
    .vwall('brick', 388, 16, 248, 12, [[150, 200]])
    .vwall('concrete', 196, 16, 248, 10, [[110, 160]]);
  b.prop('desk', 100, 70)
    .prop('chair', 100, 88)
    .prop('file_cabinet', 26, 50, 90)
    .prop('file_cabinet', 26, 74, 90)
    .prop('plant_pot', 176, 32)
    .prop('desk', 130, 196)
    .prop('chair', 130, 212)
    .prop('desk', 252, 70)
    .prop('chair', 252, 88)
    .prop('desk', 332, 70)
    .prop('chair', 332, 88)
    .prop('desk', 252, 150)
    .prop('chair', 252, 168)
    .prop('file_cabinet', 300, 26)
    .prop('file_cabinet', 320, 26)
    .prop('plant_pot', 370, 232);
  b.light(106, 130, 150, WARM, 0.95).light(297, 130, 150, WARM, 0.9);
  b.pickup('obrez', 310, 206);

  // ── Locker room «Раздевалка» ─────────────────────────────────────────────
  b.floor('concrete_painted', 400, 16, 288, 212)
    .hwall('concrete', 400, 700, 228, 12, [
      [470, 520],
      [600, 648],
    ])
    .vwall('brick', 688, 16, 380, 12, [
      [70, 120],
      [290, 340],
    ]);
  b.row('locker_row', 440, 24, 3, 54, 0)
    .prop('locker_row', 470, 120)
    .prop('locker_row', 470, 132, 180)
    .prop('locker_row', 586, 120)
    .prop('locker_row', 586, 132, 180)
    .prop('bench', 470, 80)
    .prop('bench', 586, 80)
    .prop('bench', 470, 180)
    .prop('bench', 586, 180);
  b.light(530, 108, 150, COLD, 0.8, { flicker: 'soft' });
  b.spawn(650, 52, 135);

  // ── Workshop «Цех №3» (NE) ───────────────────────────────────────────────
  b.hwall('brick', 700, W - 16, 368, 12, [
    [860, 956],
    [1240, 1296],
  ]);
  b.prop('machine_lathe', 780, 80)
    .prop('machine_lathe', 780, 140)
    .prop('machine_lathe', 780, 200)
    .prop('machine_press', 900, 70)
    .prop('machine_press', 962, 70)
    .prop('machine_press', 1024, 70)
    .prop('conveyor', 1000, 190)
    .prop('conveyor', 1088, 190)
    .prop('tank_horizontal', 1200, 80, 90)
    .prop('tank_vertical', 1340, 64)
    .prop('tank_vertical', 1388, 108)
    .prop('tank_vertical', 1340, 140)
    .prop('crate_stack', 1256, 300)
    .prop('crate_stack', 1290, 300)
    .prop('crate_wood', 1180, 322)
    .prop('crate_wood', 1197, 322)
    .prop('crate_wood', 1180, 339)
    .prop('cable_reel', 880, 300)
    .prop('cable_reel', 902, 318)
    .prop('forklift', 1100, 296)
    .prop('electric_box', 722, 260, 90);
  b.decal({ kind: 'hazard', x: 952, y: 172, w: 184, h: 6 })
    .decal({ kind: 'hazard', x: 952, y: 204, w: 184, h: 6 })
    .decal({ kind: 'line', x: 840, y: 24, w: 4, h: 336, color: '#c9a227', alpha: 0.5 })
    .decal({ kind: 'line', x: 1140, y: 24, w: 4, h: 336, color: '#c9a227', alpha: 0.5 })
    .decal({ kind: 'text', x: 1000, y: 262, text: 'СЛАВА ТРУДУ!', size: 26, color: '#c8312a', alpha: 0.6 })
    .decal({ kind: 'star', x: 870, y: 262, r: 12, color: '#c8312a', alpha: 0.6 })
    .decal({ kind: 'star', x: 1130, y: 262, r: 12, color: '#c8312a', alpha: 0.6 })
    .decal({ kind: 'stain', x: 1120, y: 250, r: 22, color: '#14110e', alpha: 0.45, seed: 3 });
  b.overhead({ kind: 'pipe', x: 700, y: 236, w: 724, h: 12 })
    .overhead({ kind: 'pipe', x: 1150, y: 16, w: 12, h: 352 });
  b.light(800, 110, 175, COLD, 0.85)
    .light(1000, 120, 175, COLD, 0.85, { flicker: 'soft' })
    .light(1300, 210, 175, COLD, 0.8)
    .light(908, 356, 70, RED, 0.9, { flicker: 'broken', fixture: 'neon' });
  b.pickup('avtomat', 1060, 282);
  b.spawn(1395, 345, -135);

  // ── North courtyard ──────────────────────────────────────────────────────
  b.prop('turbine', 330, 400)
    .prop('sandbags', 520, 330)
    .prop('sandbags', 566, 470, 90)
    .prop('barrel_blue', 130, 300)
    .prop('barrel_blue', 146, 312)
    .prop('barrel_blue', 126, 322)
    .prop('barrel_red', 600, 290)
    .prop('barrel_red', 614, 304)
    .prop('crate_wood', 220, 500)
    .prop('crate_wood', 237, 500)
    .prop('crate_wood', 220, 483)
    .prop('crate_stack', 470, 500)
    .prop('electric_box', 160, 266)
    .prop('pallet', 640, 400)
    .prop('lamp_post', 60, 500);
  b.overhead({ kind: 'pipe', x: 324, y: 260, w: 12, h: 104 });
  b.decal({ kind: 'stain', x: 280, y: 450, r: 30, color: '#12100d', alpha: 0.4, seed: 7 })
    .decal({ kind: 'hazard', x: 280, y: 344, w: 100, h: 5, alpha: 0.7 });
  b.light(180, 282, 190, SODIUM, 0.85, { fixture: 'street' }).light(546, 420, 180, SODIUM, 0.8, { fixture: 'street' });
  b.spawn(40, 290, 0);

  // ── East yard ────────────────────────────────────────────────────────────
  b.prop('forklift', 780, 460, 90)
    .prop('barrel_red', 1040, 420)
    .prop('barrel_red', 1056, 434)
    .prop('barrel_red', 1040, 448)
    .prop('barrel_rust', 1074, 418)
    .prop('crate_stack', 1180, 470)
    .prop('crate_stack', 1216, 470)
    .prop('pallet', 1264, 500)
    .prop('sandbags', 930, 486);
  b.decal({ kind: 'arrow', x: 908, y: 448, w: 150, h: 58, angle: -90, color: '#b3261e', text: 'В ЦЕХ', alpha: 0.8 })
    .decal({ kind: 'text', x: 1268, y: 396, text: 'ЦЕХ №3', size: 18, color: '#e8dcc0', alpha: 0.55 });
  b.light(1000, 400, 200, SODIUM, 0.85, { fixture: 'street' }).light(1300, 456, 160, SODIUM, 0.7, { flicker: 'soft' });
  b.spawn(1395, 420, 180);

  // ── Fence line + checkpoint «Проходная» ──────────────────────────────────
  b.hwall('fence_concrete', 16, 600, 540, 12, [[110, 170]])
    .hwall('fence_concrete', 820, W - 16, 540, 12, [
      [860, 980],
      [1330, 1390],
    ]);
  b.floor('concrete_painted', 612, 508, 196, 80)
    .room('brick', 600, 496, 220, 104, 12, [
      { side: 'n', at: 70, width: 60 },
      { side: 's', at: 70, width: 60 },
    ])
    .vwall('concrete', 760, 508, 588, 10, [[528, 568]]);
  b.prop('turnstile', 640, 548, 90)
    .prop('turnstile', 748, 548, 90)
    .prop('desk', 789, 530, 90)
    .prop('chair', 789, 560)
    .prop('boom_barrier', 920, 546)
    .prop('electric_box', 630, 576);
  b.decal({ kind: 'text', x: 710, y: 632, text: 'ПРОХОДНАЯ', size: 22, color: '#e8dcc0', alpha: 0.7 })
    .decal({ kind: 'star', x: 614, y: 632, r: 10, color: '#c8312a', alpha: 0.85 })
    .decal({ kind: 'star', x: 806, y: 632, r: 10, color: '#c8312a', alpha: 0.85 })
    .decal({ kind: 'hazard', x: 860, y: 536, w: 120, h: 6, alpha: 0.8 })
    .decal({ kind: 'stain', x: 140, y: 548, r: 26, color: '#2b2722', alpha: 0.6, seed: 11 });
  b.light(690, 548, 120, WARM, 0.95, { flicker: 'broken' }).light(789, 548, 70, COLD, 0.7);

  // ── Loading yard (SW) ────────────────────────────────────────────────────
  b.prop('container', 110, 690)
    .prop('container', 230, 880, 90, 1)
    .prop('truck', 420, 760)
    .prop('crate_stack', 300, 640)
    .prop('crate_stack', 336, 640)
    .prop('crate_wood', 520, 950)
    .prop('crate_wood', 537, 950)
    .prop('crate_wood', 520, 933)
    .prop('barrel_rust', 60, 960)
    .prop('barrel_rust', 77, 972)
    .prop('sandbags', 524, 650, 90)
    .prop('tire_stack', 250, 980)
    .prop('tire_stack', 270, 990)
    .prop('pallet', 300, 700)
    .prop('lamp_post', 200, 590);
  b.decal({ kind: 'line', x: 360, y: 600, w: 4, h: 260, color: '#d9c7a3', alpha: 0.35 })
    .decal({ kind: 'line', x: 480, y: 600, w: 4, h: 260, color: '#d9c7a3', alpha: 0.35 })
    .decal({ kind: 'stain', x: 420, y: 870, r: 24, color: '#0f0d0b', alpha: 0.5, seed: 5 });
  b.light(200, 600, 200, SODIUM, 0.9, { fixture: 'street' }).light(480, 920, 180, SODIUM, 0.8, { fixture: 'street' });
  b.pickup('avtomat', 300, 784);
  b.spawn(40, 985, -45);

  // ── Plaza (S) ────────────────────────────────────────────────────────────
  b.prop('car_zhiguli', 660, 760, 0, 0)
    .prop('car_volga', 900, 880, 90, 1)
    .prop('bus_paz', 770, 930, 90)
    .prop('lamp_post', 640, 660)
    .prop('lamp_post', 920, 660)
    .prop('trash_container', 870, 720)
    .prop('phone_booth', 944, 640);
  b.decal({ kind: 'line', x: 620, y: 700, w: 80, h: 3, color: '#d9c7a3', alpha: 0.4 })
    .decal({ kind: 'line', x: 620, y: 820, w: 80, h: 3, color: '#d9c7a3', alpha: 0.4 });
  b.light(700, 700, 200, SODIUM, 0.85, { fixture: 'street' }).light(880, 800, 190, SODIUM, 0.8, { fixture: 'street' });
  b.spawn(620, 985, -90);

  // ── Warehouse «Склад» (SE) ───────────────────────────────────────────────
  b.vwall('brick', 980, 600, H - 16, 12, [[720, 780]]).hwall('brick', 980, W - 16, 600, 12, [[1100, 1160]]);
  b.prop('crate_stack', 1080, 700)
    .prop('crate_stack', 1080, 732)
    .prop('crate_stack', 1080, 764)
    .prop('crate_stack', 1220, 700)
    .prop('crate_stack', 1220, 732)
    .prop('crate_stack', 1330, 700)
    .prop('crate_stack', 1330, 764)
    .prop('sandbags', 1150, 900)
    .prop('barrel_blue', 1384, 640)
    .prop('barrel_red', 1398, 656)
    .prop('crate_green', 1260, 900)
    .prop('crate_green', 1260, 916)
    .prop('pallet', 1300, 960)
    .prop('scrap_pile', 1040, 960);
  b.light(1150, 780, 180, WARM, 0.85, { flicker: 'soft' }).light(1340, 880, 150, WARM, 0.75);
  b.pickup('obrez', 1150, 764);
  b.spawn(1395, 985, -135);

  return b.build();
}
