import { MapBuilder } from './builder.js';
import type { MapDef } from './types.js';

/**
 * «Гаражный кооператив» — rows of garages, narrow alleys, open lanes, containers and old cars.
 * Short-range engagements, ambushes and alternative routes. The east yard is split by a chain-link
 * fence that blocks movement but not bullets.
 */
export function buildGaragesMap(): MapDef {
  const W = 1472;
  const H = 992;
  const SODIUM = 0xffb04a;
  const WARM = 0xffcf8a;
  const b = new MapBuilder(
    'garages',
    'Garage Cooperative',
    'Our garages, our laws',
    'Rows of garages, narrow lanes and ambushes at close range.',
    W,
    H,
    'asphalt_cracked',
  )
    .ambient(0x1a2236, 0.44)
    .minimap('#34322f');

  b.floor('dirt', 16, 128, 304, 736)
    .floor('asphalt_cracked', 320, 128, 960, 256)
    .floor('asphalt_cracked', 320, 608, 960, 256)
    .floor('gravel', 1280, 128, 176, 736)
    .floor('dirt', 640, 384, 64, 224)
    .floor('dirt', 960, 384, 64, 224);

  // Boundary: concrete fence panels
  b.hwall('fence_concrete', 0, W, 0, 16)
    .hwall('fence_concrete', 0, W, H - 16, 16)
    .vwall('fence_concrete', 0, 16, H - 16, 16)
    .vwall('fence_concrete', W - 16, 16, H - 16, 16);

  // Garage rows (prop 'garage' is 64x112; rot 0 = door facing south)
  for (let i = 0; i < 20; i++) {
    b.prop('garage', 192 + i * 64, 72, 0, (i * 7) % 5);
    b.prop('garage', 192 + i * 64, 920, 180, (i * 3 + 1) % 5);
  }
  const middle: Array<[number, number]> = [
    [352, 5],
    [736, 4],
    [1056, 4],
  ];
  let n = 0;
  for (const [x0, count] of middle) {
    for (let i = 0; i < count; i++) {
      b.prop('garage', x0 + i * 64, 440, 180, (n * 5 + 2) % 5);
      b.prop('garage', x0 + i * 64, 552, 0, (n * 2 + 3) % 5);
      n++;
    }
  }
  b.decal({ kind: 'text', x: 512, y: 496, text: 'СВОИ ГАРАЖИ', size: 20, color: '#e8dcc0', alpha: 0.7, layer: 'roof', font: 'hand' })
    .decal({ kind: 'text', x: 1152, y: 496, text: 'СВОИ ЗАКОНЫ', size: 20, color: '#e8dcc0', alpha: 0.7, layer: 'roof', font: 'hand' });

  // Guard hut «Сторожка» (W)
  b.floor('wood', 16, 450, 114, 100)
    .hwall('corrugated', 16, 140, 440, 10)
    .hwall('corrugated', 16, 140, 550, 10)
    .vwall('corrugated', 130, 450, 550, 10, [[478, 522]]);
  b.prop('desk', 60, 470).prop('chair', 60, 486).prop('file_cabinet', 110, 534, 0).prop('electric_box', 24, 520, 90);
  b.light(70, 500, 110, WARM, 0.9, { flicker: 'soft' });
  b.decal({ kind: 'text', x: 70, y: 610, text: 'ВЪЕЗД', size: 16, color: '#e8dcc0', alpha: 0.5 })
    .decal({ kind: 'hazard', x: 20, y: 590, w: 120, h: 5, alpha: 0.6 });

  // North lane
  b.prop('car_zhiguli', 420, 256, 90, 2)
    .prop('workbench', 560, 146)
    .prop('tire_stack', 600, 300)
    .prop('tire_stack', 618, 314)
    .prop('tire_stack', 600, 326)
    .prop('container', 900, 256, 90, 2)
    .prop('car_wreck', 1120, 300, 90)
    .prop('trash_container', 250, 180)
    .prop('barrel_rust', 700, 160)
    .prop('barrel_rust', 717, 172)
    .prop('scrap_pile', 1220, 160)
    .prop('crate_wood', 770, 340)
    .prop('crate_wood', 787, 340)
    .prop('crate_wood', 770, 323)
    .prop('lamp_post', 300, 262)
    .prop('lamp_post', 1200, 262);
  b.decal({ kind: 'stain', x: 520, y: 220, r: 26, color: '#1b2633', alpha: 0.6, seed: 2 })
    .decal({ kind: 'stain', x: 1000, y: 180, r: 16, color: '#0e0c0a', alpha: 0.5, seed: 4 })
    .decal({ kind: 'stain', x: 330, y: 150, r: 14, color: '#0e0c0a', alpha: 0.5, seed: 9 });
  b.light(300, 256, 200, SODIUM, 0.85, { fixture: 'street' })
    .light(760, 220, 160, SODIUM, 0.7, { flicker: 'broken', fixture: 'street' })
    .light(1200, 256, 200, SODIUM, 0.85, { fixture: 'street' })
    .light(512, 138, 70, WARM, 0.8, { fixture: 'lamp' })
    .light(1024, 138, 70, WARM, 0.8, { fixture: 'lamp' });
  b.pickup('avtomat', 1000, 330);

  // South lane
  b.prop('container', 520, 736, 90, 0)
    .prop('car_volga', 860, 700, 90, 3)
    .prop('car_zhiguli', 1100, 780, 90, 1)
    .prop('workbench', 330, 846)
    .prop('tire_stack', 700, 820)
    .prop('tire_stack', 718, 832)
    .prop('barrel_red', 1000, 640)
    .prop('barrel_blue', 1016, 652)
    .prop('barrel_red', 1000, 666)
    .prop('scrap_pile', 240, 700)
    .prop('crate_stack', 1230, 680)
    .prop('lamp_post', 300, 730)
    .prop('lamp_post', 1200, 730);
  b.decal({ kind: 'stain', x: 640, y: 760, r: 30, color: '#1b2633', alpha: 0.6, seed: 6 })
    .decal({ kind: 'stain', x: 980, y: 840, r: 14, color: '#0e0c0a', alpha: 0.5, seed: 8 });
  b.light(300, 736, 200, SODIUM, 0.85, { fixture: 'street' })
    .light(760, 760, 170, SODIUM, 0.75, { fixture: 'street', flicker: 'soft' })
    .light(1200, 736, 200, SODIUM, 0.85, { fixture: 'street' })
    .light(448, 856, 70, WARM, 0.8)
    .light(1088, 856, 70, WARM, 0.8);
  b.pickup('avtomat', 440, 660);

  // Alleys through the middle block
  b.prop('barrel_rust', 652, 420).prop('crate_wood', 1010, 590);
  b.light(672, 496, 90, WARM, 0.7, { flicker: 'broken' }).light(992, 496, 90, WARM, 0.6);
  b.pickup('obrez', 672, 520);

  // East yard behind a chain-link fence
  b.vwall('fence_chain', 1338, 128, 864, 4, [
    [300, 364],
    [600, 664],
  ]);
  b.prop('container', 1404, 300, 0, 1)
    .prop('container', 1404, 720, 0, 3)
    .prop('scrap_pile', 1396, 500)
    .prop('car_wreck', 1306, 230, 0)
    .prop('tire_stack', 1300, 470)
    .prop('cable_reel', 1306, 800);
  b.light(1400, 500, 180, SODIUM, 0.75, { fixture: 'street' });
  b.pickup('obrez', 1400, 590);

  b.spawn(200, 160, 0)
    .spawn(1420, 160, 180)
    .spawn(200, 830, 0)
    .spawn(1420, 830, 180)
    .spawn(992, 496, 90)
    .spawn(60, 380, 45);
  // ── Extra loot & «дефицит» drop points ───────────────────────────────────
  b.pickup('obrez', 600, 152, 16_000)
    .pickup('avtomat', 856, 840, 20_000)
    .pickup('obrez', 1144, 736, 16_000)
    .pickup('avtomat', 408, 360, 20_000)
    .pickup('obrez', 1256, 360, 16_000)
    .pickup('avtomat', 52, 632, 20_000);
  b.supply(248, 528).supply(624, 800).supply(824, 192).supply(1144, 192).supply(960, 680).supply(688, 320);
  // first-aid kits in the lanes between the garage blocks
  b.medkit(330, 760).medkit(860, 310).medkit(1266, 644);

  return b.build();
}
