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
| `17-arsenal.png` | The weapon list of the Arsenal (pistols, melee, SMGs, shotguns, rifles, snipers, launchers) — modelled as original top-down sprites, with real-gun brand names avoided where needed (Deagle, P92, S-12K) |
| `37-map-kladbishche.png`, `38-map-krasnaya-ploshchad.png`, `39-map-pionerlager.png` (v0.23) | Layouts of Old Cemetery, Red Square and Pioneer Camp — rebuilt in the map format (`packages/shared/src/maps/cemetery.ts`, `square.ts`, `camp.ts`) with the routes, buildings and landmarks of the plans. No real people anywhere: the clock tower and the tribune carry a red star, the tribune has no name, the statues are a mourner, a bugler and a drummer, the camp («Звёздочка») is made up. New art: iron railings, lake water (drifting, with a shoreline), the fortress-wall brick, granite, green church roofs drawn hipped, cobblestones; 22 props in `tools/art/props3.ts` (headstones and flowerbeds, tombs, wreaths, mourners, the memorial with the eternal flame, onion domes in six colourings, tower spires, armoured carriers, hedgehogs, barriers, flagpoles, the campfire, watchtowers, goals, boats, bunk beds, dining tables, pioneer statues, rocks) and three tents (field hospital, army, tourist) |
| `40-scene-kladbishche.png` … `50-scene-2089.png` (v0.2.14) | The owner's big pictures of places, drawn as loading screens with the logo: the cemetery, a department store («Универмаг»), Red Square, the House of Culture, the construction site, City Hospital No. 3, the courtyard, the garage cooperative, the factory checkpoint, the pioneer camp and the BLATKOM hall of 2089 (capsules, the wall of screens, the lion on the balcony; logo «БЛАТКОМ ’2089») — winter, a red sky, the cast as gangsters. `tools/make-scenes.py` makes `assets/scenes/<id>.jpg` (1600×900) and `scenes/thumbs/<id>.jpg` (640×360) from them; used behind the story's comic pages, on the maps' loading screens, in the story hub's mission rows and behind a mission's end ([STORY.md](STORY.md) §4a). The department store stands in for the Gastronom |
| `19-map-stroyka.png` … `22-map-bolnica.png` | Layouts of Construction Site, House of Culture, Gastronom and City Hospital No. 3: rooms, doors, routes and landmarks were rebuilt one-to-one in the map format (`packages/shared/src/maps/*.ts`) |

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
* `props.ts` + `props2.ts` — 92 prop types (+ variants: garages, cars, containers, shelves…),
  `textures.ts` — 19 floor and 8 wall/roof tiles, trees, bushes, pipes, roof details; `fx.ts` —
  effects (incl. flames and scorch marks) and HUD icons.
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
| Hero art `assets/heroes/<id>.jpg` (360×480) | `tools/extract-heroes.py`: head and torso cropped 3:4 from the owner's character sheets in `references/` (logo, titles and side panels left out) | Arsenal dressing room (the character «holding» the weapon being tried on), the «Personal File» on the character screen, character cards in the Arsenal — the characters look exactly as on the BLATKOM sheets |
| Weapon / equipment / modification icons `ui/weapons/<id>.png` + `_s.png`, `ui/gadgets/…`, `ui/mods/…` | `tools/art/build-weapons.ts`, `renderInBox`: every icon is fitted into the same box (weapons and equipment 168×56 / 84×28, modifications 72×36 / 36×18) by its drawn bounds | Arsenal lists and slots, results — all icons the same size |
| Arsenal tile pistol `ui/menu_arsenal.png` | TT pistol side view rendered by the weapon pipeline | the Arsenal tile in the main menu |
| Map thumbnails `assets/maps/<id>.jpg` (320 px wide, the map's own aspect) | `tools/map-thumbs.mjs`: each map captured from the real renderer (night lighting on, players hidden), lifted a little for small sizes | map pickers (practice, rooms, lobby): a square tile — the picture centred above a caption band of the same height on every tile, all captions at one font size that fits the longest name (`ui/fit.ts`), the selected map's band red |
| Scenes `assets/scenes/<id>.jpg` (1600×900) and `scenes/thumbs/<id>.jpg` (640×360) | `tools/make-scenes.py`: a 16:9 centre crop of the owner's pictures (`references/40…45-scene-*.png`), JPEG 80 / 72 | the story's comic pages (the whole screen, a slow push towards the picture's focus — `SCENE_FOCUS` in `apps/web/src/story/scenes.ts` — or a slow pan across it on an upright phone), a map's loading screen over the countdown (the picture's top-left corner with its logo kept in view), the story hub's mission rows (thumbnail as a banner), a mission's end screen; `hall2089` behind every page set in 2089. A place gets its picture by adding the reference, a line in the tool and the id in `SCENE_IDS` / `MAP_SCENE` |
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
* Menu music: «Hurt» by Infraction & Emerel Gray (Brazilian Phonk Sport), supplied by the product owner
  as the game's soundtrack; `assets/audio/theme.mp3` (loudness-normalised, 96 kbps). It plays in the
  menus, the lobby and on the results screen, fades out when a match starts and pauses when the tab is
  hidden (`apps/web/src/game/audio/Music.ts`); volume in Settings, a mute button in the menu corner.
  It starts together with the menu: at start-up the game tries to play it without a tap (browsers that
  allow it); browsers refuse sound before the first tap on a new site (Chrome, Safari, Telegram on
  iOS), so then the loading screen ends with a «▶ Play» button (`main.ts`) and that tap starts the
  music with the menu. A player who arrives by an invite link goes straight to the room; the music
  starts with their first tap.
  It is credited in the menu («Credits») and in `THIRD_PARTY_LICENSES.txt`. **The licence for use in
  a game could not be verified while building this release: the operator must confirm the terms and
  the required attribution with the rights holders before public launch** (or replace the file). The
  single-file demo does not include the music.
