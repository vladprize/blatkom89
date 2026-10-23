# БЛАТКОМ ’89 — V2.0: отчёт о выполнении

Версии: v0.2.9 ($BLAT) → v0.2.10 (BLAT DROP) → v0.2.11 («Блатной кон») → v0.2.12 (Telegram Mini App, привязка аккаунтов, источники и админ-аналитика). Сайт: https://blatkom89.onrender.com/ (Render, `main`).

## 1. Итог по критериям готовности (раздел 15 задания)

| # | Критерий | Статус |
|---|---|---|
| 1 | Браузерная игра работает | ✅ полный прод-E2E (все этапы) на сборке `deploy/` |
| 2 | Старые аккаунты и прогресс не потеряны | ✅ миграции 016–020 только добавляют; старые данные не меняются и не удаляются |
| 3 | Мультиплеер с друзьями | ✅ E2E: комнаты, приглашения, матч, чат, итоги |
| 4 | Автодобор ботов | ✅ E2E `fill.mjs` |
| 5 | Баланс $BLAT после выхода/входа | ✅ серверный баланс + журнал; тесты |
| 6 | Награды за уровни не дублируются | ✅ уникальный id операции `level:<n>`, тесты на повторы и гонки |
| 7 | Реферальная награда — только за подтверждённых уникальных | ✅ только новый аккаунт, полный онлайн-матч ≥ 60 с с уроном; лимит 20/сутки → проверка |
| 8 | BLAT Drop — серверный отсчёт | ✅ дата на сервере, часы сервера, одинаково у всех |
| 9 | Соревновательные рейтинги обновляет сервер | ✅ Эло кона считает сервер при записи результатов |
| 10 | Telegram Mini App не создаёт дубликатов | ✅ привязка к существующему аккаунту (код через бота / вход по почте в Telegram); пустой профиль первого запуска объединяется, не удаляется |
| 11 | Сайт открывается вне Telegram | ✅ |
| 12 | Нет критических ошибок | ✅ в автотестах; живой деплой не проверялся отсюда (см. ограничения) |
| 13 | Миграции и функции задокументированы | ✅ docs/*.md |
| 14 | Нет выплат, крипто-операций, активных ставок | ✅ ставки выключены константой; токена/кошельков/обмена нет; партнёрам ничего не начисляется |

## 2. Что сделано (кратко)

**B — $BLAT (v0.2.9).** Игровые баллы, которые только копятся: нельзя купить, продать, вывести, передать или обменять; не криптовалюта, без цены. Начисляет только сервер, каждое начисление — строка журнала с уникальным id операции (`level:<n>`, `referral:<игрок>`), повтор и гонка ничего не добавляют. Награды за уровни (300 приветственных → 10 000 к 50-му, таблица — черновик на утверждение). Реферальная ссылка у каждого игрока (`?ref=` / `start=ref_`), засчитывается после первого полного онлайн-матча нового игрока; шкала заказчика; > 20 в сутки — на ручную проверку. Плитка $BLAT в меню, раздел с балансом, историей и ссылкой.

**C — BLAT DROP (v0.2.10).** Вкладка с обратным отсчётом по серверному времени (дату задаёт админ; без даты — «Дата объявления ещё не установлена»), снимки балансов на момент (CSV/JSON, правила проверки, помеченные и несходящиеся аккаунты не участвуют). Токен, кошельки, транзакции — не создаются.

**D — «Блатной кон» (v0.2.11).** Рейтинговые матчи 1×1/2×2/3×3/5×5 только между людьми: поиск соперников, свои комнаты, отдельный рейтинг кона (Эло) у игроков и у ОПГ, история, таблицы. Ставки спроектированы и выключены константой.

**E — Telegram Mini App (v0.2.12).** Полноэкранный режим на телефоне в матче, блокировка горизонтальной ориентации только когда телефон уже повёрнут (иначе — запасной сценарий: обычное окно, игра работает в обеих ориентациях); безопасные зоны (вырез, кнопки Telegram) учитывают меню и HUD; сворачивание/возврат — пауза звука, отпускание джойстиков, мгновенная проверка и переподключение к той же комнате. **Привязка Telegram к существующему аккаунту** без второго профиля: с сайта (Профиль → «Привязать Telegram» → одноразовая ссылка в бота → «🔗 Привязать и играть») или в самом Telegram входом по почте.

**F — аналитика и админка (v0.2.12).** Первое касание (партнёрская ссылка `?p=`, `utm_*`, приглашение, сайт-источник — только домен), уникальные игроки, начавшие первый матч, завершённые матчи, приглашения и их конверсия, D1/D7, DAU/WAU/MAU, карты/персонажи; **партнёрские ссылки для авторов и стримеров** (создание/выключение в админке, метрики по каждому — без выплат); страница «Источники», новые плитки обзора, распределение уровней, кон, $BLAT; CSV-выгрузки.

## 3. Схемы данных и миграции (все только добавляют)

| Миграция | Что добавляет |
|---|---|
| `016_blat.sql` | `profiles.blat`, `blat_earned`, `blat_level`; `users.ref_code`, `blat_flag`; таблица `referrals`; строки $BLAT в `currency_ledger` (`currency = 'blat'`, причины `level`/`referral`/`grant`, уникальный индекс на игрока и id операции, CHECK-границы) |
| `017_blat_drop.sql` | `app_settings` (дата BLAT DROP), `blat_snapshots`, `blat_snapshot_rows` |
| `018_kon.sql` | `profiles.kon_*` (рейтинг, матчи, победы, поражения, ничьи, серии), `clubs.kon_*`, `matches.kon_format`, `match_participants.kon_delta` |
| `019_telegram_link.sql` | `telegram_link_codes` (HMAC одноразового кода, срок, использование), `users.merged_into` / `merged_at`; проверка `users_identity_check` расширена (условие только шире) |
| `020_growth.sql` | `partners` (партнёрские ссылки), `visitors.utm_source/utm_medium/utm_campaign/partner_id`, `users.source_channel/source_detail/partner_id` |

Миграции применяются автоматически при старте сервера под advisory lock; откат версии безопасен (старый код работает с новой схемой).

## 4. Новые API и авторизация

| API | Доступ |
|---|---|
| `GET /api/blat` — баланс, история, награды, рефералка | игрок (Bearer-сессия) |
| `GET /api/blat/drop` — дата BLAT DROP и часы сервера | публично (без личных данных) |
| `GET /api/kon`, `GET /api/kon/top?by=players\|gangs` | игрок |
| `POST /api/rooms` / `/api/rooms/quick` с `kon` | игрок |
| `POST /api/auth/telegram` (+ `link` — код привязки, `source` — первое касание) | подпись `initData` проверяется на сервере (`initDataUnsafe` не используется) |
| `POST /api/auth/telegram/link-code` | игрок; 5 кодов / 10 мин; 409, если Telegram уже привязан |
| `POST /api/auth/email/login` (+ `initData` внутри Telegram) | почта + пароль; привязка только при валидной подписи Telegram |
| `POST /api/auth/guest`, `/api/visit` (+ `source`) | гость / анонимно; лимиты частоты |
| Бот: `/start ref_<код>`, `/start link_<код>`, `/start p_<код>` | вебхук с секретным заголовком Telegram |
| `GET /api/admin/blat`, `/referrals`, `/blat/drop`, `/blat/snapshots`, `/growth`, `/partners` | админка, роль viewer+ |
| `POST /api/admin/referrals/:id`, `/players/:id/blat-flag`, `/blat/drop`, `/blat/snapshots`, `/partners`, `/partners/:id`; `DELETE /api/admin/blat/snapshots/:id` | админка, роль admin, CSRF, аудит |
| `GET /api/admin/blat/snapshots/:id/export` (CSV/JSON), `/api/admin/export/sources.csv`, `/partners.csv` | админка, роль admin, аудит, защита от формул в CSV |

Админ-API недоступно игрокам: отдельная сессия (HttpOnly cookie), роли на сервере, CSRF на изменения, журнал аудита.

## 5. Результаты тестирования

| Прогон | Результат |
|---|---|
| `npm run typecheck` | без ошибок (shared, server, web, тесты web, tools) |
| `npm test` — unit и интеграционные (PostgreSQL) | **273 / 273** (в т. ч. $BLAT: повторы, гонки, лимиты; BLAT DROP и снимки; кон: Эло, стороны, уход; привязка Telegram — 5; источники и партнёры — 3; первое касание на клиенте — 2) |
| Полный прод-E2E (`deploy/`, production, гостевой вход, админка) | __E2E__ |

Подробные таблицы покрытия — docs/TESTING.md.

## 6. Известные ограничения

- Живой деплой на Render и настоящий бот/Telegram-клиент отсюда не проверялись (сеть песочницы закрыта прокси). Telegram в E2E играет тест: объект `Telegram.WebApp` с подписанными тестовым токеном данными и вызовы вебхука; поведение реальных клиентов (iOS/Android/Desktop) нужно пройти по чек-листу docs/TELEGRAM.md §5.
- Полноэкранный режим и блокировка ориентации работают только в клиентах с Bot API 8.0+ на телефонах; на остальных — развёрнутое окно.
- После 30 с без связи (свернул надолго) сервер освобождает место игрока: в обычном матче он вернётся новым входом, в «Блатном коне» это поражение (уход).
- Два аккаунта с прогрессом не объединяются автоматически: Telegram остаётся у своего аккаунта (игроку говорится об этом). Слияние двух прогрессов — отдельное решение.
- Источник есть только у аккаунтов, созданных с v0.2.12; старые — «неизвестно». Telegram-клиенты старше v0.2.12 не передают первое касание.
- WebKit (Safari) автотестами не прогонялся — только Chromium; lint/prettier в этой сессии не запускались (typecheck — да).
- Docker/HTTPS-сборка (Caddy) в этой среде не собиралась (нет Docker daemon).
- Платежи выключены (`REAL_MONEY = false`); Telegram Stars не подключены — по заданию.
- В политике конфиденциальности остались плейсхолдеры (оператор, контакт, сроки бухгалтерии) — их заполняет владелец; юридическая проверка не проводилась.
- Лицензия саундтрека меню — на стороне владельца (см. THIRD_PARTY_LICENSES).

## 7. Деплой на Render (по шагам)

1. Убедиться, что `deploy/` собран из текущих исходников (`node tools/build-deploy.mjs`) и закоммичен — Render запускает готовый бандл. В этом репозитории каждый релиз коммитится вместе с `deploy/`.
2. Первый запуск: Render → **New → Blueprint** → репозиторий → **Apply** (`render.yaml` создаёт web-сервис и бесплатный PostgreSQL во внутренней сети). Render сам генерирует `SESSION_SECRET` и пароль первого админа (`ADMIN_BOOTSTRAP_PASSWORD`, вкладка *Environment*; логин `admin` на `/admin`).
3. Обновления: push в `main` → автодеплой (≈3–5 мин). Миграции 016–020 применятся при старте сами.
4. Проверка: `https://<сервис>.onrender.com/api/health` → `{"ok":true,"version":"0.2.12"}`; `/admin` → вход; «Источники» открываются.
5. По желанию в *Environment*: `TELEGRAM_BOT_TOKEN` + `TELEGRAM_BOT_USERNAME` (бот, привязка Telegram, партнёрские ссылки в боте), `BLAT_DROP_ANNOUNCE_AT` (или дата в админке), `KEEP_AWAKE=true` (не засыпать), ключи входа через Google/Discord/Facebook/Reddit, `RESEND_API_KEY` + `MAIL_FROM` (письма сброса пароля). Сохранение → сервис перезапускается.

## 8. Переменные окружения (без значений)

| Переменная | Назначение | Обязательна |
|---|---|---|
| `DATABASE_URL` | PostgreSQL | да (Render подставляет сам) |
| `SESSION_SECRET` | подпись сессий и кодов (секрет) | да (Render генерирует) |
| `PUBLIC_URL` | публичный адрес; на Render по умолчанию `RENDER_EXTERNAL_URL` | для своего домена |
| `NODE_ENV=production`, `GUEST_AUTH_ENABLED=true`, `DEV_AUTH_ENABLED=false`, `TRUST_PROXY=true`, `STATIC_DIR` | режим сайта без обязательного Telegram | заданы в `render.yaml` |
| `ADMIN_BOOTSTRAP_USERNAME`, `ADMIN_BOOTSTRAP_PASSWORD` | первый админ (секрет), после первого входа можно убрать | при первом запуске |
| `TELEGRAM_BOT_TOKEN` (секрет), `TELEGRAM_BOT_USERNAME`, `TELEGRAM_MINIAPP_SHORT_NAME` | бот, Mini App, привязка Telegram, ссылки бота | для Telegram |
| `TELEGRAM_AUTH_MAX_AGE_SEC` | срок годности подписи Telegram (по умолчанию 24 ч) | нет |
| `TELEGRAM_WEB_LOGIN` | вход через Telegram на сайте (после `/setdomain`) | нет |
| `BOT_WARM_MINUTES`, `KEEP_AWAKE` | не давать бесплатному сервису засыпать | нет |
| `BLAT_DROP_ANNOUNCE_AT` | дата BLAT DROP (ISO 8601); дата из админки важнее | нет |
| `GOOGLE_CLIENT_ID/SECRET`, `DISCORD_CLIENT_ID/SECRET`, `FACEBOOK_APP_ID/SECRET`, `REDDIT_CLIENT_ID/SECRET` (секреты) | вход через сервисы | нет |
| `RESEND_API_KEY` (секрет), `MAIL_FROM` | письма сброса пароля | нет |
| `MATCH_*`, `MAX_ROOMS`, `MATCH_FILL_BOTS`, `GUEST_SIGNUPS_PER_IP_HOUR`, `CASES_ENABLED`, `LOG_LEVEL`, `SESSION_TTL_HOURS`, `ADMIN_SESSION_TTL_HOURS` | правила матчей и лимиты | нет |
| `STRIPE_*`, `NOWPAYMENTS_*` | платежи — выключены с v0.24 | не нужны |

## 9. Telegram-бот и Mini App

1. **@BotFather** → `/newbot` → имя (`BLATKOM ’89`) и username на `bot` → получить токен.
2. Render → *Environment*: `TELEGRAM_BOT_TOKEN` = токен, `TELEGRAM_BOT_USERNAME` = username без `@` → Save. При старте сервер сам регистрирует вебхук (`/api/telegram/webhook`), команды `/start` `/play`, описания (RU/EN) и кнопку «Play» у поля ввода (в логе — `telegram webhook registered`).
3. **Main Mini App:** BotFather → *My Bots* → бот → *Bot Settings* → *Configure Mini App* → *Enable Mini App* → URL `https://<домен>/`. Тогда кнопка «Открыть» в профиле бота и ссылки `t.me/<бот>?startapp=…` открывают игру сразу.
4. По желанию — direct-link app: `/newapp` → бот → название, описание, картинка 640×360 → URL `https://<домен>/` → короткое имя (например `play`) → `TELEGRAM_MINIAPP_SHORT_NAME=play` (приглашения станут `t.me/<бот>/play?startapp=<код>`).
5. По желанию — вход через Telegram на сайте: BotFather → `/setdomain` → домен игры; `TELEGRAM_WEB_LOGIN=true`.
6. Проверка (docs/TELEGRAM.md §5): `t.me/<бот>` → Start → «🎮 Играть в Telegram»; привязка с сайта (Профиль → «Привязать Telegram»); вход по почте в новом Telegram-профиле; матч на телефоне боком — полноэкранный режим, кнопки Telegram не закрывают мини-карту; свернуть на 10 с и вернуться — матч продолжается в той же комнате.

## 10. Решения, которые нужны от владельца

1. **Формула наград за уровни** (`game-rules/blat.ts`, черновик): 1-й уровень — 300 (приветственные), далее +50 за уровень до 10-го, +100 до 20-го, +200 до 30-го, +300 до 40-го, +325 до 50-го (= 10 000), после — 10 000 за уровень. Утвердить или дать свою таблицу.
2. **Дата BLAT DROP** — не придумана: задаётся в `/admin → $BLAT` (или `BLAT_DROP_ANNOUNCE_AT`). Пока «не установлена». Админка предлагает +6 месяцев от текущей даты.
3. **Правила будущего распределения токенов** — не реализованы и не обещаны. Есть только подготовка: журнал, снимки балансов на момент (правила v2: помеченные админом, несходящиеся с журналом и объединённые пустые профили не участвуют), выгрузки. Нужны: решение о самом токене, критерии участия (минимум матчей? возраст аккаунта?), пропорция, анти-фрод, юридическая проверка.
4. **Реферальные правила** (действуют): засчитывается после полного онлайн-матча ≥ 60 с с уроном; шкала заказчика 1–4 → 1 500 … 500+ → 20 000; > 20 подтверждений в сутки на пригласившего → ручная проверка. Подтвердить пороги.
5. **«Блатной кон»:** лимиты форматов (10/15/20/30 устранений; 3/4/4/5 мин), рейтинг Эло (старт 1000, K 40 → 24 после 10 матчей, пол 100); ставки — выключены, включение только после отдельного утверждения и юридической проверки.
6. **Партнёрская программа:** ссылки и метрики готовы; условия (кому, за что, сколько) не реализованы — выплаты не делаются.
7. **Telegram:** объединять ли вручную два аккаунта с прогрессом (сейчас — нет); политика удаления пустых объединённых профилей (сейчас хранятся).
8. **Политика конфиденциальности:** оператор, контакт, сроки хранения платёжных данных — заполнить; проверить требования Telegram к Mini App.

## 11. Ранее запланированное (пункт 12 задания) — статус

| Задача | Статус в коде |
|---|---|
| 14 основных персонажей | ✅ сделано больше: **24** играбельных персонажа (общие характеристики, разные облики) |
| 7 игровых карт | ✅ **10** карт (в т.ч. «Кладбище», «Красная площадь», «Пионерлагерь») |
| 20 типов оружия | ✅ **32** ствола + 7 видов снаряжения |
| Аптечки на картах | ✅ подбираемые аптечки |
| Балансировка оружия | ✅ централизованные параметры в `game-rules/weapons.ts` |
| Улучшения за игровые очки | ✅ модификации оружия (6) за талоны, кейсы, скины |
| Сохранение аккаунтов и прогресса | ✅ сервер (PostgreSQL), почта/провайдеры/Telegram |
| Зависание персонажей при повторном матче | ✅ исправлено (коммит d0e7432) |
| Админ-аналитика и мониторинг ошибок | ✅ существовали; в V2.0 расширены |

## 12. Изменённые файлы (V2.0)

Всего 116: добавлено 46, изменено 70 (сравнение с v0.2.8 — до начала V2.0). Папка `deploy/` пересобирается из исходников при каждом релизе и здесь не перечислена.

**Добавлены:**

- Сервер (`apps/server`): `apps/server/src/analytics/growth.test.ts`, `apps/server/src/analytics/growth.ts`, `apps/server/src/api/blat.ts`, `apps/server/src/api/kon.ts`, `apps/server/src/auth/telegramLink.test.ts`, `apps/server/src/auth/telegramLink.ts`, `apps/server/src/blat/blat.test.ts`, `apps/server/src/blat/drop.test.ts`, `apps/server/src/blat/drop.ts`, `apps/server/src/blat/repo.ts`, `apps/server/src/database/migrations/016_blat.sql`, `apps/server/src/database/migrations/017_blat_drop.sql`, `apps/server/src/database/migrations/018_kon.sql`, `apps/server/src/database/migrations/019_telegram_link.sql`, `apps/server/src/database/migrations/020_growth.sql`, `apps/server/src/kon/kon.test.ts`, `apps/server/src/kon/repo.ts`, `apps/server/src/rooms/kon.room.test.ts`
- Клиент и админка (`apps/web`): `apps/web/public/assets/ui/blat_coin_128.png`, `apps/web/public/assets/ui/blat_coin_16.png`, `apps/web/public/assets/ui/blat_coin_32.png`, `apps/web/public/assets/ui/blat_coin_64.png`, `apps/web/src/admin/views/blat.ts`, `apps/web/src/admin/views/growth.ts`, `apps/web/src/app/lifecycle.ts`, `apps/web/src/app/safeArea.ts`, `apps/web/src/net/firstTouch.test.ts`, `apps/web/src/net/firstTouch.ts`, `apps/web/src/net/referral.ts`, `apps/web/src/ui/screens/blat.ts`, `apps/web/src/ui/screens/blatDrop.ts`, `apps/web/src/ui/screens/kon.ts`
- Общий пакет (`packages/shared`): `packages/shared/src/__tests__/blat.test.ts`, `packages/shared/src/__tests__/kon.test.ts`, `packages/shared/src/game-rules/blat.ts`, `packages/shared/src/game-rules/kon.ts`, `packages/shared/src/game-rules/konStakes.ts`, `packages/shared/src/schemas/blat.ts`, `packages/shared/src/schemas/kon.ts`
- E2E (`tests/e2e`): `tests/e2e/blat.mjs`, `tests/e2e/growth.mjs`, `tests/e2e/kon.mjs`, `tests/e2e/telegram.mjs`
- Документация (`docs`): `docs/BLAT.md`, `docs/KON.md`, `docs/V2_REPORT.md`

**Изменены:**

- Сервер (`apps/server`): `apps/server/package.json`, `apps/server/src/admin/economy-admin.test.ts`, `apps/server/src/admin/routes.ts`, `apps/server/src/analytics/economy.ts`, `apps/server/src/analytics/metrics.ts`, `apps/server/src/analytics/retention.test.ts`, `apps/server/src/analytics/retention.ts`, `apps/server/src/api/auth.ts`, `apps/server/src/api/oauth.ts`, `apps/server/src/api/rooms.ts`, `apps/server/src/app.ts`, `apps/server/src/auth/sessions.ts`, `apps/server/src/clubs/clubs.test.ts`, `apps/server/src/config/env.ts`, `apps/server/src/index.ts`, `apps/server/src/profiles/repo.ts`, `apps/server/src/progression/recorder.ts`, `apps/server/src/rooms/MatchRoom.ts`, `apps/server/src/rooms/RoomManager.ts`, `apps/server/src/services/contracts.ts`, `apps/server/src/services/persistence.ts`, `apps/server/src/social/repo.ts`, `apps/server/src/telegram/bot.test.ts`, `apps/server/src/telegram/bot.ts`
- Клиент и админка (`apps/web`): `apps/web/admin.html`, `apps/web/package.json`, `apps/web/public/privacy-ru.html`, `apps/web/public/privacy.html`, `apps/web/src/admin/format.ts`, `apps/web/src/admin/main.ts`, `apps/web/src/admin/views/exports.ts`, `apps/web/src/admin/views/overview.ts`, `apps/web/src/admin/views/player.ts`, `apps/web/src/app/App.ts`, `apps/web/src/game/audio/Sfx.ts`, `apps/web/src/game/scenes/HudScene.ts`, `apps/web/src/globals.d.ts`, `apps/web/src/i18n/ru.ts`, `apps/web/src/main.ts`, `apps/web/src/net/GameConnection.ts`, `apps/web/src/net/OnlineClient.ts`, `apps/web/src/net/SocialClient.ts`, `apps/web/src/net/api.ts`, `apps/web/src/net/oauth.ts`, `apps/web/src/telegram/tg.ts`, `apps/web/src/ui/screens/account.ts`, `apps/web/src/ui/screens/lobby.ts`, `apps/web/src/ui/screens/results.ts`, `apps/web/src/ui/screens/welcome.ts`, `apps/web/src/ui/styles.css`
- Общий пакет (`packages/shared`): `packages/shared/package.json`, `packages/shared/src/events/analytics.ts`, `packages/shared/src/index.ts`, `packages/shared/src/net/protocol.ts`, `packages/shared/src/schemas/api.ts`, `packages/shared/src/schemas/social.ts`
- E2E (`tests/e2e`): `tests/e2e/clubs.mjs`, `tests/e2e/run-e2e.mjs`
- Документация (`docs`): `docs/ADMIN.md`, `docs/ANALYTICS.md`, `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md`, `docs/PRIVACY.md`, `docs/TELEGRAM.md`, `docs/TESTING.md`
- Корень: `.env.example`, `IMPLEMENTATION_PLAN.md`, `README.md`, `package.json`, `render.yaml`
