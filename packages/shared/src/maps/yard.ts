import { MapBuilder } from './builder.js';
import type { MapDef } from './types.js';

/**
 * «Советский двор» — a courtyard enclosed by four panel blocks. Corner gaps and three archways
 * connect the courtyard with the outer street ring, giving accessible movement and flanking routes.
 */
export function buildYardMap(): MapDef {
  const W = 1408;
  const H = 1088;
  const SODIUM = 0xffb04a;
  const WARM = 0xffd296;
  const WINDOW = 0xffc777;
  const b = new MapBuilder(
    'yard',
    'Soviet Courtyard',
    'Where it all begins',
    'Panel blocks, archways and a playground. Flanks and mid-range fights.',
    W,
    H,
    'asphalt',
  )
    .ambient(0x1e2a40, 0.56)
    .minimap('#3a3936');

  // Floors: outer street ring is asphalt (base), the courtyard mixes asphalt, dirt, grass and sand.
  b.floor('asphalt_cracked', 256, 256, 896, 576)
    .floor('grass', 256, 256, 160, 120)
    .floor('grass', 1000, 680, 152, 152)
    .floor('dirt', 300, 330, 300, 260)
    .floor('sand', 378, 398, 44, 44)
    .floor('grass', 980, 256, 172, 90)
    .floor('grass', 256, 690, 140, 142)
    .floor('gravel', 640, 96, 120, 160)
    .floor('gravel', 520, 832, 120, 160)
    .floor('gravel', 1152, 496, 160, 96);

  // Map boundary (low concrete fence around the block)
  b.hwall('fence_concrete', 0, W, 0, 16)
    .hwall('fence_concrete', 0, W, H - 16, 16)
    .vwall('fence_concrete', 0, 16, H - 16, 16)
    .vwall('fence_concrete', W - 16, 16, H - 16, 16);

  // Panel buildings (flat roofs). Gaps = archways.
  b.hwall('roof_flat', 176, 1232, 96, 160, [[640, 760]])
    .hwall('roof_flat', 176, 1232, 832, 160, [[520, 640]])
    .vwall('roof_flat', 96, 336, 752, 160)
    .vwall('roof_flat', 1152, 336, 752, 160, [[496, 592]]);
  b.overhead({ kind: 'canopy', x: 640, y: 96, w: 120, h: 160 })
    .overhead({ kind: 'canopy', x: 520, y: 832, w: 120, h: 160 })
    .overhead({ kind: 'canopy', x: 1152, y: 496, w: 160, h: 96 });

  // Entrances (подъезды): benches + door lights on courtyard-facing walls
  const entrances: Array<[number, number, number]> = [
    [360, 264, 0],
    [930, 264, 0],
    [330, 824, 0],
    [1000, 824, 0],
    [264, 470, 90],
    [264, 660, 90],
    [1144, 618, 90],
  ];
  for (const [x, y, rot] of entrances) {
    b.light(x, y, 90, WARM, 0.85, { fixture: 'lamp', flicker: x === 1000 ? 'broken' : 'none' });
    b.decal({ kind: 'line', x: rot === 0 ? x - 16 : x - 4, y: rot === 0 ? y - 4 : y - 16, w: rot === 0 ? 32 : 8, h: rot === 0 ? 8 : 32, color: '#2a2622', alpha: 0.9 });
  }
  b.prop('bench', 410, 276).prop('bench', 980, 276).prop('bench', 380, 812).prop('bench', 1050, 812);

  // Window light spill on the courtyard ground
  const windows: Array<[number, number]> = [
    [480, 268],
    [820, 268],
    [1090, 268],
    [450, 820],
    [760, 820],
    [1120, 820],
    [268, 400],
    [268, 580],
    [1140, 700],
  ];
  for (const [x, y] of windows) b.light(x, y, 70, WINDOW, 0.45, { fixture: 'window' });

  // Playground
  b.prop('sandbox', 400, 420)
    .prop('swing', 520, 360)
    .prop('slide', 330, 520)
    .prop('carousel', 480, 520)
    .prop('monkey_bars', 570, 470, 90);
  // Domino corner
  b.prop('domino_table', 900, 420).prop('bench', 900, 398).prop('bench', 900, 442);
  // Trash containers by the north block
  b.prop('trash_container', 1010, 292).prop('trash_container', 1048, 292);
  b.decal({ kind: 'stain', x: 1030, y: 316, r: 18, color: '#1a1712', alpha: 0.55, seed: 12 });
  // «Ракушки» along the east block
  b.prop('garage_shell', 1120, 400, 0, 1).prop('garage_shell', 1120, 690, 0, 2);
  // Parked cars along the south block
  b.prop('car_zhiguli', 760, 792, 90, 0).prop('car_volga', 900, 792, 90, 2).prop('car_wreck', 400, 760, 0);
  // Trees and bushes
  b.tree(320, 300, 76, 1)
    .tree(700, 330, 84, 2)
    .tree(1080, 360, 70, 3)
    .tree(300, 770, 78, 4)
    .tree(1090, 750, 84, 5)
    .tree(760, 640, 72, 6);
  b.overhead({ kind: 'bush', x: 600, y: 268, w: 70, h: 26, seed: 1 })
    .overhead({ kind: 'bush', x: 268, y: 600, w: 26, h: 60, seed: 2 })
    .overhead({ kind: 'bush', x: 1110, y: 560, w: 30, h: 70, seed: 3 })
    .overhead({ kind: 'bush', x: 820, y: 800, w: 60, h: 24, seed: 4 });
  // Laundry lines
  b.overhead({ kind: 'wires', x: 820, y: 560, w: 200, h: 40, seed: 7 });
  b.prop('lamp_post', 640, 300).prop('lamp_post', 860, 560).prop('lamp_post', 450, 700);
  b.decal({ kind: 'hopscotch', x: 640, y: 720, angle: 0 })
    .decal({ kind: 'text', x: 700, y: 600, text: 'НАШ ДВОР — НАШИ ПРАВИЛА', size: 18, color: '#e8dcc0', alpha: 0.6, font: 'hand' })
    .decal({ kind: 'manhole', x: 980, y: 520 })
    .decal({ kind: 'manhole', x: 180, y: 60 });
  b.light(640, 300, 200, SODIUM, 0.85, { fixture: 'street' })
    .light(860, 560, 200, SODIUM, 0.85, { fixture: 'street' })
    .light(450, 700, 190, SODIUM, 0.8, { fixture: 'street', flicker: 'soft' });
  b.pickup('avtomat', 720, 480);

  // Outer street ring
  b.prop('kiosk', 1320, 1040, 0)
    .prop('phone_booth', 52, 600)
    .prop('water_pump', 1370, 260)
    .prop('lamp_post', 56, 56)
    .prop('lamp_post', 1352, 56)
    .prop('lamp_post', 56, 1032)
    .prop('lamp_post', 1352, 1032)
    .prop('car_zhiguli', 52, 300, 0, 3)
    .prop('car_volga', 1356, 820, 0, 1)
    .prop('trash_container', 900, 48)
    .prop('bench', 1000, 1048)
    .prop('tire_stack', 140, 1050);
  b.tree(1360, 140, 60, 7).tree(48, 760, 60, 8).tree(1000, 40, 56, 9);
  b.light(56, 56, 210, SODIUM, 0.8, { fixture: 'street' })
    .light(1352, 56, 210, SODIUM, 0.8, { fixture: 'street' })
    .light(56, 1032, 210, SODIUM, 0.8, { fixture: 'street' })
    .light(1352, 1032, 210, SODIUM, 0.8, { fixture: 'street' })
    .light(700, 48, 160, SODIUM, 0.7, { fixture: 'street', flicker: 'broken' })
    .light(1360, 544, 170, SODIUM, 0.7, { fixture: 'street' })
    .light(48, 544, 170, SODIUM, 0.7, { fixture: 'street' })
    .light(580, 1050, 160, SODIUM, 0.75, { fixture: 'street' });
  b.pickup('avtomat', 1360, 600).pickup('obrez', 48, 470).pickup('obrez', 580, 1040);

  b.spawn(290, 290, 45)
    .spawn(1118, 296, 135)
    .spawn(296, 798, -45)
    .spawn(1100, 808, -135)
    .spawn(44, 44, 45)
    .spawn(1364, 44, 135)
    .spawn(44, 1044, -45)
    .spawn(1364, 1044, -135);
  // ── Extra loot & «дефицит» drop points ───────────────────────────────────
  b.pickup('obrez', 664, 52, 16_000)
    .pickup('avtomat', 592, 744, 20_000)
    .pickup('obrez', 992, 544, 16_000)
    .pickup('avtomat', 400, 544, 20_000)
    .pickup('obrez', 552, 280, 16_000)
    .pickup('avtomat', 52, 728, 20_000);
  b.supply(848, 752).supply(888, 320).supply(1328, 256).supply(1312, 840).supply(88, 248).supply(728, 232);
  // first-aid kits: west and east of the courtyard centre, and behind the southern block
  b.medkit(560, 560).medkit(1000, 680).medkit(820, 1040);

  // more spawn points for 10-player rooms: seven on each half (team matches start on their own half)
  b.spawn(692, 1044, -90).spawn(708, 44, 90).spawn(692, 604, -90).spawn(1364, 556, 180).spawn(44, 548, 0).spawn(820, 324, 135);
  // capture the flag: a stand deep in each team's half; base capture: A (red side), B (middle), C (blue side)
  b.flagStand(0, 72, 544).flagStand(1, 1336, 544);
  b.base(392, 576).base(704, 544).base(1056, 544);
  return b.build();
}
