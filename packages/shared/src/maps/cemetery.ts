import { MapBuilder } from './builder.js';
import type { MapDef } from './types.js';

/**
 * «Кладбище» — the old town cemetery at night, from the product owner's layout
 * (references/37-map-kladbishche.png). An iron railing all round with the gate in the north; gravel
 * alleys between fenced family plots (the railings stop you, not bullets; the headstones stop both);
 * the domed chapel in the middle, two smaller chapels west and east, the crypt's sunken entrance in the
 * south, a soldiers' memorial with an eternal flame, the caretaker's lodge and a shed. Statues are
 * generic mourners — no real people. Spawns: A south-west, B at the gate, C south-east.
 */
export function buildCemeteryMap(): MapDef {
  const W = 1500;
  const H = 1000;
  const CANDLE = 0xffa040;
  const LAMP = 0xffc070;
  const MOON = 0x9ab8e8;
  const CRYPT = 0xff3020;
  const b = new MapBuilder(
    'cemetery',
    'Old Cemetery',
    'Everyone ends up here — some sooner than others',
    'Gravel alleys between fenced family plots, a domed chapel in the middle and a crypt in the south. Railings stop you but not bullets; headstones stop both.',
    W,
    H,
    'dirt',
  )
    .ambient(0x1a1828, 0.4)
    .minimap('#33302a');

  /** A family plot: an iron railing (gap on one side) round a patch of grass with graves facing the gap. */
  const plot = (x: number, y: number, w: number, h: number, gap: 'n' | 's' | 'e' | 'w', graves: Array<[number, number, number]>) => {
    b.floor('grass', x + 3, y + 3, w - 6, h - 6);
    const g = 26;
    const cx = x + w / 2;
    const cy = y + h / 2;
    b.hwall('fence_iron', x, x + w, y, 3, gap === 'n' ? [[cx - g / 2, cx + g / 2]] : []);
    b.hwall('fence_iron', x, x + w, y + h - 3, 3, gap === 's' ? [[cx - g / 2, cx + g / 2]] : []);
    b.vwall('fence_iron', x, y + 3, y + h - 3, 3, gap === 'w' ? [[cy - g / 2, cy + g / 2]] : []);
    b.vwall('fence_iron', x + w - 3, y + 3, y + h - 3, 3, gap === 'e' ? [[cy - g / 2, cy + g / 2]] : []);
    const rot = gap === 'n' ? 180 : gap === 'e' ? 270 : gap === 'w' ? 90 : 0;
    // the headstone faces the gap; its flowerbed lies in front of it, towards the gap
    const [fx, fy] = rot === 0 ? [0, 17] : rot === 180 ? [0, -17] : rot === 90 ? [-17, 0] : [17, 0];
    for (const [gx, gy, v] of graves) {
      if (v >= 4) {
        b.prop('tomb', x + gx, y + gy, rot, v % 4);
        continue;
      }
      b.prop('grave', x + gx, y + gy, rot, v);
      b.prop('grave_mound', x + gx + fx, y + gy + fy, rot, (gx + gy + v) % 3);
    }
  };

  // ── Ground: gravel alleys over the dirt ──────────────────────────────────
  b.floor('gravel', 700, 0, 100, 330) // the main alley from the gate
    .floor('gravel', 0, 560, W, 70) // the long east–west alley
    .floor('gravel', 150, 200, 1200, 40) // the upper alley
    .floor('gravel', 150, 830, 1200, 40) // the lower alley
    .floor('gravel', 150, 200, 40, 670) // west alley
    .floor('gravel', 1310, 200, 40, 670) // east alley
    .floor('gravel', 460, 200, 40, 670)
    .floor('gravel', 1000, 200, 40, 670)
    .floor('gravel', 700, 500, 100, 330)
    .floor('paving', 640, 300, 220, 30)
    .floor('paving', 1060, 180, 100, 100)
    .floor('paving', 340, 180, 100, 100);

  // ── The railing all round, the gate in the north ─────────────────────────
  b.hwall('fence_iron', 0, W, 0, 4, [[700, 800]])
    .hwall('fence_concrete', 0, W, H - 14, 14)
    .vwall('fence_iron', 0, 4, H - 14, 4)
    .vwall('fence_iron', W - 4, 4, H - 14, 4);
  b.wall('concrete', 680, 0, 20, 22).wall('concrete', 800, 0, 20, 22);
  b.decal({ kind: 'line', x: 700, y: 6, w: 100, h: 6, color: '#16181c', alpha: 0.95, layer: 'roof' })
    .decal({ kind: 'star', x: 750, y: 9, r: 7, color: '#c8261c', alpha: 0.95, layer: 'roof' })
    .decal({ kind: 'text', x: 750, y: 34, text: 'ВЕЧНАЯ ПАМЯТЬ', size: 8, color: '#a8a08e', alpha: 0.75 });
  b.light(690, 26, 120, LAMP, 0.7, { fixture: 'lamp' }).light(810, 26, 120, LAMP, 0.7, { fixture: 'lamp' });

  // ── North-west: the caretaker's lodge and his old lorry ──────────────────
  b.wall('roof_flat', 230, 24, 130, 90, 'lodge');
  b.decal({ kind: 'text', x: 295, y: 69, text: 'СТОРОЖ', size: 9, color: '#c8b48a', alpha: 0.7, layer: 'roof' });
  b.prop('truck', 120, 120, 90, 0).prop('barrel_rust', 380, 40).prop('barrel_rust', 392, 56).prop('crate_wood', 400, 100);
  b.light(300, 122, 110, LAMP, 0.75, { fixture: 'window', flicker: 'soft' });

  // ── North-east: the tool shed ────────────────────────────────────────────
  b.wall('roof_garage', 1140, 24, 200, 96, 'shed');
  b.decal({ kind: 'star', x: 1240, y: 72, r: 22, color: '#7a1612', alpha: 0.6, layer: 'roof' });
  b.prop('wheelbarrow', 1370, 70, 90).prop('crate_wood', 1110, 50).prop('crate_wood', 1110, 70).prop('cable_reel', 1400, 130);
  b.light(1240, 128, 110, LAMP, 0.7, { fixture: 'window' });

  // ── The domed chapel in the middle ───────────────────────────────────────
  b.wall('roof_church', 670, 340, 160, 160, 'chapel');
  b.prop('dome', 750, 410, 0, 1);
  b.decal({ kind: 'stairs', x: 708, y: 500, w: 84, h: 40 });
  b.prop('column', 692, 516).prop('column', 808, 516);
  b.light(750, 520, 150, CRYPT, 0.75, { fixture: 'none', flicker: 'soft' }).light(750, 470, 70, CANDLE, 0.8, { fixture: 'none' });
  b.prop('mourner', 652, 410).prop('mourner', 848, 410).prop('mourner', 652, 280).prop('mourner', 848, 280);

  // ── West and east chapels ────────────────────────────────────────────────
  b.wall('roof_church', 210, 400, 110, 120, 'chapel_w').wall('roof_church', 1180, 400, 110, 120, 'chapel_e');
  b.prop('dome_small', 265, 440, 0, 0).prop('dome_small', 1235, 440, 0, 0);
  b.decal({ kind: 'stairs', x: 235, y: 520, w: 60, h: 30 }).decal({ kind: 'stairs', x: 1205, y: 520, w: 60, h: 30 });
  b.light(265, 540, 120, CRYPT, 0.6, { fixture: 'none', flicker: 'soft' }).light(1235, 540, 120, CRYPT, 0.6, { fixture: 'none', flicker: 'soft' });

  // ── The memorial with the eternal flame (north-east) and its twin flowerbed (north-west) ──
  b.prop('memorial', 1110, 230).prop('planter', 390, 230);
  b.light(1110, 252, 120, 0xff9a30, 0.9, { fixture: 'none', flicker: 'soft' });

  // ── The crypt: a sunken entrance in the south ────────────────────────────
  b.vwall('concrete', 680, 690, 800, 16).vwall('concrete', 804, 690, 800, 16).hwall('concrete', 680, 820, 784, 16);
  b.floor('concrete_dirty', 696, 690, 108, 94);
  b.decal({ kind: 'stairs', x: 712, y: 712, w: 76, h: 66 }).decal({ kind: 'stain', x: 750, y: 700, r: 14, color: '#5a0a08', alpha: 0.6, seed: 4 });
  b.light(750, 764, 130, CRYPT, 0.95, { fixture: 'none', flicker: 'soft' });
  b.prop('mourner', 650, 712).prop('mourner', 850, 712);

  // ── Family plots: north row, middle row, south row (mirrored east–west) ──
  const north: Array<[number, number, number]> = [
    [22, 42, 0],
    [50, 42, 4],
    [78, 42, 2],
  ];
  plot(240, 250, 100, 70, 's', [
    [24, 22, 1],
    [52, 22, 0],
    [78, 22, 3],
  ]);
  plot(1160, 250, 100, 70, 's', [
    [24, 22, 3],
    [52, 22, 0],
    [78, 22, 1],
  ]);
  plot(520, 240, 110, 80, 's', north);
  plot(870, 240, 110, 80, 's', north);
  plot(340, 400, 100, 120, 'e', [
    [26, 24, 4],
    [26, 60, 0],
    [26, 92, 1],
  ]);
  plot(1060, 400, 100, 120, 'w', [
    [74, 24, 4],
    [74, 60, 0],
    [74, 92, 1],
  ]);
  plot(520, 380, 110, 120, 's', [
    [28, 30, 2],
    [56, 30, 0],
    [84, 30, 3],
    [40, 80, 4],
  ]);
  plot(870, 380, 110, 120, 's', [
    [28, 30, 3],
    [56, 30, 0],
    [84, 30, 2],
    [70, 80, 4],
  ]);
  plot(240, 680, 120, 90, 'n', [
    [26, 56, 0],
    [60, 56, 4],
    [94, 56, 1],
  ]);
  plot(1140, 680, 120, 90, 'n', [
    [26, 56, 1],
    [60, 56, 4],
    [94, 56, 0],
  ]);
  plot(520, 680, 110, 90, 'w', [
    [70, 22, 2],
    [70, 66, 0],
  ]);
  plot(870, 680, 110, 90, 'e', [
    [40, 22, 2],
    [40, 66, 0],
  ]);
  b.prop('wreath', 300, 790).prop('wreath', 1200, 790).prop('wreath', 575, 340).prop('wreath', 925, 340);

  // ── Graves along the alleys (loose ones, no railing) ─────────────────────
  for (const [x, y, v] of [
    [60, 260, 0],
    [90, 260, 3],
    [60, 340, 1],
    [90, 340, 0],
    [60, 420, 2],
    [1440, 260, 0],
    [1410, 260, 3],
    [1440, 340, 1],
    [1410, 340, 0],
    [1440, 420, 2],
  ] as const) {
    b.prop('grave', x, y, 0, v);
    b.prop('grave_mound', x, y + 17, 0, (x + v) % 3);
  }

  // ── Low stone walls, the spawn yards in the south corners ────────────────
  b.wall('fence_concrete', 40, 660, 110, 10).wall('fence_concrete', 1350, 660, 110, 10);
  b.prop('car_wreck', 300, 920, 90, 0).prop('barrel_rust', 40, 840).prop('barrel_rust', 54, 856).prop('crate_wood', 420, 940);
  b.prop('car_volga', 1200, 920, 90, 0).prop('barrel_blue', 1460, 840).prop('barrel_blue', 1446, 856).prop('crate_wood', 1080, 940);
  b.prop('bench', 600, 540).prop('bench', 900, 540).prop('bench', 420, 860).prop('bench', 1080, 860);

  // ── Trees and lamps ──────────────────────────────────────────────────────
  b.tree(80, 130, 60, 1)
    .tree(1420, 130, 60, 2)
    .tree(110, 500, 56, 3)
    .tree(1390, 500, 56, 4)
    .tree(420, 330, 48, 5)
    .tree(1080, 330, 48, 6)
    .tree(600, 900, 56, 7)
    .tree(900, 900, 56, 8)
    .tree(560, 120, 52, 9)
    .tree(940, 120, 52, 10)
    .tree(60, 960, 50, 11)
    .tree(1440, 960, 50, 12);
  b.overhead({ kind: 'bush', x: 380, y: 620, w: 60, h: 30, seed: 3 })
    .overhead({ kind: 'bush', x: 1060, y: 620, w: 60, h: 30, seed: 4 })
    .overhead({ kind: 'bush', x: 200, y: 950, w: 70, h: 30, seed: 5 })
    .overhead({ kind: 'bush', x: 1230, y: 950, w: 70, h: 30, seed: 6 });
  for (const [x, y] of [
    [690, 150],
    [810, 150],
    [430, 610],
    [1070, 610],
    [180, 860],
    [1320, 860],
    [180, 210],
    [1320, 210],
  ] as const) {
    b.prop('lamp_post', x, y);
    b.light(x, y + 8, 150, LAMP, 0.75, { fixture: 'street', flicker: x === 430 || x === 1320 ? 'broken' : 'soft' });
  }
  // candles on the graves, moonlight over the open alley
  for (const [x, y] of [
    [292, 296],
    [1208, 296],
    [575, 300],
    [925, 300],
    [300, 742],
    [1200, 742],
    [592, 712],
    [908, 712],
  ] as const)
    b.light(x, y, 60, CANDLE, 0.7, { fixture: 'none', flicker: 'soft' });
  b.light(750, 600, 260, MOON, 0.35, { fixture: 'none' });
  b.decal({ kind: 'stain', x: 760, y: 120, r: 12, color: '#5a0a08', alpha: 0.5, seed: 1 })
    .decal({ kind: 'stain', x: 470, y: 600, r: 10, color: '#5a0a08', alpha: 0.5, seed: 2 })
    .decal({ kind: 'stain', x: 1030, y: 600, r: 10, color: '#5a0a08', alpha: 0.5, seed: 3 });

  // ── Spawns: A south-west, B at the gate, C south-east; seven on each half ─
  b.spawn(110, 900, -45)
    .spawn(1390, 900, -135)
    .spawn(712, 50, 90)
    .spawn(788, 50, 90)
    .spawn(60, 600, 0)
    .spawn(1440, 600, 180)
    .spawn(250, 160, 45)
    .spawn(1250, 160, 135)
    .spawn(420, 790, -45)
    .spawn(1080, 790, -135)
    .spawn(560, 600, 0)
    .spawn(940, 600, 180)
    .spawn(170, 380, 0)
    .spawn(1330, 380, 180);

  // ── Loot, first aid, «дефицит» drop points ───────────────────────────────
  b.pickup('obrez', 480, 300, 16_000)
    .pickup('obrez', 1020, 300, 16_000)
    .pickup('avtomat', 750, 250, 20_000)
    .pickup('avtomat', 750, 860, 20_000)
    .pickup('obrez', 170, 700, 16_000)
    .pickup('obrez', 1330, 700, 16_000)
    .pickup('avtomat', 480, 760, 20_000)
    .pickup('avtomat', 1020, 760, 20_000);
  b.medkit(750, 740, 20_000).medkit(110, 300, 20_000).medkit(1390, 300, 20_000).medkit(300, 600, 22_000).medkit(1200, 600, 22_000);
  b.supply(750, 595).supply(330, 860).supply(1170, 860).supply(480, 470).supply(1020, 470).supply(750, 180);

  // ── Capture the flag: deep west and east; base capture: A west, B by the chapel steps, C east ─
  b.flagStand(0, 80, 760).flagStand(1, 1420, 760);
  b.base(300, 595).base(750, 595).base(1200, 595);
  return b.build();
}
