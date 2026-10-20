import { MapBuilder } from './builder.js';
import type { MapDef } from './types.js';

/**
 * «Пионерлагерь» — the abandoned pioneer camp «Звёздочка» by a lake, from the product owner's layout
 * (references/39-map-pionerlager.png). The gate with the camp's arch in the north (spawn B), the dining
 * hall and the club either side of the parade square with its bugler statue, four dormitories, the
 * first-aid post in the middle, the campfire ring, the football pitch in the east, watchtowers, and the
 * lake along the south with the jetty and the boats (water stops you, not bullets). The camp's name is
 * made up and the statues are pioneers — no real people. Spawns: A west, B at the gate, C east.
 */
export function buildCampMap(): MapDef {
  const W = 1500;
  const H = 1000;
  const WARM = 0xffcf8a;
  const SODIUM = 0xffb04a;
  const FIRE = 0xff8a2a;
  const MOON = 0xa8c4f0;
  const PALE = 0xc8f0d8;
  const b = new MapBuilder(
    'camp',
    'Pioneer Camp',
    'Be prepared! — Always prepared!',
    'Wooden cabins, the dining hall and the club round the parade square, a campfire ring and a football pitch, and a lake with a jetty. Fights indoors and across open lawns.',
    W,
    H,
    'grass',
  )
    .ambient(0x162030, 0.42)
    .minimap('#2c3a2a');

  // ── Paths and the shore ──────────────────────────────────────────────────
  b.floor('dirt', 700, 0, 100, 640) // from the gate to the campfire
    .floor('dirt', 60, 290, 1380, 40) // between the halls and the cabins
    .floor('dirt', 60, 490, 1380, 40) // below the cabins
    .floor('dirt', 60, 290, 40, 500)
    .floor('dirt', 1400, 290, 40, 500)
    .floor('dirt', 580, 290, 40, 380)
    .floor('dirt', 880, 290, 40, 380)
    .floor('sand', 0, 820, W, 90)
    .floor('asphalt', 640, 170, 220, 210);

  // ── The lake (water stops you, not bullets) and the jetty ────────────────
  b.wall('water', 0, 900, 840, 100)
    .wall('water', 840, 900, 40, 50)
    .wall('water', 960, 900, 40, 50)
    .wall('water', 1000, 900, 500, 100)
    .wall('water', 840, 990, 160, 10);
  b.floor('wood', 880, 850, 80, 140).floor('wood', 840, 950, 160, 40);
  b.prop('boat', 800, 950, 0, 0).prop('boat', 1040, 950, 0, 1).prop('boat', 1100, 935, 90, 2).prop('boat', 300, 930, 90, 0);
  b.prop('rock', 120, 890, 0, 0).prop('rock', 200, 905, 0, 1).prop('rock', 1360, 890, 0, 2).prop('rock', 1440, 905, 0, 0);
  for (const x of [870, 970]) {
    b.prop('lamp_post', x, 860);
    b.light(x, 868, 150, SODIUM, 0.75, { fixture: 'street', flicker: x === 970 ? 'broken' : 'soft' });
  }
  b.light(750, 960, 300, MOON, 0.4, { fixture: 'none' });

  // ── The fence with the gate and the camp's arch in the north ─────────────
  b.hwall('fence_chain', 0, W, 0, 4, [[700, 800]])
    .vwall('fence_chain', 0, 4, 900, 4)
    .vwall('fence_chain', W - 4, 4, 900, 4);
  b.wall('brick', 684, 0, 16, 26).wall('brick', 800, 0, 16, 26);
  b.decal({ kind: 'line', x: 680, y: 8, w: 140, h: 16, color: '#d9c7a3', alpha: 0.95, layer: 'roof' })
    .decal({ kind: 'text', x: 750, y: 16, text: 'ПИОНЕРЛАГЕРЬ «ЗВЁЗДОЧКА»', size: 7, color: '#9e2a22', alpha: 0.95, layer: 'roof' })
    .decal({ kind: 'star', x: 750, y: 38, r: 8, color: '#c8261c', alpha: 0.9 });
  b.prop('bugler', 660, 60, 0, 0).prop('bugler', 840, 60, 0, 1);
  b.light(700, 40, 130, WARM, 0.75, { fixture: 'lamp' }).light(800, 40, 130, WARM, 0.75, { fixture: 'lamp' });

  // ── The dining hall (north-west) ─────────────────────────────────────────
  b.room('plaster', 260, 80, 320, 190, 10, [
    { side: 's', at: 140, width: 40 },
    { side: 'e', at: 70, width: 40 },
    { side: 'w', at: 70, width: 40 },
  ], 'tile_beige');
  b.prop('long_table', 360, 135).prop('long_table', 480, 135).prop('long_table', 360, 205).prop('long_table', 480, 205);
  b.prop('counter', 300, 100).prop('crate_wood', 285, 245).prop('soda_machine', 556, 100);
  b.decal({ kind: 'line', x: 360, y: 82, w: 120, h: 10, color: '#2a4a3a', alpha: 0.95, layer: 'roof' })
    .decal({ kind: 'text', x: 420, y: 87, text: 'СТОЛОВАЯ', size: 7, color: '#e8dcc0', alpha: 0.95, layer: 'roof' });
  b.light(360, 170, 130, WARM, 0.75, { fixture: 'lamp', flicker: 'soft' }).light(490, 170, 130, WARM, 0.7, { fixture: 'lamp' });

  // ── The club (north-east): the stage and rows of seats ───────────────────
  b.room('plaster', 920, 80, 320, 190, 10, [
    { side: 's', at: 140, width: 40 },
    { side: 'w', at: 70, width: 40 },
    { side: 'e', at: 70, width: 40 },
  ], 'parquet');
  b.floor('wood', 930, 90, 300, 50);
  b.prop('curtain', 1020, 96).prop('curtain', 1140, 96).prop('stage_speaker', 950, 120).prop('stage_speaker', 1210, 120);
  b.prop('theater_seats', 1030, 175).prop('theater_seats', 1130, 175).prop('theater_seats', 1030, 205).prop('theater_seats', 1130, 205).prop('theater_seats', 1030, 235).prop('theater_seats', 1130, 235);
  b.decal({ kind: 'star', x: 1080, y: 112, r: 14, color: '#c8261c', alpha: 0.85 })
    .decal({ kind: 'line', x: 1020, y: 82, w: 120, h: 10, color: '#7a1612', alpha: 0.95, layer: 'roof' })
    .decal({ kind: 'text', x: 1080, y: 87, text: 'КЛУБ', size: 7, color: '#e8dcc0', alpha: 0.95, layer: 'roof' });
  b.light(1080, 140, 150, 0xff4a3a, 0.75, { fixture: 'none', flicker: 'soft' }).light(1080, 230, 120, WARM, 0.6, { fixture: 'lamp' });

  // ── The parade square: the bugler and the flags ──────────────────────────
  b.prop('bugler', 750, 260, 0, 0);
  for (const [x, y] of [
    [670, 190],
    [830, 190],
    [670, 340],
    [830, 340],
  ] as const)
    b.prop('flagpole', x, y, 0, 1);
  b.prop('planter', 690, 270).prop('planter', 810, 270);
  b.light(750, 300, 170, WARM, 0.75, { fixture: 'none' });

  // ── Four dormitories ─────────────────────────────────────────────────────
  const cabin = (x: number, n: number, doorSide: 'w' | 'e') => {
    b.room('plaster', x, 340, 170, 140, 8, [
      { side: 'n', at: 65, width: 40 },
      { side: 's', at: 65, width: 40 },
      { side: doorSide, at: 50, width: 36 },
    ], 'wood');
    // beds along the walls, a clear aisle from every door
    for (const [dx, dy] of [
      [24, 40],
      [46, 40],
      [124, 40],
      [146, 40],
      [24, 106],
      [146, 106],
    ] as const)
      b.prop('bunk_bed', x + dx, 340 + dy);
    b.decal({ kind: 'line', x: x + 45, y: 341, w: 80, h: 6, color: '#d9c7a3', alpha: 0.9, layer: 'roof' }).decal({ kind: 'text', x: x + 85, y: 344, text: `КОРПУС ${n}`, size: 5, color: '#5a1612', alpha: 0.95, layer: 'roof' });
    b.light(x + 85, 410, 100, PALE, 0.55, { fixture: 'lamp', flicker: n === 3 ? 'broken' : 'none' });
  };
  cabin(110, 1, 'e');
  cabin(400, 2, 'w');
  cabin(930, 3, 'e');
  cabin(1220, 4, 'w');

  // ── The first-aid post in the middle ─────────────────────────────────────
  b.room('plaster', 660, 540, 180, 100, 8, [
    { side: 'n', at: 70, width: 40 },
    { side: 'w', at: 30, width: 36 },
    { side: 'e', at: 30, width: 36 },
  ], 'tile_white');
  b.prop('hospital_bed', 705, 618, 90).prop('hospital_bed', 795, 618, 90).prop('med_cabinet', 700, 556).prop('med_screen', 750, 618);
  b.decal({ kind: 'cross', x: 750, y: 595, r: 9, color: '#c8312a', alpha: 0.85 })
    .decal({ kind: 'line', x: 700, y: 542, w: 100, h: 6, color: '#d9c7a3', alpha: 0.9, layer: 'roof' })
    .decal({ kind: 'text', x: 750, y: 545, text: 'МЕДПУНКТ', size: 5, color: '#9e2a22', alpha: 0.95, layer: 'roof' });
  b.light(750, 590, 110, 0xd8f0ff, 0.7, { fixture: 'lamp' });

  // ── The campfire ring ────────────────────────────────────────────────────
  b.floor('dirt', 650, 660, 200, 150);
  b.prop('campfire', 750, 735);
  for (const [x, y, r] of [
    [750, 680, 0],
    [750, 790, 0],
    [680, 735, 90],
    [820, 735, 90],
  ] as const)
    b.prop('bench', x, y, r);
  b.light(750, 735, 260, FIRE, 1.1, { fixture: 'none', flicker: 'soft' });

  // ── The football pitch (east) ────────────────────────────────────────────
  b.floor('grass', 980, 560, 360, 220);
  b.decal({ kind: 'dashrect', x: 990, y: 570, w: 340, h: 200, color: '#d8d4c8', alpha: 0.5 })
    .decal({ kind: 'line', x: 1159, y: 570, w: 2, h: 200, color: '#d8d4c8', alpha: 0.5 })
    .decal({ kind: 'star', x: 1160, y: 670, r: 26, color: '#a8261c', alpha: 0.45 });
  b.prop('goal', 996, 670, 0).prop('goal', 1324, 670, 180);
  b.prop('bench', 1100, 548).prop('bench', 1220, 548).prop('bench', 1100, 792).prop('bench', 1220, 792);
  b.light(1160, 670, 220, SODIUM, 0.55, { fixture: 'none' });

  // ── West: the red shed, tents, a watchtower (spawn A) ────────────────────
  b.wall('roof_garage', 330, 570, 110, 60, 'shed');
  b.prop('tent', 260, 700, 0, 2).prop('tent', 440, 740, 0, 1).prop('crate_green', 340, 660).prop('crate_green', 360, 660).prop('watchtower', 150, 760);
  b.prop('flagpole', 470, 560, 0, 0).prop('flagpole', 500, 560, 0, 2);
  b.light(150, 760, 160, WARM, 0.7, { fixture: 'lamp', flicker: 'soft' });
  // ── East: a watchtower, the camp's van, the boat store ───────────────────
  b.prop('watchtower', 1350, 760).prop('ambulance', 1440, 500, 0, 1).prop('crate_wood', 1290, 820).prop('crate_wood', 1310, 820).prop('tent', 1060, 830, 0, 2);
  b.light(1350, 760, 160, WARM, 0.7, { fixture: 'lamp' });

  // ── Forest and lamps ─────────────────────────────────────────────────────
  for (const [x, y, s] of [
    [40, 60, 70],
    [140, 40, 64],
    [230, 40, 60],
    [610, 60, 56],
    [890, 60, 56],
    [1290, 40, 60],
    [1380, 50, 64],
    [1460, 70, 70],
    [40, 220, 60],
    [1460, 220, 60],
    [620, 470, 50],
    [880, 470, 50],
    [40, 820, 60],
    [560, 790, 56],
    [940, 790, 56],
    [1460, 820, 60],
    [210, 560, 52],
    [1290, 520, 52],
  ] as const)
    b.tree(x, y, s, x + y);
  for (const [x, y] of [
    [640, 160],
    [860, 160],
    [80, 300],
    [1420, 300],
    [600, 520],
    [900, 520],
    [80, 520],
    [1420, 520],
  ] as const) {
    b.prop('lamp_post', x, y);
    b.light(x, y + 8, 150, SODIUM, 0.75, { fixture: 'street', flicker: x === 900 ? 'broken' : 'soft' });
  }
  b.decal({ kind: 'stain', x: 750, y: 470, r: 12, color: '#5a0a08', alpha: 0.5, seed: 11 })
    .decal({ kind: 'stain', x: 330, y: 300, r: 10, color: '#5a0a08', alpha: 0.5, seed: 12 })
    .decal({ kind: 'stain', x: 1170, y: 300, r: 10, color: '#5a0a08', alpha: 0.5, seed: 13 });

  // ── Spawns: A west, B at the gate, C east; seven on each half ────────────
  b.spawn(90, 680, 0)
    .spawn(1410, 680, 180)
    .spawn(712, 60, 90)
    .spawn(788, 60, 90)
    .spawn(80, 150, 45)
    .spawn(1420, 150, 135)
    .spawn(200, 300, 0)
    .spawn(1300, 300, 180)
    .spawn(340, 860, -45)
    .spawn(1160, 860, -135)
    .spawn(530, 600, 0)
    .spawn(970, 600, 180)
    .spawn(600, 220, 45)
    .spawn(900, 220, 135);

  // ── Loot, first aid, «дефицит» drop points ───────────────────────────────
  b.pickup('obrez', 420, 230, 16_000)
    .pickup('obrez', 1080, 230, 16_000)
    .pickup('avtomat', 195, 410, 20_000)
    .pickup('avtomat', 1305, 410, 20_000)
    .pickup('obrez', 485, 410, 16_000)
    .pickup('obrez', 1015, 410, 16_000)
    .pickup('avtomat', 750, 830, 20_000)
    .pickup('avtomat', 750, 140, 20_000);
  b.medkit(750, 585, 18_000).medkit(300, 740, 22_000).medkit(1200, 740, 22_000).medkit(300, 120, 22_000).medkit(1170, 120, 22_000);
  b.supply(750, 505).supply(330, 510).supply(1170, 510).supply(240, 820).supply(1260, 820).supply(750, 380);

  // ── Capture the flag: the west and east edges; bases A by the shed, B at the campfire, C on the pitch ─
  b.flagStand(0, 90, 600).flagStand(1, 1410, 600);
  b.base(330, 510).base(750, 505).base(1170, 510);
  return b.build();
}
