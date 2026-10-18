# БЛАТКОМ ’89

«Районные дела — серьёзные дела». Многопользовательский 2D-экшен с видом строго сверху для Telegram
Mini Apps и браузеров: позднесоветский район, четыре персонажа-зверя, три карты, бои «каждый сам за
себя» на 2–6 игроков. Первый релиз полностью бесплатный.

## Что внутри

| | |
|---|---|
| Игра | Phaser 3, вид сверху, 60 Гц симуляция; персонажи Петя «Комендант», Валюта, Участковый, Михалыч «Дембель» (равные характеристики); оружие: пистолет, обрез, автомат, монтировка; карты «Заводская проходная», «Гаражный кооператив», «Советский двор» |
| Мультиплеер | авторитарный сервер (WebSocket), предсказание и интерполяция на клиенте, компенсация лага, комнаты по приглашению и быстрая игра, переподключение |
| Тренировка | офлайн-матч с ботами (3 уровня сложности) — работает без сервера |
| Telegram | проверка `initData` на сервере, приглашения через `startapp`, safe areas, вибро-отклик |
| Прогресс | профили в PostgreSQL, опыт, уровни, достижения, история матчей, статистика |
| Аналитика | `/admin`: DAU/WAU/MAU, удержание D1/D7, графики, игроки, ошибки, CSV-выгрузки, журнал аудита |

## Быстрый старт (разработка)

```bash
npm install                      # Node.js ≥ 22.12
cp .env.example .env             # DATABASE_URL, SESSION_SECRET, DEV_AUTH_ENABLED=true
npm run dev                      # сборка клиента в watch-режиме + сервер с перезапуском → http://localhost:8080
```
Без сервера: `npm run build:demo` и откройте `apps/web/dist-demo/index.html` через любой статический
сервер — доступна тренировка с ботами. В браузере: `?play=offline&map=factory&bots=3` сразу запускает матч.

Управление: WASD/стрелки — движение, мышь — прицел, ЛКМ или пробел — огонь, R — перезарядка,
1/2/3, Q или колесо — оружие, E — подобрать, Shift — шаг, Tab — таблица, Esc — пауза. На телефоне: левый стик — движение, правый —
прицел, кнопки огня/перезарядки/смены оружия.

## Команды

| Команда | Что делает |
|---|---|
| `npm run dev` | разработка (клиент + сервер, автоперезапуск) |
| `npm run build` | production-сборка клиента (`apps/web/dist`) и сервера (`apps/server/dist`) |
| `npm run build:demo` | офлайн-демо без сервера (`apps/web/dist-demo`) |
| `npm start` | запуск собранного сервера |
| `npm run assets` | заново сгенерировать спрайты/тайлы/эффекты (`tools/art`) |
| `npm run typecheck` | TypeScript strict по всем пакетам |
| `npm test` | модульные + интеграционные тесты (нужен `DATABASE_URL_TEST`) |
| `npm run test:e2e` | браузерные E2E (Playwright): тренировка + онлайн-матч двух браузеров |
| `npm run db:migrate` / `db:status` | миграции PostgreSQL |
| `npm run admin:create` | создать администратора панели |
| `npm run lint` / `format` | ESLint / Prettier |

## Документация

* [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — план, статус, чек-лист приёмки
* [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — устройство системы и решения
* [docs/NETCODE.md](docs/NETCODE.md) — протокол, авторитарность, предсказание, защита
* [docs/ART_DIRECTION.md](docs/ART_DIRECTION.md) — референсы, палитра, пайплайн ассетов, форматы спрайтов
* [docs/TELEGRAM.md](docs/TELEGRAM.md) — бот, Mini App, авторизация, приглашения
* [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Docker, HTTPS, WebSocket, бэкапы, обновления
* [docs/ANALYTICS.md](docs/ANALYTICS.md), [docs/ADMIN.md](docs/ADMIN.md) — события, метрики, панель
* [docs/PRIVACY.md](docs/PRIVACY.md) — данные, сроки хранения, удаление
* [docs/TESTING.md](docs/TESTING.md) — что и как проверено

## Структура

```
apps/web          клиент (Phaser + DOM-меню) и панель /admin
apps/server       HTTP API, WebSocket-комнаты, PostgreSQL, аналитика, админка
packages/shared   общая симуляция, карты и коллизии, правила, протокол, схемы
tools/art         процедурный пайплайн графики → apps/web/public/assets
infra/            Dockerfile, Caddy, скрипт бэкапов (docker-compose.yml в корне)
references/       исходные референсы арт-директора (не используются как игровые экраны)
tests/e2e         браузерные сценарии Playwright
```
