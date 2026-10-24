# The story mode (v0.2.13–v0.2.16, the owner's list v0.3 part 4)

2089: the city's disputes go to **BLATKOM**. Both sides are plugged into a simulation of 1989 — half
human, half beast — and whoever holds the district there is right out here. Two campaigns at war with
each other: **«Мой двор»** (Петя «Комендант», the streets) and **«Протокол»** (Участковый, the police).
Each mission is told as a comic before and after it; the characters pop up with their lines during the
fight. Along the way the hero meets the district's people (the card index).

Rules and missions: `packages/shared/src/story/missions.ts`; the words (EN/RU): `apps/web/src/story/script.ts`;
the mission in the browser: `apps/web/src/story/StorySession.ts`; the flow (hub, comics, rewards):
`apps/web/src/story/controller.ts`; the server: `apps/server/src/api/story.ts`, `apps/server/src/story/repo.ts`.

## 1. What is ready

| Campaign | Chapter | Missions | Chapter reward (once, with its achievement) |
|---|---|---|---|
| «Мой двор» | 1 «Двор» | a1 «Подъём», a2 «Очередь», a3 «Лампочки», a4 «Кассета №89», a5 «Документы» | «Хозяин двора»: 500 talons, the «Хохлома» tire iron |
| «Мой двор» | 2 «Гаражи» | a6 «Видак», a7 «Теплотрасса», a8 «Посылка», a9 «Сонька», a10 «Ночь в кооперативе» | «Авторитет гаражей»: 600 talons |
| «Протокол» | 1 «Участок» | b1 «Первый день», b2 «Лиса», b3 «Дискотека», b4 «Обыск», b5 «Комендант» | «Первый протокол»: 500 talons, Участковый |
| «Протокол» | 2 «Толкучка» | b6 «Толкучка», b7 «Кооператив», b8 «Груз», b9 «Кладбище», b10 «Облава» | «Рыночный надзор»: 600 talons, Кошка, the «Гжель» pistol |
| «Мой двор» | 3 «Промзона» (v0.2.15) | a11 «Цех №3», a12 «Котлован» | «Ночная смена»: 700 talons, Сизый |
| «Протокол» | 3 «Центр» (v0.2.15) | b11 «Крыша», b12 «Свидетель» | «Главный свидетель»: 700 talons |

24 missions, 12 a campaign, on all 10 maps; a mission's clock runs 75 s («Продержись») to 6 minutes,
plus its comics before and after. Each chapter's achievement also gives 100–200 XP.

**The open end (v0.2.15).** The owner: «finish the story, but with an open end for both heroes, so that
episodes can be added in updates» — «just two more each». Chapter 3 has two missions in each campaign,
and the last of them ends the story so far without closing it:

* «Мой двор», a12 «Котлован»: the building site behind the yard is stopped for one night; in the trailer
  — the drawing of a tower where the yard is, the deadline (31 December 1989) and the signature
  «А. Аркадьев»; the radio: «You have won a night. I have the whole calendar». In 2089 Пётр Петрович
  opens his eyes: the yard still stands — for now; «The case is adjourned. Next hearing: date to be set».
* «Протокол», b12 «Свидетель»: the lieutenant keeps old Рогов alive till morning; Рогов: Аркадич «isn't
  from this district. Not from this year… he has already seen how it all ends. On a tape». In 2089
  Inspector Volkov finds no capsule of Arkadiev's in the BLATKOM register — he isn't lying in the
  simulation, he is running it. «Case No. 89 is not closed».
* Both end with the narrator's tape caption «Продолжение следует. Новые дела — в следующих обновлениях»
  over the yard's picture, where the prologue's last page («Два дела. Один район. Плёнка пошла») was.

Chapter 4 of each campaign («Двор против всех», «Кассета №89») and the finale («Стройка» — the two of them
against Аркадич, the legendary «Неон-2089» skin for every weapon) stay in the plan (`STORY_CHAPTERS`,
`ready: false`) and appear as «coming soon» in the hub.

**Adding episodes in an update.** New missions go into the next chapter that isn't written (chapter 4),
never into a finished one (its reward has been paid): add them to `STORY_MISSIONS` with `chapter: 4` and
the numbers going on (`n: 13`, `14`, …), put the people they meet in `STORY_CAST`, mark the chapter
`ready: true` with a new achievement (`ACHIEVEMENT_IDS`, `ACHIEVEMENTS`, its Russian name in
`i18n/ru-content.ts`), write the words in `MISSION_SCRIPTS` and move the «Продолжение следует» caption to
the new last mission (`story/script.test.ts` checks that only the last one says it). No migration: the
server keeps progress by mission id and writes new achievements into its table at start; players who
finished chapter 3 find chapter 4's first mission open.

Every mission pays the first time: 60–190 talons and 40–115 XP (`STORY_MISSIONS`); experience brings
levels and the levels their $BLAT (V2.0, each level once). A character or skin the player already owns
is paid in talons instead (the character's price; a skin = a skin case, 150).

## 2. A mission

Missions run in the player's browser, like practice: the shared `World` and the practice bots
(`OfflineSession`), with the mission's sides, people and kit. The hero and the allies are red, the
enemies blue, named by who they are («Тунеядец», «Спекулянт», …).

| Objective | Win | Notes |
|---|---|---|
| Зачистка (`clear`) | everyone down | the fallen stay down; waves come after a short gap when the field is empty |
| Стенка на стенку / Дуэль (`team`) | the side's limit first | the hero comes back after a fall |
| Укради и унеси (`flag`) | the flags carried home | the map's flag mode |
| Держи точки (`bases`) | the side's points first | the map's base mode |
| Продержись (`survive`) | still standing when the clock runs out | enemies come back 7 s after a fall |

The same rules for every mission (`STORY_RULES`): the hero takes **half the damage**; in `clear` and
`survive` the hero has **three lives** (hearts in the objective line), the third fall is the end; no
weapons on the map and no supply drops — the hero's kit is the mission's. Out of time is a loss (except
in `survive`). A lost mission shows the narrator's line and «Try again».

During the fight the overlay shows the objective line and the barks — a portrait and a speech bubble
at the start, the first enemy down, half the score, low health, the last wave, a flag, a base, the win.

## 2a. Pictures (v0.2.14)

The owner: «the story is good, there's too little graphics on the screen — make the comics like the
loading screens, big beautiful scenes». Where a mission's place has its big picture (`story/scenes.ts`,
the owner's art, `assets/scenes/<id>.jpg`, 1600×900) a comic page is that scene on the whole screen —
the camera slowly pushing in towards the picture's focus (on an upright phone: travelling slowly across
it) — with the speaker's portrait and speech bubble along the bottom over a dark band, or the narrator's
tape caption; the next place fades in over it. The pages of 2089 are set in the BLATKOM hall, in neon.
Every map has its picture now; a place added later without one keeps the card layout (the speaker's art
beside the bubble over the map) until it gets one.

| Picture | Map | Missions |
|---|---|---|
| `yard` | Soviet Courtyard | a1 «Подъём», a4 «Кассета №89», a5 «Документы», b5 «Комендант»; the prologue's last page |
| `garages` | Garage Cooperative | a3 «Лампочки», a6 «Видак», a10 «Ночь в кооперативе», b4 «Обыск» |
| `factory` | Factory Checkpoint | a7 «Теплотрасса», b8 «Груз», a11 «Цех №3» |
| `camp` | Pioneer Camp | a8 «Посылка», b10 «Облава» |
| `univermag` (a department store) | Gastronom | a2 «Очередь», a9 «Сонька», b1 «Первый день», b11 «Крыша» |
| `dk` | House of Culture | b2 «Лиса», b3 «Дискотека» |
| `square` | Red Square | b6 «Толкучка» |
| `hospital` | City Hospital No. 3 | b7 «Кооператив», b12 «Свидетель» |
| `cemetery` | Old Cemetery | b9 «Кладбище» |
| `stroyka` | Construction Site | a12 «Котлован»; the finale (to come) |
| `hall2089` | — | every page in 2089: the prologue, the capsules after a chapter (capsule 02 is Pyotr Petrovich's), the open ends of a12 and b12 |

Behind the pages the soundtrack plays very quietly (22 % of the menu level, `music.setQuiet`): before a
mission, after it and in the prologue; it fades out with the mission and comes back to the menu level
on the mission's end and in the hub.

The same pictures: a mission's row in the hub is a little banner of its place (`scenes/thumbs/<id>.jpg`,
640×360), a mission's end (done or failed) sits over the place's picture, and a map's **loading screen**
(`ui/loadscreen.ts`) covers the countdown of a practice or online match on that map — the picture, the
map's name, the mode and a filling bar — and fades with 0.9 s of the countdown left (a tap hides it at
once; a story mission has none: its comic showed the place).

## 3. Rewards and the server

`GET /api/story` → the missions done. `POST /api/story/start { mission }` → a signed ticket (HMAC with
the session secret; the player, the mission, the time, a nonce), only when the mission is open (its
chapter written, the mission before it done). `POST /api/story/complete { ticket, ms, kills, deaths }`:
the ticket must be this player's, at most 3 hours old and **at least 15 s old** (`STORY_MIN_MS` — a
scripted «instant win» is refused with 409); the time counted is capped by the ticket's age.

`StoryRepo.complete` in one transaction, the profile row locked: `story_progress` gets the mission (or
its best time and one more completion); the first completion pays the mission's talons (ledger reason
`story`, `ref` = `story:<mission>`, unique per player and `ref` — never twice, also under concurrent
requests) and its XP; a finished chapter inserts its achievement (`ON CONFLICT DO NOTHING`) and pays the
chapter's talons, characters and skins (`user_items.source = 'story'`); the level achievements the new
experience reaches; the profile; $BLAT for new levels (`creditLevels`). Rate limits: 120 reads, 30
starts and 30 reports a minute per player. Analytics (server-side): `story_started { mission }`,
`story_completed { mission, ms, first }`.

Migration `021_story.sql` (adds only): `story_progress (user_id, mission_id, completed_at, best_ms,
completions)` with `ON DELETE CASCADE` from `users`; the ledger reason `story` and the unique index
`currency_ledger_story_once`; the `user_items` source `story`.

## 3a. Checking the story (v0.2.16)

To check the later chapters without playing the story through, an administrator opens it for a player:
`/admin` → «Игроки» → the player's card → «Сюжет» → pick a mission → «Открыть до неё»
(`POST /api/admin/players/:id/story-open`, [ADMIN.md](ADMIN.md) §5). The campaign's missions before it
count as done with a best time of 0 (`STORY_OPENED_BEST_MS` — a real run takes 15 s at least) and **pay
nothing**: no talons, experience, chapter achievements, characters or skins. The hub shows them «Открыта
для проверки» and offers «Ещё раз» — every comic can be watched again; a real run of such a mission keeps
its real time and still pays nothing. The chosen mission is open and pays as usual the first time; when
it is a chapter's last, the chapter's reward comes with it. The action is audited (`story_opened`).

## 4. Offline (the single file)

The single-file build plays the story without a server (`story/backend.ts`, `localBackend`): the
missions done and their best times in this browser (`blatkom89.story.local.v1`), the experience and the
chapter achievements in the local profile; no talons, characters or skins without a server. The hub
says so.

A browser that refuses storage to a page opened from disk (Safari does — `SecurityError: The operation
is insecure`) still plays: `storageGet` / `storageSet` keep a refused write in memory, so within the
session the story moves on and the prologue doesn't come back, and the hub warns that the progress lasts
until the tab is closed and suggests Chrome or Firefox (`storagePersistent()`).

## 5. Balance

`npm run story:balance -- [runs] [difficulty] [mission]` plays every mission (or one) with a bot as the
hero and prints the win rate, the time and the falls. The tuning that came out of it: half damage for
the hero, three lives, smaller waves, easier enemies in the first chapter, 75-second `survive` missions
with a 7-second enemy return. A bot hero is a weak player — the real numbers come from players.
Chapter 3 (v0.2.15) was tuned into chapter 2's range: with an easy bot as the hero a11 10/12, a12 6/8,
b11 10/12, b12 6/10 (chapter 2: a9 4/10, a10 5/8, b7 5/10, b9 6/10); a normal bot wins nearly all of them.

## 6. Tests

Unit: `story/scenes.test.ts` (every picture 1600×900 with its 640×360 thumbnail, every map and so every
mission has one, a page's picture: its own, else the BLATKOM hall in 2089, else the comic's place), `story/StorySession.test.ts` (sides, kit, clear and its waves, three lives and half damage, team
limits, the clock, every mission starts), `story/script.test.ts` (every mission has its words in both
languages, placeholders by objective, bubbles fit, no prison nicknames; the last mission of each campaign
— and only it — ends with «Продолжение следует» after a look into 2089), `story/backend.test.ts` (the
offline backend), `app/settings.test.ts` (refused storage), shared `story.test.ts` (open missions,
chapters, people met), server `api/story.test.ts` (DB-backed: tickets, locks, the 15-second rule, pays
once under concurrency, chapters, owned rewards in talons, $BLAT for levels). E2E: `story.mjs` (a real
server: the prologue, mission 1 with its comics, the server's rewards, three lives and the failure
screen, «Протокол» on a phone, its comic over the department store's picture on a desktop and on a phone)
and `story-offline.mjs` (the single file from disk: chapter 2 with the square's picture inside the file, the
hub's banners, the end over the picture; the open end — «Мой двор» done up to chapter 3, «Котлован» played
to its page in 2089 and «Продолжение следует» over the yard, the chapter's achievement, the end screen's
«глава 4 выйдет в одном из следующих обновлений»; and a browser that refuses storage); `maps.mjs` checks the
loading screens (the camp, the cemetery and the square: shown, named, gone once the match is on).
