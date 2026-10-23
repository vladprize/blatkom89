# The story mode (v0.2.13, the owner's list v0.3 part 4)

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

20 missions; a mission's clock runs 75 s («Продержись») to 6 minutes, plus its comics before and after.
Each chapter's achievement also gives 100–150 XP. Chapters 3 and 4 of each campaign and the finale («Стройка» — the two of them against Аркадич, the
legendary «Неон-2089» skin for every weapon) are written into the plan (`STORY_CHAPTERS`, `ready: false`)
and appear as «coming soon» in the hub.

Every mission pays the first time: 60–160 talons and 40–100 XP (`STORY_MISSIONS`); experience brings
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

## 6. Tests

Unit: `story/StorySession.test.ts` (sides, kit, clear and its waves, three lives and half damage, team
limits, the clock, every mission starts), `story/script.test.ts` (every mission has its words in both
languages, placeholders by objective, bubbles fit, no prison nicknames), `story/backend.test.ts` (the
offline backend), `app/settings.test.ts` (refused storage), shared `story.test.ts` (open missions,
chapters, people met), server `api/story.test.ts` (DB-backed: tickets, locks, the 15-second rule, pays
once under concurrency, chapters, owned rewards in talons, $BLAT for levels). E2E: `story.mjs` (a real
server: the prologue, mission 1 with its comics, the server's rewards, three lives and the failure
screen, «Протокол» on a phone) and `story-offline.mjs` (the single file from disk: chapter 2, and a
browser that refuses storage).
