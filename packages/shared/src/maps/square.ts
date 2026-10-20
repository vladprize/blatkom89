import { MapBuilder } from './builder.js';
import type { MapDef } from './types.js';

/**
 * «Красная площадь» — the main square on a night of unrest, from the product owner's layout
 * (references/38-map-krasnaya-ploshchad.png). The fortress wall with three towers closes the north
 * (spawn B at the gate of the clock tower), the many-domed cathedral stands in the east (spawn C behind
 * it), the museum in the west (spawn A); the stepped granite tribune with grandstands is in the middle,
 * an obelisk with an eternal flame south of it, and between them army lorries, armoured carriers,
 * tents, sandbags and barriers. No portraits and no names of real people anywhere: the tower carries a
 * red star, the tribune is just a tribune.
 */
export function buildSquareMap(): MapDef {
  const W = 1500;
  const H = 1000;
  const SODIUM = 0xffb04a;
  const RED = 0xff3a26;
  const WARM = 0xffcf8a;
  const COLD = 0xbcd4ff;
  const b = new MapBuilder(
    'square',
    'Red Square',
    'The country’s main square — tonight it belongs to the district',
    'The fortress wall, the many-domed cathedral and the granite tribune; army lorries, armoured carriers and barricades all over the cobbles. Wide open ground between solid cover.',
    W,
    H,
    'cobble',
  )
    .ambient(0x241a24, 0.46)
    .minimap('#3a2e2a');

  // ── North: the fortress wall, three towers, firs and banners ─────────────
  b.wall('kremlin', 0, 0, W, 110, 'kremlin');
  b.wall('kremlin', 680, 0, 140, 170, 'tower_c').wall('kremlin', 190, 0, 100, 140, 'tower_w').wall('kremlin', 1210, 0, 100, 140, 'tower_e');
  b.prop('spire', 750, 80).prop('spire', 240, 66).prop('spire', 1260, 66);
  // the clock face and the gate under it; a red star instead of any portrait
  b.decal({ kind: 'line', x: 722, y: 120, w: 56, h: 50, color: '#14100e', alpha: 0.95, layer: 'roof' })
    .decal({ kind: 'star', x: 750, y: 138, r: 12, color: '#d8262a', alpha: 0.95, layer: 'roof' })
    .decal({ kind: 'text', x: 750, y: 160, text: '1989', size: 7, color: '#e8c060', alpha: 0.9, layer: 'roof' });
  // swallow-tail merlons along the wall's face
  for (let x = 6; x < W; x += 22) {
    if ((x > 674 && x < 826) || (x > 184 && x < 296) || (x > 1204 && x < 1316)) continue;
    b.decal({ kind: 'line', x, y: 102, w: 12, h: 8, color: '#5a120e', alpha: 0.95, layer: 'roof' });
  }
  b.floor('grass', 0, 110, W, 60);
  for (const x of [80, 140, 350, 420, 490, 560, 620, 880, 940, 1010, 1080, 1150, 1360, 1420]) b.tree(x, 140, 40, x);
  for (const x of [330, 520, 980, 1170]) b.prop('flagpole', x, 182, 0, 0);
  b.light(750, 190, 200, RED, 0.85, { fixture: 'none' })
    .light(240, 160, 140, SODIUM, 0.7, { fixture: 'street' })
    .light(1260, 160, 140, SODIUM, 0.7, { fixture: 'street' });

  // ── West: the museum (spawn A at its door) ───────────────────────────────
  b.wall('brick', 0, 210, 170, 170, 'museum').wall('brick', 0, 600, 170, 160, 'museum_s');
  b.prop('spire', 34, 236).prop('spire', 136, 236);
  b.decal({ kind: 'text', x: 85, y: 300, text: 'МУЗЕЙ', size: 12, color: '#e8d0a0', alpha: 0.7, layer: 'roof' });
  b.floor('asphalt', 0, 380, 200, 220);
  b.decal({ kind: 'stairs', x: 172, y: 430, w: 28, h: 120 });
  b.light(190, 470, 160, WARM, 0.8, { fixture: 'street' });

  // ── East: the many-domed cathedral (spawn C behind it) ───────────────────
  b.wall('roof_church', 1180, 260, 230, 280, 'cathedral');
  b.prop('dome', 1295, 400, 0, 1)
    .prop('dome_small', 1220, 300, 0, 2)
    .prop('dome_small', 1370, 300, 0, 3)
    .prop('dome_small', 1220, 500, 0, 4)
    .prop('dome_small', 1370, 500, 0, 5)
    .prop('dome_small', 1295, 300, 0, 3)
    .prop('dome_small', 1295, 500, 0, 2)
    .prop('dome_small', 1220, 400, 0, 5)
    .prop('dome_small', 1370, 400, 0, 4);
  b.floor('marble', 1160, 240, 270, 320);
  b.light(1295, 250, 160, WARM, 0.8, { fixture: 'none' }).light(1295, 560, 160, WARM, 0.8, { fixture: 'none' });

  // ── The tribune and its grandstands ──────────────────────────────────────
  b.wall('granite', 680, 380, 140, 120, 'tribune');
  b.decal({ kind: 'line', x: 694, y: 394, w: 112, h: 92, color: '#2a1414', alpha: 0.55, layer: 'roof' })
    .decal({ kind: 'line', x: 712, y: 412, w: 76, h: 56, color: '#3e1c1a', alpha: 0.6, layer: 'roof' })
    .decal({ kind: 'star', x: 750, y: 440, r: 11, color: '#c8261c', alpha: 0.9, layer: 'roof' });
  b.decal({ kind: 'stairs', x: 712, y: 500, w: 76, h: 30 });
  for (const sx of [0, 1]) {
    const x0 = sx ? 840 : 540;
    b.wall('fence_concrete', x0, 390, 120, 10);
    b.prop('bench_row', x0 + 60, 420).prop('bench_row', x0 + 60, 446).prop('bench_row', x0 + 60, 472);
    for (let i = 0; i < 4; i++) b.prop('flagpole', x0 + 15 + i * 30, 376, 0, i % 3);
  }
  b.light(600, 430, 140, RED, 0.6, { fixture: 'none' }).light(900, 430, 140, RED, 0.6, { fixture: 'none' }).light(750, 520, 150, WARM, 0.7, { fixture: 'none' });

  // ── The obelisk with the eternal flame, its platform and barriers ────────
  b.floor('marble', 680, 640, 140, 120);
  b.decal({ kind: 'stairs', x: 690, y: 760, w: 120, h: 26 });
  b.prop('memorial', 750, 690);
  for (const [x, y] of [
    [690, 650],
    [810, 650],
    [690, 750],
    [810, 750],
  ] as const)
    b.prop('flagpole', x, y, 0, 1);
  b.prop('barrier', 620, 640, 90).prop('barrier', 880, 640, 90).prop('barrier', 620, 760, 90).prop('barrier', 880, 760, 90);
  b.light(750, 712, 180, 0xff9a30, 1.0, { fixture: 'none', flicker: 'soft' });

  // ── The army on the square: lorries, carriers, tents, barricades ─────────
  b.prop('truck', 330, 250, 90, 1)
    .prop('btr', 580, 260, 90)
    .prop('btr', 920, 260, 270)
    .prop('truck', 1080, 600, 270, 1)
    .prop('btr', 420, 620, 90)
    .prop('truck', 270, 820, 90, 0)
    .prop('btr', 1180, 820, 270)
    .prop('tent', 300, 460, 0, 1)
    .prop('tent', 370, 460, 0, 1)
    .prop('tent', 1110, 700, 0, 0)
    .prop('crate_green', 450, 470)
    .prop('crate_green', 450, 486)
    .prop('crate_green', 1040, 700)
    .prop('crate_green', 1040, 716)
    .prop('sandbags', 690, 244)
    .prop('sandbags', 810, 244)
    .prop('sandbags', 480, 360)
    .prop('sandbags', 1020, 360)
    .prop('sandbags', 530, 780)
    .prop('sandbags', 970, 780)
    .prop('hedgehog', 560, 560)
    .prop('hedgehog', 940, 560)
    .prop('hedgehog', 250, 380)
    .prop('hedgehog', 1250, 640)
    .prop('hedgehog', 640, 860)
    .prop('hedgehog', 860, 860)
    .prop('barrier', 470, 540)
    .prop('barrier', 1030, 540)
    .prop('produce_stall', 1100, 470, 0, 1)
    .prop('kiosk', 400, 760, 90)
    .prop('kiosk', 1430, 760, 270);
  // zebra crossings on the cobbles
  for (let i = 0; i < 6; i++) {
    b.decal({ kind: 'line', x: 222 + i * 12, y: 600, w: 7, h: 56, color: '#d8d4c8', alpha: 0.55 });
    b.decal({ kind: 'line', x: 1220 + i * 12, y: 600, w: 7, h: 56, color: '#d8d4c8', alpha: 0.55 });
  }

  // ── South: the arcade roofs and the street down the middle ───────────────
  b.wall('roof_flat', 0, 890, 650, 110, 'arcade_w').wall('roof_flat', 850, 890, 650, 110, 'arcade_e');
  for (let x = 30; x < 640; x += 80) b.decal({ kind: 'line', x, y: 920, w: 50, h: 52, color: '#2c4a5a', alpha: 0.55, layer: 'roof' });
  for (let x = 880; x < 1490; x += 80) b.decal({ kind: 'line', x, y: 920, w: 50, h: 52, color: '#2c4a5a', alpha: 0.55, layer: 'roof' });
  b.floor('asphalt', 0, 840, W, 50).floor('asphalt', 650, 890, 200, 110);
  b.decal({ kind: 'stairs', x: 680, y: 920, w: 140, h: 70 });
  for (const x of [180, 520, 980, 1320]) {
    b.prop('lamp_post', x, 870);
    b.light(x, 878, 170, SODIUM, 0.8, { fixture: 'street', flicker: x === 520 ? 'broken' : 'soft' });
  }
  for (const [x, y] of [
    [250, 560],
    [1250, 560],
    [560, 330],
    [940, 330],
    [520, 700],
    [980, 700],
  ] as const) {
    b.prop('lamp_post', x, y);
    b.light(x, y + 8, 160, SODIUM, 0.75, { fixture: 'street' });
  }
  b.light(400, 300, 180, COLD, 0.35, { fixture: 'none' }).light(1100, 300, 180, COLD, 0.35, { fixture: 'none' });
  b.decal({ kind: 'stain', x: 760, y: 600, r: 14, color: '#5a0a08', alpha: 0.55, seed: 7 })
    .decal({ kind: 'stain', x: 420, y: 700, r: 10, color: '#5a0a08', alpha: 0.5, seed: 8 })
    .decal({ kind: 'stain', x: 1080, y: 420, r: 10, color: '#5a0a08', alpha: 0.5, seed: 9 });

  // ── Spawns: A west at the museum, B at the clock tower, C east behind the cathedral ─
  b.spawn(100, 470, 0)
    .spawn(1450, 600, 180)
    .spawn(714, 200, 90)
    .spawn(786, 200, 90)
    .spawn(250, 190, 45)
    .spawn(1250, 190, 135)
    .spawn(330, 560, 0)
    .spawn(1170, 640, 180)
    .spawn(120, 800, -45)
    .spawn(1380, 800, -135)
    .spawn(560, 840, -60)
    .spawn(940, 840, -120)
    .spawn(470, 200, 60)
    .spawn(1450, 200, 120);

  // ── Loot, first aid, «дефицит» drop points ───────────────────────────────
  b.pickup('avtomat', 750, 590, 20_000)
    .pickup('obrez', 420, 380, 16_000)
    .pickup('obrez', 1080, 380, 16_000)
    .pickup('avtomat', 300, 700, 20_000)
    .pickup('avtomat', 1200, 720, 20_000)
    .pickup('obrez', 750, 850, 16_000)
    .pickup('obrez', 220, 690, 16_000)
    .pickup('obrez', 1440, 680, 16_000);
  b.medkit(750, 300, 20_000).medkit(200, 360, 22_000).medkit(1440, 240, 22_000).medkit(360, 860, 20_000).medkit(1140, 860, 20_000);
  b.supply(750, 590).supply(330, 380).supply(1100, 380).supply(560, 680).supply(940, 680).supply(750, 850);

  // ── Capture the flag: the museum steps and behind the cathedral; bases A, B, C ─
  b.flagStand(0, 80, 540).flagStand(1, 1440, 680);
  b.base(330, 560).base(750, 585).base(1170, 640);
  return b.build();
}
