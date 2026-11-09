# Art direction and asset pipeline

## 1. Reference images

The product owner supplied 39 reference images (22 at the start, the rest during v0.22–v0.23). They are kept unchanged in `references/` and are
**not** used as game screens:

| File | Used for |
|---|---|
| `01-poster.png` | Identity: logo treatment (red distressed letters, «’89» hand-written, star, tagline band), palette, menu mood |
| `02-gameplay-factory-checkpoint.png` | Content and mood of the flagship map «Заводская проходная» (checkpoint «ПРОХОДНАЯ» with stars, «СЛАВА ТРУДУ!», «ЦЕХ №3», the red floor arrow «В ЦЕХ», hazard stripes, barrels, forklift, tanks, pipes, warm sodium lamps, blood decals) and the HUD layout (red/blue score boxes around the timer, «ДЕЗМАТЧ · N УБИЙСТВ», minimap with a tape label, kill feed top-left, portrait + HP panel bottom-left, weapon/ammo panel + three slots bottom-right) |
| `03…06-*.png` (character sheets) | Silhouettes, clothing and palettes of Петя, Валюта, Участковый, Михалыч. The «ПОРТРЕТ В ИГРЕ» panel of each sheet is cut out by `tools/extract-portraits.py` and used as the in-game portrait (character select, lobby, HUD, scoreboard, results) — it was drawn for exactly that purpose |
| `07-maps-overview.png` | The first three maps, their names and themes |
| `08…16-*.png`, `18-oryol-pendos.png` (character sheets) | The ten Arsenal characters — Karlych «Informant» (crow), Sonka «Temptress» (snake), Zhora «Businessman» (shark), Tolyan «Techie» (monitor lizard), Lyova «Mercenary» (leopard), Batya «The Roof» (elephant), Gosha «Liaison» (parrot), Slavik «Fence» (lobster), Vityok «Madman» (piranha), Garik «Pendos» (eagle): silhouettes, clothes, palettes, lore; their «ПОРТРЕТ В ИГРЕ» panels become the in-game portraits |
| `27…36-*.png` (character sheets, v0.23) | Ten more characters — a cat, a pigeon, a cockroach, a rat, a lion, a buffalo, a rhino, a gorilla, a pig and a fox: silhouettes, clothes, palettes and the portrait panels as above; hero art for the dressing room is cropped by `tools/extract-heroes.py`. Their names were written for the game (Murka «The Tipster», Sizy «The Chemist», Prusak «The Underground Man», Sery «The Gym Rat», Arkadich «The Shadow Tycoon», Bugai «The Bouncer», Rogov «The Old Lag», Samson «The Foreman», Borka «The Runaway», Alisa «The Con Artist»); the sheets' working titles are not used (one of them is a comic-book trademark). The top-down rigs are in `tools/art/characters3.ts` |
| `17-arsenal.png` | The weapon list of the Arsenal (pistols, melee, SMGs, shotguns, rifles, snipers, launchers) — modelled as original top-down sprites, with real-gun brand names avoided (P92, S-12K; v0.2.18 part 3 — the owner's decision — «Дружба», «Бархан», «Трещотка», «Точка», «Импортная», «Дальнобой», «Чикагская машинка», «Пистолет комиссара»: [ASSETS.md](ASSETS.md) §4) |
| `37-map-kladbishche.png`, `38-map-krasnaya-ploshchad.png`, `39-map-pionerlager.png` (v0.23) | Layouts of Old Cemetery, Red Square and Pioneer Camp — rebuilt in the map format (`packages/shared/src/maps/cemetery.ts`, `square.ts`, `camp.ts`) with the routes, buildings and landmarks of the plans. No real people anywhere: the clock tower and the tribune carry a red star, the tribune has no name, the statues are a mourner, a bugler and a drummer, the camp («Звёздочка») is made up. New art: iron railings, lake water (drifting, with a shoreline), the fortress-wall brick, granite, green church roofs drawn hipped, cobblestones; 22 props in `tools/art/props3.ts` (headstones and flowerbeds, tombs, wreaths, mourners, the memorial with the eternal flame, onion domes in six colourings, tower spires, armoured carriers, hedgehogs, barriers, flagpoles, the campfire, watchtowers, goals, boats, bunk beds, dining tables, pioneer statues, rocks) and three tents (field hospital, army, tourist) |
| `40-scene-kladbishche.png` … `50-scene-2089.png` (v0.2.14) | The owner's big pictures of places, drawn as loading screens with the logo: the cemetery, a department store («Универмаг»), Red Square, the House of Culture, the construction site, City Hospital No. 3, the courtyard, the garage cooperative, the factory checkpoint, the pioneer camp and the BLATKOM hall of 2089 (capsules, the wall of screens, the lion on the balcony; logo «БЛАТКОМ ’2089») — winter, a red sky, the cast as gangsters. `tools/make-scenes.py` makes `assets/scenes/<id>.jpg` (1600×900) and `scenes/thumbs/<id>.jpg` (640×360) from them; used behind the story's comic pages, on the maps' loading screens, in the story hub's mission rows and behind a mission's end ([STORY.md](STORY.md) §4a). The department store stands in for the Gastronom |
| `19-map-stroyka.png` … `22-map-bolnica.png` | Layouts of Construction Site, House of Culture, Gastronom and City Hospital No. 3: rooms, doors, routes and landmarks were rebuilt one-to-one in the map format (`packages/shared/src/maps/*.ts`) |
| `64-skins-lineup.png` (2026-11-02, v0.2.18 part 2) | The owner's line of weapon skins by grade — regular (factory, khaki, worn; the welcome gifts «Акула» and «Блатком ’89»), rare (ten), epic (five), legendary (three) — to be painted as finishes of the weapons' own pixel art (`apps/web/src/game/render/finish.ts`). Without the real marks the picture shows: no Olympic rings, no sportswear brand's stripes or logo, no religious icon, no state agency's emblem, no prison tattoos — painted in v0.2.18 part 2 (docs/ECONOMY.md §4a) |
| `79-blat-banner-ru.png`, `80-blat-banner-en.png` (2026-11-03, v0.2.19) | The owner's BLAT banners («ПОКУПАЙ BLAT для EPIC и LEGENDARY скинов» / «SHOP BLAT for EPIC and LEGENDARY skins»): `tools/make-menu-art.py` composes the coins, the title, the line and the town's skyline into the menu's 4 : 1 banner `assets/ui/blats_banner_{ru,en}.jpg` (the English art's «SKWNS» mended from its own letters, `80-blat-banner-en-fixed.png`); the new red octagonal gem coin from it is drawn by `tools/make-blat-coin.py` (`assets/ui/blat_coin_{16,32,64,128}.png`) |
| `81-arsenal-tile-ru.png`, `82-arsenal-tile-en.png` (2026-11-03, v0.2.19) | The owner's ARSENAL tiles (a TT pistol in a laurel wreath): cropped by the same tool to `assets/ui/arsenal_tile_{ru,en}.jpg`, the menu's Arsenal tile in the page's language |
| `83-skins-ak-sheet.png` (2026-11-03, v0.2.19) | The owner's sheet of AK skins: nineteen new finishes painted by code like the others (`finish.ts`) — no «Absurd» grade (the owner), the sheet's «Ghetto Graffiti» as «Street Graffiti»; the graffiti tags are drawn as strokes and a crown, the tin says «КИЛЬКА» in a 4 × 5 pixel font, the toilet paper is a roll round the barrel. Four are **live** — a phase drives their painter, 16 frames × 110 ms: Golden Mobster (a glint sweeping from the stock to the muzzle), Red Diamond (facets lighting in turn, star glints), Obsidian Emperor (lava veins pulsing along), Blood Reaper (a red shimmer running along the blades); with «reduce motion» they stay on their first frame |
| `65…76-<character>.png` (2026-11-02, v0.2.18 part 2) | The owner's twelve new character sheets — Pyatak (starfish), Vasilisk (basilisk lizard), Cherry (rabbit), Zhnets (mantis), Dlinny (hare), Tuz (sloth), Zver (tiger), Igla (mutant hedgehog), Pingvin (penguin), Kasatik (orca), Arakh (spider), Rytsar (goat). Their «ПОРТРЕТ В ИГРЕ» panels are the in-game portraits (`tools/extract-portraits.py`; the sloth's and the hedgehog's panels by hand), the big art the hero cards (`tools/extract-heroes.py`; the heads sit higher on these sheets, so the crop takes in the tagline's rows and paints the tagline over around the character), and the top-down rigs are re-modelled from them (`tools/art/characters4.ts`: outfit, palette, head and accessories from above; no blood, no tattoos). The abilities drawn on the sheets are not in the game — every character fights with the same numbers |
| `77-map-cherkizon.png`, `78-map-vorkuta.png` (2026-11-02) | The owner's references for the two maps of v0.2.18 part 3, built as compact symmetric arenas (1500 × 1000, mirrored left ↔ right with `mirrorHelpers`): **«Черкизон»** (`packages/shared/src/maps/cherkizon.ts`) — the market's arch «ЧЕРКИЗОН · ВЕЩЕВОЙ РЫНОК», rows of stalls with clothes rails and trestle tables, signs that say what is sold («ДЖИНСЫ», «СПОРТТОВАРЫ», «ВИДЕО»…), the pavilion «ТОРГОВЫЙ РЯД № 1», a shawarma stall under parasols, a carpet hall, containers, Volgas and minibuses; **«Воркута»** (`vorkuta.ts`) — a mining town under snow: the mine with its headframe and chimneys («СЛАВА ШАХТЁРСКОМУ ТРУДУ!»), rails with coal wagons, the House of Culture with a generic miner's monument, five-storey blocks, the department store and the canteen, the «ДОМ БЫТА» and the post office, buses, heating mains on low supports over the snow (they stop a player, not a bullet), garages and the arch «ВОРКУТА · ГОРОД ШАХТЁРОВ», with falling snow (`weather: 'snow'`). Drawn without what the references carry from real marks or camps: no portraits of real people, no brand logos, no barbed wire or watchtowers |

**Language.** The player-facing game is English with a Soviet accent (talons, deficit goods, Dossier,
aliases); in-world signage painted on the maps («СЛАВА ТРУДУ!», «ГАСТРОНОМ», «РЕГИСТРАТУРА»…) stays in
Cyrillic as part of the setting. The logo reads «BLATKOM ’89».

The references are drawn in a three-quarter view. The game is **strictly top-down and orthographic**:
every character, prop and wall was re-designed for a camera looking straight down. No isometric or
perspective projection is used anywhere.

## 2. Visual rules

* **Palette.** Dirty red `#c8312a`, burgundy `#8a1a16`, charcoal `#0d0b0a`/`#151210`, tobacco beige
  `#d9c7a3`/`#e8dcc0`, olive `#6b7536`, industrial blue `#4a9be0`, rust brown, sodium orange `#ffb04a`.
  Bright colours are reserved for muzzle flashes, blood, the local player's UI accents and pickups.
* **Readability first.** Characters always carry a small personal light, a name label and an HP bar;
  remote players are interpolated smoothly; clutter decals sit below characters and never block shots.
* **Lighting.** Night scenes: a cool ambient light map with warm sodium/incandescent pools, red neon,
  and flicker modes (`soft`, `broken`). On WebGL the light map is applied with an overbright blend
  (`2 × light × scene`), so lamps can brighten their pools above the base texture like in the
  reference. The light map is rendered at half resolution in one batched pass.
* **VHS.** Scanlines, grain, chroma bleed, vignette and a rare tracking line in one post-process pass;
  three levels in settings (off / light / strong). Weak devices start with it off and it switches itself
  off if the game runs below ~40 FPS for 6 s.
* **Feedback.** Muzzle flash sprites + light flash, tracers, sparks and bullet holes on walls, smoke,
  ejected shells, blood splats and pools, hit flash on the victim, hit markers, light screen shake
  (can be disabled), low-HP red pulse, kill feed, haptics in Telegram.

## 3. Pipeline (`npm run assets`)

All game sprites are generated by code in `tools/art/` — original assets made for this game:

* `lib/model.ts` — a small top-down renderer: characters and props are built from 3-D primitives
  (ellipsoids, capsules, boxes, cylinders, extruded polygons), lit from the top-left with cel-shading
  ramps, outlined, and rasterised at 2 texels per world pixel.
* `characters.ts` — 14 rigs (body, head, species features, clothing, hand poses);
  `build-characters.ts` — animation frames → one trimmed atlas per character.
* `build-weapons.ts` — the paper-doll weapons atlas: every one of the 32 weapons as a top-down sprite
  held in the hands (`w_<id>`), lying on the floor (`pickup_<id>`) and as a HUD icon, equipment
  (`g_<id>`), medkit and projectiles; side-view images for the Arsenal (`ui/weapons`, `ui/gadgets`,
  `ui/mods`).
* `props.ts` … `props4.ts` — 125 prop types (+ variants: garages, cars, containers, shelves, market
  stalls…; `props4.ts`: the market's and the mining town's — stalls, trestle tables, clothes rails,
  carpets, a toilet cabin, the headframe, coal heaps, snowdrifts, coal wagons, a mine cart, the miners'
  monument, chimneys), `textures.ts` — 22 floor and 15 wall/roof tiles (v0.2.18 part 3: snow, trodden
  snow, a snowy roof, heat pipes), trees, bushes, pipes, roof details; `fx.ts` — effects (incl. flames
  and scorch marks) and HUD icons. `npx tsx tools/art/build-all.ts --maps` rebuilds only the props and
  tiles (~15 s).
* Weather (`apps/web/src/game/render/Weather.ts`): a map with `weather: 'snow'` gets snowflakes in world
  space around the camera, drawn above the night light map so they read in the dark; nothing of it
  touches the collision or the server.
* `lib/pack.ts` — shelf packer → PNG + TexturePacker-style JSON (`frames`, `trimmed`,
  `spriteSourceSize`, `sourceSize`) that Phaser loads as atlases.
* `tools/extract-portraits.py` — portraits from the reference sheets; `tools/make-logo.py` — logo;
  `tools/subset-fonts.py` — Cyrillic/Latin subsets of the UI fonts.
* `apps/web/public/assets/manifest.json` lists every generated file with a content hash; the web build
  turns it into an asset version (`?v=…`) so caches never mix old and new sprites.

Runtime-generated decals (`apps/web/src/game/render/paint.ts`): stencilled slogans and signs, arrows,
hazard stripes, stars, stains, hopscotch, manholes, laundry lines and floor litter, worn down with
deterministic noise.

## 4. Conventions (for replacing generated art with hand-drawn sheets)

| Asset | Size / scale | Frame names |
|---|---|---|
| Character atlas `sprites/char_<id>.png/.json` | source frame 128×128 px, trimmed; 2 texels = 1 world px; body radius 10 world px; facing +X (right) | legs: `<id>_legs_idle_0`, `<id>_legs_walk_0…7`, `<id>_legs_run_0…7`; torso per weapon `<id>_<weapon>_<anim>_<i>` with `idle 2`, `shoot 3`, `reload 6`, `hit 2` (melee: `idle 2`, `swing 5`, `hit 2`); `<id>_death_0…5` |
| Weapons atlas `sprites/weapons.*` | held sprite `w_<id>` 176×96 source, gun pointing +X; floor sprite `pickup_<id>`; equipment `g_<id>` | 32 weapon ids in `packages/shared/src/game-rules/weapons.ts`; grip and muzzle offsets in `characters.meta.json` / weapon defs |
| Animation timing | legs walk 12 fps, run 18 fps; shoot 30 fps; hit 14 fps; swing 22 fps; idle 2 fps; reload frames are spread over the weapon's reload time | `apps/web/src/game/assets.ts` |
| Props atlas `sprites/props.*` | footprint × 2 + 10 px margin, facing as in `PROP_DEFS` | `prop_<type>_<variant>`, `pickup_<weapon>`, `tree_<n>`, `bush_<n>`, `roof_<kind>` |
| Tiles `tiles/floor_*.png`, `tiles/wall_*.png` | 256×256, seamless, drawn at 0.5 scale (128 world px) | file name = key |
| Portraits `portraits/<id>.png` / `_small` | 120×120 / 48×48 | — |
| Effects atlas `sprites/fx.*` | various | `glow`, `flash_<weapon>_<n>`, `blood_<0-5>`, `pool_<0-2>`, `tracer`, `ring`, `smoke`, `dust`, `shell`, `hole`, `px`, `ico_<weapon>`, `crosshair`, touch-control icons |

Character sheets are rendered with the torso and legs as separate layers: legs rotate with the
movement direction, the torso (with the weapon) with the aim direction.

### Interface art (v2)

| Asset | How it is made | Where it is used |
|---|---|---|
| Profile avatars `assets/avatars/<id>.jpg` (192×192) | `tools/crop-avatars.py`: the 24 round pixel portraits cut from the owner's sheet `references/23-avatars.png` (ids in `packages/shared/src/game-rules/avatars.ts`) | drawn as circles (CSS) in the Dossier tile, the profile header, lobby rows and the picker (6 × 4 on desktop, 4 × 6 on phones); without an avatar the lobby shows the character's portrait |
| Hero art `assets/heroes/<id>.jpg` (360×480) | `tools/extract-heroes.py`: head and shoulders cropped 3:4 from the owner's character sheets in `references/`, the head in the middle of the card (v0.2.17: 270×360 of the sheet, under the tagline); where a centred crop reaches the sheet's title, label boxes or КАРТОЧКА paper, the text is painted over with the sheet's dark — the character himself kept by a background-removal model (ISNet, `--model isnet-general-use.onnx`) | Arsenal dressing room (the character «holding» the weapon being tried on), the «Personal File» on the character screen, character cards in the Arsenal — the characters look exactly as on the BLATKOM sheets |
| Weapon / equipment / modification icons `ui/weapons/<id>.png` + `_s.png`, `ui/gadgets/…`, `ui/mods/…` | `tools/art/build-weapons.ts`, `renderInBox`: every icon is fitted into the same box (weapons and equipment 168×56 / 84×28, modifications 72×36 / 36×18) by its drawn bounds | Arsenal lists and slots, results — all icons the same size |
| Arsenal tile pistol `ui/menu_arsenal.png` | TT pistol side view rendered by the weapon pipeline | the Arsenal tile in the main menu |
| Map thumbnails `assets/maps/<id>.jpg` (320 px wide, the map's own aspect) | `tools/map-thumbs.mjs`: each map captured from the real renderer (night lighting on, players hidden), lifted a little for small sizes | map pickers (practice, rooms, lobby): a square tile — the picture centred above a caption band of the same height on every tile, all captions at one font size that fits the longest name (`ui/fit.ts`), the selected map's band red |
| Scenes `assets/scenes/<id>.jpg` (1600×900) and `scenes/thumbs/<id>.jpg` (640×360) | `tools/make-scenes.py`: a 16:9 centre crop of the owner's pictures (`references/40…45-scene-*.png`), JPEG 80 / 72; «Черкизон» and «Воркута» (v0.2.18 part 3) are rendered from the maps themselves by `tools/map-scenes.mjs` (the real renderer, night lighting and snow on, players hidden), since the owner's layouts for them carry portraits, logos and camp elements that must not appear | the story's comic pages (the whole screen, a slow push towards the picture's focus — `SCENE_FOCUS` in `apps/web/src/story/scenes.ts` — or a slow pan across it on an upright phone), a map's loading screen over the countdown (the picture's top-left corner with its logo kept in view), the story hub's mission rows (thumbnail as a banner), a mission's end screen; `hall2089` behind every page set in 2089. A place gets its picture by adding the reference, a line in the tool and the id in `SCENE_IDS` / `MAP_SCENE` |
| Mac app icon `tools/mac-app/icon.png` (1024×1024) | the rooster's hero art in a rounded square with a red rim, made into `blatkom.icns` by `tools/build-mac-app.py` | «BLATKOM 89.app» in the Dock and Finder |
| Logo `ui/logo.png` / `logo_ru.png` | `tools/make-logo.py`: Latin «BLATKOM» with the English tagline, Cyrillic «БЛАТКОМ» with «Районные дела — серьёзные дела» | main menu, by language |
| Mode pictograms | inline SVG in `apps/web/src/ui/modes.ts` (crosshair, red/blue halves, a flag with a star, three zones) | mode buttons, Quick Match chooser |

The in-game preview in the dressing room («In the game») is not an image: it draws the frames of the
character, weapon and effects atlases that Phaser has already loaded onto a canvas
(`apps/web/src/ui/doll.ts`), with the same grip and muzzle points as `CharacterView`, so it always
matches the game.

### Objective modes in the world

Drawn every frame from session state by `apps/web/src/game/render/ObjectiveView.ts` (Phaser Graphics,
no new textures): flag stands (a metal plate with the team rim, dashed while the flag is away), flags in
the team colour with a star, leaning «up» the screen as tall objects do in top-down games, waving
(faster on a running carrier), lying on the floor with a draining «back home» ring when dropped; the
three bases as painted dashed zones with the owner's tint, a capture bar in the capturing team's colour
around the zone (blinking white when contested), the letter A/B/C and a flagpole whose cloth climbs as
the bar fills. Rims, bars and letters are drawn above the night light map so they read in dark areas;
flags and bases also add team-coloured light pools to it (`Lighting.setSteady`). The HUD repeats the
state in a strip under the timer, on the minimap and as edge markers.

## 5. Fonts and audio

* Fonts (bundled, subset): Oswald, PT Sans Narrow, Caveat (SIL OFL 1.1) and Permanent Marker
  (Apache 2.0); licence files ship next to the fonts in `assets/fonts/`.
* Sound effects are synthesised at runtime with WebAudio (`apps/web/src/game/audio/Sfx.ts`):
  per-weapon shots, ricochets, hits, deaths, footsteps, reloads, pickups, countdown beeps, equipment,
  and the objective cues — a factory klaxon when a flag is stolen, a bugle call for a capture, chimes
  for bases taken and lost. No third-party samples.
* Menu music: **«Hurt»** — Infraction & Emerel Gray (Brazilian Phonk Sport), the phonk the owner supplied
  (`assets/audio/theme.mp3`, 96 kbps, 2:53, looped). v0.2.18 part 3 replaced it with the game's own
  «Районные дела» (`tools/music/compose.py`: synthesised, no samples — still there to re-render, see
  `tools/music/README.md`); in v0.2.19 the owner chose «Hurt» again («более запоминающийся и динамичный»),
  so its licence for use in a game is to confirm ([ASSETS.md](ASSETS.md)). It plays in the
  menus, the lobby and on the results screen, fades out when a match starts and pauses when the tab is
  hidden (`apps/web/src/game/audio/Music.ts`); volume in Settings, a mute button in the menu corner.
  It starts together with the menu: at start-up the game tries to play it without a tap (browsers that
  allow it); browsers refuse sound before the first tap on a new site (Chrome, Safari, Telegram on
  iOS), so then the loading screen ends with a «▶ Play» button (`main.ts`) and that tap starts the
  music with the menu. A player who arrives by an invite link goes straight to the room; the music
  starts with their first tap.
  The credits name it and its authors. The single-file demo does not include the music. Every
  asset and its rights: [ASSETS.md](ASSETS.md).

## 6. Fighter cards and full-height art (v0.2.23)

The fighter card (`apps/web/src/ui/fighterCard.ts`) is the game's portrait of a player: the character's art,
the weapon painted in its skin, the grade's ribbon, frame and light, the alias and level. Two shapes:
**tall** (3 : 4.26 — the line-up, the podium, the Arsenal, the viewer; under 120 px wide a compact version
without the ribbon) and **wide** (the killer's card and «Тебя уложили этим»: the head and shoulders on the left).
Drawn on a canvas at the screen's pixel ratio, so «Поделиться» sends exactly the picture on screen.

* The colours of a skin's light come from its own paint (`render/skinColors.ts`), the frame from the grade's
  colour; regular cards stay calm, an epic card has a light running round its frame, a legendary one two
  lights and its own background (slow rays, sparks). Only cards in view are animated (25 frames a second at
  most); with «reduce motion» nothing moves.
* **The art.** A big tall card (the Arsenal's poster, the card opened big and shared, the line-up on a computer,
  the sets) shows the character at full height when the picture exists; the small cards (a crowded line-up, the
  podium, the phone's kit) and the wide ones (the killer's card, «Тебя уложили этим») keep the waist-up hero art
  (`assets/heroes/<id>.jpg`, 360×480) — a face reads better there. The full-height pictures: the owner's (2 : 3,
  1024×1536, on the game's dark red background), made from each character's portrait with
  [FULLBODY_PROMPTS.md](FULLBODY_PROMPTS.md); `tools/make-fullbody.py id=picture …` cuts off their frame line and
  writes `apps/web/public/assets/fullbody/<id>.jpg` (600×914, ~80–170 KB) — then the id goes into `ui/fullbody.ts`
  (`FULLBODY`; a unit test checks the files). The card fits the figure's height (the sides fade into the card).
  v0.2.23: 10 of 36 — the policeman, the bear, the crow,
  the snake, the lizard, the parrot, the pigeon, the cockroach, the rat, the pig; the rooster and the panther wait
  for sneakers without a sports maker's marks.
* **The layout of a tall card** (the owner, on the first full-height cards: «как раньше — оружие снизу, справа,
  и без этих надписей, либо сделай их меньше»; then «небольшой отступ, чтобы голова не упиралась в верхнюю рамку»):
  nothing lies across the figure. The art takes the whole card under a little headroom (4.5 % of its height, the
  picture's top edge faded into the card; a full-height figure is scaled to fit under it, its feet on the bottom); the
  weapon in its skin stands in the lower right corner (60 % of the card's width, 74 % on a compact card), its
  muzzle up to the right, on a soft shade and the skin's own light (a legendary skin: sparks round it); one small
  line at the bottom — the alias on the left, a legendary skin's ★ eliminations on the right. The grade's ribbon
  and the level stay in the top corners. The character, the weapon and the skin by name left the card's face
  (a screen reader still reads them from its description); the wide card keeps its text.
* The same rules as everywhere: no real brands (two stripes, never three), no prison symbols or tattoos, no
  text in the pictures.
