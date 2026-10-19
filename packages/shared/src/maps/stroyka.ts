import { MapBuilder } from './builder.js';
import type { MapDef } from './types.js';

/**
 * «Стройка» — a half-built housing block at night, from the product owner's layout
 * (references/19-map-stroyka.png). A tower crane swings its jib over the central pit (the danger
 * zone); unfinished concrete sections form rooms and corridors; bricks, cinder blocks, pipes and
 * timber are the cover. Spawns: A west, B north, C east (+ south and corners).
 */
export function buildStroykaMap(): MapDef {
  const W = 1440;
  const H = 900;
  const SODIUM = 0xffb04a;
  const WARM = 0xffcf8a;
  const RED = 0xff3a2a;
  const b = new MapBuilder(
    'stroyka',
    'Construction Site',
    'Building the future together',
    'A half-built block under the crane: concrete sections, a pit in the middle and stacks of bricks. Close quarters inside, open lanes outside.',
    W,
    H,
    'dirt',
  )
    .ambient(0x1c2232, 0.44)
    .minimap('#4a3c2c');

  // ── Ground ───────────────────────────────────────────────────────────────
  b.floor('gravel', 626, 330, 220, 160) // the pit
    .floor('sand', 1060, 790, 150, 90)
    .floor('gravel', 1020, 12, 300, 70);
  // trodden paths: lighter, packed earth along the main routes
  for (const [x, y, r, seed] of [
    [210, 380, 46, 31],
    [214, 520, 44, 32],
    [300, 230, 40, 33],
    [600, 580, 42, 34],
    [700, 580, 40, 35],
    [1270, 360, 44, 36],
    [1276, 520, 46, 37],
    [1270, 680, 42, 38],
    [420, 780, 44, 39],
    [640, 790, 42, 40],
    [900, 460, 40, 41],
  ] as const)
    b.decal({ kind: 'stain', x, y, r, color: '#7a6448', alpha: 0.35, seed });

  // ── Boundary: the neighbouring warehouse (NW), site fences ───────────────
  b.wall('roof_flat', 0, 0, 270, 160, 'neighbour')
    .hwall('corrugated', 270, W, 0, 12)
    .vwall('corrugated', 0, 160, H - 20, 12)
    .vwall('corrugated', W - 12, 12, H - 20, 12)
    .hwall('fence_concrete', 0, W, H - 20, 20);
  // banners on the south fence: «СТРОИМ БУДУЩЕЕ ВМЕСТЕ!» and «БЕРЕГИСЬ КРАНА!»
  for (const [x, w] of [
    [250, 110],
    [380, 130],
    [530, 120],
  ] as const)
    b.decal({ kind: 'line', x, y: H - 18, w, h: 16, color: '#7a1c16', alpha: 0.95, layer: 'roof' });
  b.decal({ kind: 'text', x: 305, y: H - 10, text: 'СТРОИМ', size: 11, color: '#e8dcc0', alpha: 0.9, layer: 'roof' })
    .decal({ kind: 'text', x: 445, y: H - 10, text: 'БУДУЩЕЕ', size: 11, color: '#e8dcc0', alpha: 0.9, layer: 'roof' })
    .decal({ kind: 'text', x: 590, y: H - 10, text: 'ВМЕСТЕ!', size: 11, color: '#e8dcc0', alpha: 0.9, layer: 'roof' })
    .decal({ kind: 'line', x: 1240, y: H - 18, w: 130, h: 16, color: '#d9c7a3', alpha: 0.9, layer: 'roof' })
    .decal({ kind: 'text', x: 1305, y: H - 10, text: 'БЕРЕГИСЬ КРАНА!', size: 9, color: '#9e2a22', alpha: 0.95, layer: 'roof' })
    .decal({ kind: 'text', x: 135, y: 80, text: 'СКЛАД СМУ-4', size: 12, color: '#d9c7a3', alpha: 0.5, layer: 'roof' });

  // ── West: stair tower, site cabin, spawn A ───────────────────────────────
  b.room('concrete', 20, 160, 90, 180, 10, [{ side: 'e', at: 126, width: 36 }], 'concrete_slab')
    .decal({ kind: 'stairs', x: 34, y: 174, w: 36, h: 120 })
    .decal({ kind: 'text', x: 64, y: 316, text: 'ЛЕСТН.', size: 8, color: '#d9c7a3', alpha: 0.5 });
  b.prop('container', 96, 545, 0, 1)
    .prop('timber', 160, 520, 90)
    .prop('timber', 182, 520, 90)
    .prop('pallet', 171, 566)
    .prop('barrel_rust', 230, 560)
    .prop('barrel_rust', 246, 572)
    .prop('brick_pallet', 84, 628)
    .prop('brick_pallet', 110, 628)
    .prop('barrel_rust', 150, 220)
    .prop('barrel_rust', 166, 232)
    .prop('barrel_blue', 150, 246)
    .prop('lamp_post', 214, 392);
  b.light(214, 400, 200, SODIUM, 0.85, { fixture: 'street' }).light(64, 250, 110, WARM, 0.7, { flicker: 'soft' });
  b.spawn(154, 430, 0).spawn(120, 830, -45);
  b.decal({ kind: 'stain', x: 196, y: 470, r: 26, color: '#2c241a', alpha: 0.5, seed: 4 });

  // ── NW yard: blocks and bricks ───────────────────────────────────────────
  b.prop('cinder_blocks', 306, 96)
    .prop('cinder_blocks', 330, 96)
    .prop('cinder_blocks', 306, 120)
    .prop('barrel_blue', 302, 152)
    .prop('brick_pallet', 226, 240)
    .prop('cinder_blocks', 276, 248)
    .prop('cinder_blocks', 228, 312)
    .prop('cinder_blocks', 252, 312)
    .prop('brick_pallet', 290, 316)
    .prop('timber', 421, 150, 90)
    .prop('timber', 421, 200, 90)
    .prop('cement_bags', 380, 44);
  b.light(330, 60, 160, SODIUM, 0.7, { fixture: 'street', flicker: 'soft' });

  // ── North: section 1, the crane, section 2, spawn B ──────────────────────
  b.room('concrete', 446, 96, 104, 164, 10, [
    { side: 's', at: 30, width: 36 },
    { side: 'e', at: 70, width: 34 },
  ], 'concrete_dirty');
  b.prop('brick_pallet', 480, 140).prop('cement_bags', 520, 126).prop('timber', 492, 226).prop('wheelbarrow', 520, 200, 90);
  b.light(498, 176, 110, WARM, 0.75, { flicker: 'soft' });
  b.decal({ kind: 'text', x: 498, y: 112, text: 'СЕКЦИЯ 1', size: 9, color: '#d9c7a3', alpha: 0.45 });

  b.prop('crane_mast', 621, 290)
    .prop('cinder_blocks', 584, 254)
    .prop('cinder_blocks', 584, 330)
    .prop('sandbags', 640, 344)
    .prop('cable_reel', 690, 130)
    .prop('cable_reel', 708, 150)
    .prop('electric_box', 600, 20, 0);
  b.overhead({ kind: 'crane', x: 621, y: 290, w: 330, h: 262, angle: 28, seed: 3 });
  b.decal({ kind: 'hazard', x: 600, y: 270, w: 42, h: 5, alpha: 0.8 });

  b.room('concrete', 706, 196, 220, 96, 10, [
    { side: 'w', at: 30, width: 36 },
    { side: 's', at: 96, width: 40 },
    { side: 'e', at: 30, width: 36 },
  ], 'concrete_slab');
  b.decal({ kind: 'hazard', x: 706, y: 186, w: 220, h: 7, alpha: 0.85 });
  b.prop('cinder_blocks', 760, 240).prop('brick_pallet', 850, 228).prop('cement_bags', 884, 262).prop('rebar', 790, 270);
  b.light(816, 244, 120, WARM, 0.8, { flicker: 'soft' });
  b.decal({ kind: 'text', x: 816, y: 214, text: 'СЕКЦИЯ 2', size: 9, color: '#d9c7a3', alpha: 0.45 });

  b.room('concrete', 936, 56, 84, 180, 10, [
    { side: 'w', at: 120, width: 36 },
    { side: 's', at: 24, width: 36 },
    { side: 'n', at: 24, width: 36 },
  ], 'concrete_dirty');
  b.decal({ kind: 'stairs', x: 986, y: 88, w: 24, h: 70 });
  b.prop('cinder_blocks', 960, 196);
  b.light(978, 146, 100, WARM, 0.7);

  b.prop('brick_pallet', 752, 140)
    .prop('brick_pallet', 778, 140)
    .prop('cinder_blocks', 812, 128)
    .prop('cinder_blocks', 836, 128)
    .prop('barrel_red', 660, 40)
    .prop('barrel_red', 676, 52)
    .prop('lamp_post', 880, 30);
  b.light(880, 40, 190, SODIUM, 0.85, { fixture: 'street' });
  b.spawn(786, 60, 90);

  // ── NE: site cabin, mixer truck, section 3 ───────────────────────────────
  b.prop('container', 1118, 40, 90, 1)
    .prop('barrel_rust', 1215, 30)
    .prop('barrel_rust', 1232, 42)
    .prop('tire_stack', 1252, 28)
    .prop('mixer_truck', 1340, 150)
    .prop('concrete_pipes', 1300, 255, 90)
    .prop('lamp_post', 1260, 120);
  b.room('concrete', 1096, 100, 130, 140, 10, [
    { side: 'w', at: 50, width: 36 },
    { side: 's', at: 46, width: 36 },
  ], 'concrete_dirty');
  b.prop('barrel_blue', 1180, 136).prop('barrel_blue', 1196, 148).prop('barrel_blue', 1180, 160).prop('cinder_blocks', 1130, 210);
  b.light(1161, 170, 110, WARM, 0.7, { flicker: 'broken' }).light(1270, 130, 190, SODIUM, 0.8, { fixture: 'street' });
  b.spawn(1290, 50, 135);

  // ── Centre-west: sections 4–5 ────────────────────────────────────────────
  b.room('concrete', 356, 266, 180, 150, 10, [
    { side: 'n', at: 60, width: 36 },
    { side: 'e', at: 56, width: 36 },
    { side: 's', at: 20, width: 36 },
  ], 'concrete_slab');
  b.room('concrete', 356, 406, 180, 160, 10, [
    { side: 'n', at: 20, width: 36 },
    { side: 'w', at: 50, width: 36 },
    { side: 'e', at: 90, width: 36 },
    { side: 's', at: 110, width: 36 },
  ], 'concrete_slab');
  b.decal({ kind: 'stairs', x: 372, y: 282, w: 30, h: 84 })
    .decal({ kind: 'text', x: 470, y: 290, text: 'СЕКЦИЯ 4', size: 9, color: '#d9c7a3', alpha: 0.45 })
    .decal({ kind: 'star', x: 500, y: 440, r: 11, color: '#9e2a22', alpha: 0.55 });
  b.prop('brick_pallet', 480, 330).prop('timber', 474, 384).prop('cinder_blocks', 420, 470).prop('cement_bags', 500, 520).prop('wheelbarrow', 440, 532);
  b.light(446, 340, 120, WARM, 0.8, { flicker: 'soft' }).light(446, 486, 120, WARM, 0.75);
  b.prop('timber', 330, 500, 90).prop('brick_pallet', 296, 575).prop('brick_pallet', 322, 575).prop('brick_pallet', 296, 597).prop('cinder_blocks', 340, 600);

  // ── The pit (danger zone under the crane) ────────────────────────────────
  b.decal({ kind: 'dashrect', x: 626, y: 330, w: 220, h: 160, color: '#c8312a', alpha: 0.85 })
    .decal({ kind: 'dashrect', x: 838, y: 404, w: 64, h: 52, color: '#c8312a', alpha: 0.7 })
    .decal({ kind: 'text', x: 736, y: 346, text: 'ОПАСНАЯ ЗОНА', size: 10, color: '#c8312a', alpha: 0.7 })
    .decal({ kind: 'stain', x: 700, y: 430, r: 30, color: '#1c1610', alpha: 0.5, seed: 9 });
  b.prop('crate_wood', 660, 372).prop('brick_pallet', 744, 452).prop('timber', 806, 400, 90).prop('rebar', 690, 470).prop('wheelbarrow', 604, 470);
  b.light(736, 410, 220, SODIUM, 0.9, { fixture: 'none' }).light(632, 470, 70, RED, 0.9, { flicker: 'broken', fixture: 'neon' });
  b.supply(736, 410);

  // ── Centre-east: sections 6–7 ────────────────────────────────────────────
  b.room('concrete', 951, 280, 120, 150, 10, [
    { side: 'w', at: 60, width: 36 },
    { side: 'n', at: 40, width: 36 },
    { side: 's', at: 40, width: 36 },
    { side: 'e', at: 90, width: 36 },
  ], 'concrete_slab');
  b.room('concrete', 1061, 280, 165, 150, 10, [
    { side: 'w', at: 90, width: 36 },
    { side: 'e', at: 56, width: 36 },
    { side: 's', at: 100, width: 36 },
    { side: 'n', at: 60, width: 36 },
  ], 'concrete_dirty');
  b.prop('brick_pallet', 1000, 320).prop('brick_pallet', 1026, 320).prop('cinder_blocks', 990, 396);
  b.prop('crate_stack', 1120, 318).prop('brick_pallet', 1186, 396).prop('cement_bags', 1100, 400);
  b.light(1011, 356, 110, WARM, 0.75).light(1143, 356, 120, WARM, 0.8, { flicker: 'soft' });
  b.decal({ kind: 'text', x: 1143, y: 296, text: 'СЕКЦИЯ 7', size: 9, color: '#d9c7a3', alpha: 0.45 });

  // ── East: cabins, pipes, spawn C ─────────────────────────────────────────
  b.prop('container', 1400, 360, 0, 1)
    .prop('container', 1400, 600, 0, 0)
    .prop('concrete_pipes', 1300, 620, 90)
    .prop('crate_wood', 1340, 666)
    .prop('crate_wood', 1357, 666)
    .prop('container', 1366, 720, 90, 1)
    .prop('lamp_post', 1330, 470)
    .prop('scaffold', 1210, 600, 90);
  b.light(1330, 478, 200, SODIUM, 0.85, { fixture: 'street' }).light(1390, 790, 160, SODIUM, 0.7, { fixture: 'street', flicker: 'soft' });
  b.spawn(1386, 455, 180).spawn(1360, 840, -135);

  // ── South: sections 8–10 ─────────────────────────────────────────────────
  b.room('concrete', 796, 520, 140, 210, 10, [
    { side: 'n', at: 40, width: 36 },
    { side: 's', at: 60, width: 36 },
    { side: 'w', at: 100, width: 36 },
    { side: 'e', at: 80, width: 36 },
  ], 'concrete_slab');
  b.room('concrete', 926, 580, 150, 150, 10, [
    { side: 'w', at: 20, width: 36 },
    { side: 'n', at: 50, width: 40 },
    { side: 's', at: 40, width: 36 },
    { side: 'e', at: 60, width: 36 },
  ], 'concrete_dirty');
  b.room('concrete', 1066, 470, 130, 260, 10, [
    { side: 'n', at: 40, width: 36 },
    { side: 'w', at: 170, width: 36 },
    { side: 's', at: 40, width: 36 },
    { side: 'e', at: 110, width: 36 },
  ], 'concrete_dirty');
  b.decal({ kind: 'stairs', x: 1080, y: 490, w: 40, h: 90 })
    .decal({ kind: 'text', x: 866, y: 540, text: 'КОРПУС №2', size: 10, color: '#d9c7a3', alpha: 0.45 });
  b.prop('cinder_blocks', 840, 566).prop('timber', 880, 650).prop('brick_pallet', 900, 548);
  b.prop('brick_pallet', 1000, 624).prop('cement_bags', 966, 690);
  b.prop('crate_stack', 1160, 520).prop('barrel_blue', 1170, 664).prop('rebar', 1130, 610);
  b.light(866, 625, 120, WARM, 0.8).light(1001, 655, 110, WARM, 0.7, { flicker: 'soft' }).light(1131, 610, 130, WARM, 0.75);

  b.room('concrete', 446, 606, 180, 120, 10, [
    { side: 'n', at: 70, width: 40 },
    { side: 'e', at: 40, width: 36 },
    { side: 'w', at: 40, width: 36 },
  ], 'concrete_slab');
  b.prop('crate_stack', 500, 660).prop('cement_bags', 584, 692).prop('wheelbarrow', 560, 640, 90);
  b.light(536, 666, 120, WARM, 0.75, { flicker: 'broken' });

  // south yard: bricks, blocks, pipes, the excavator and the sand pile
  b.prop('brick_pallet', 330, 710, 90)
    .prop('brick_pallet', 330, 736, 90)
    .prop('brick_pallet', 330, 762, 90)
    .prop('cinder_blocks', 380, 740)
    .prop('cinder_blocks', 404, 740)
    .prop('concrete_pipes', 420, 800)
    .prop('concrete_pipes', 420, 842)
    .prop('cinder_blocks', 270, 800)
    .prop('cinder_blocks', 294, 800)
    .prop('barrel_red', 300, 842)
    .prop('timber', 240, 700, 90)
    .prop('timber', 258, 700, 90)
    .prop('crate_wood', 600, 780)
    .prop('crate_green', 626, 792)
    .prop('brick_pallet', 530, 842)
    .prop('brick_pallet', 556, 842)
    .prop('container', 730, 836, 90, 1)
    .prop('brick_pallet', 720, 770)
    .prop('brick_pallet', 746, 770)
    .prop('crate_wood', 772, 770)
    .prop('container', 1006, 815, 0, 0)
    .prop('barrel_rust', 1066, 790)
    .prop('barrel_rust', 1082, 802)
    .prop('barrel_blue', 1066, 814)
    .prop('sand_pile', 1130, 845)
    .prop('excavator', 1205, 820)
    .prop('timber', 1262, 760, 90)
    .prop('lamp_post', 640, 740)
    .prop('lamp_post', 920, 790);
  b.light(640, 748, 200, SODIUM, 0.85, { fixture: 'street' })
    .light(920, 798, 200, SODIUM, 0.8, { fixture: 'street', flicker: 'soft' })
    .light(300, 760, 170, SODIUM, 0.7, { fixture: 'street' })
    .light(1160, 760, 150, WARM, 0.6);
  b.decal({ kind: 'stain', x: 1130, y: 760, r: 36, color: '#3a3024', alpha: 0.45, seed: 15 })
    .decal({ kind: 'stain', x: 860, y: 790, r: 28, color: '#1c1610', alpha: 0.4, seed: 17 })
    .decal({ kind: 'stain', x: 560, y: 470, r: 22, color: '#8a8478', alpha: 0.25, seed: 19 });
  b.spawn(600, 845, -90);

  // ── Loot, first aid, «дефицит» drop points ───────────────────────────────
  b.pickup('obrez', 360, 200, 16_000)
    .pickup('avtomat', 500, 180, 20_000)
    .pickup('obrez', 820, 250, 16_000)
    .pickup('avtomat', 1006, 360, 20_000)
    .pickup('obrez', 450, 340, 16_000)
    .pickup('avtomat', 870, 620, 20_000)
    .pickup('obrez', 1130, 660, 16_000)
    .pickup('avtomat', 520, 790, 20_000)
    .pickup('obrez', 1270, 540, 16_000);
  b.medkit(150, 690).medkit(706, 110).medkit(1310, 400).medkit(940, 800);
  b.supply(300, 470).supply(1160, 190).supply(640, 820).supply(1250, 700).supply(880, 70);

  // more spawn points for 10-player rooms: seven on each half (team matches start on their own half)
  b.spawn(340, 36, 45).spawn(572, 420, 0).spawn(964, 620, -135).spawn(372, 644, -45).spawn(1044, 252, 135).spawn(68, 196, 0).spawn(1076, 852, -135);
  // capture the flag: a stand deep in each team's half; base capture: A (red side), B (middle), C (blue side)
  b.flagStand(0, 72, 440).flagStand(1, 1368, 456);
  b.base(264, 448).base(664, 448).base(1000, 496);
  return b.build();
}
