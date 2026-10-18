# Privacy, data retention and deletion

> **Not legal advice; no compliance is claimed.** This document describes what the software actually
> collects and does. Before a public launch the operator must fill in the placeholders in Part 1,
> check the requirements that apply to their audience and jurisdiction (e.g. GDPR for EU players,
> local personal-data laws, Telegram's current Mini App developer terms, the game's age rating) and
> adapt the text. Part 1 is the player-facing policy (Russian), published as `privacy.html`
> (linked from the main menu footer). Part 2 is the operator's reference.

---

## Part 1 — Политика конфиденциальности (текст для игроков)

**БЛАТКОМ ’89 — политика конфиденциальности.** Редакция от 18 октября 2026 г.

**Коротко.** Игра бесплатная, без рекламы и покупок. Мы храним только то, что нужно для работы игры,
вашего профиля и статистики. Мы не получаем ваш номер телефона и не сохраняем ваш @username и фото.
Данные не продаются и не используются для рекламы. Удалить профиль можно в любой момент:
**Настройки → «Удалить мои данные»**.

### 1. Кто отвечает за данные
Оператор игры: **[название или имя оператора]**. Связь: **[e-mail или Telegram-контакт]**.

### 2. Какие данные мы обрабатываем
1. **При входе через Telegram.** Telegram передаёт игре подписанные данные запуска; сервер проверяет
   подпись. Мы сохраняем: числовой идентификатор Telegram (чтобы узнавать вас при следующем входе),
   игровое имя (составляется из имени и фамилии в Telegram, его можно изменить — «✎ Кличка» в меню или в профиле) и код
   языка. Мы **не сохраняем** @username, фото профиля и сами данные запуска.
2. **Игровые данные:** выбранный персонаж, участие в матчах (карта, место, устранения, помощь, гибели, урон,
   время), опыт, уровень, достижения, серии побед, время в игре, история матчей.
3. **Технические данные:** тип платформы (например, «Telegram iOS» или «браузер»), версия игры, время
   входа, дни, в которые вы заходили в игру, длительность игровых сессий, события работы приложения
   (запуск, ошибки соединения, переподключения) и отчёты об ошибках. Из отчётов об ошибках перед
   сохранением удаляются пароли, токены, адреса e-mail и длинные идентификаторы.
4. **IP-адрес** используется сервером при обработке запросов и для защиты от злоупотреблений
   (ограничение частоты запросов). В базе данных профилей он не сохраняется; он может попадать в
   технические журналы сервера (например, при отклонённой попытке входа), которые хранятся ограниченное время.
5. **На вашем устройстве** игра хранит ключ сессии, настройки и — при игре в браузере без Telegram —
   случайный идентификатор устройства. Рекламных и сторонних систем отслеживания в игре нет.
   В **демо-версии без сервера** (один HTML-файл) кличка, опыт, уровень, статистика и история тренировок
   хранятся только в этом браузере (`localStorage`) и никуда не отправляются; удалить их можно, очистив
   данные сайта в браузере.

### 3. Зачем
Для входа и узнавания игрока; для сетевых матчей, таблицы результатов, начисления опыта и
достижений; для профиля, статистики и истории матчей; для поиска и исправления ошибок и защиты от
злоупотреблений; для обобщённой статистики (сколько людей играет, какие карты популярны,
возвращаются ли игроки), чтобы делать игру лучше.

### 4. Кто видит данные
Другие игроки видят ваше игровое имя, персонажа и результаты в лобби и матчах. Администраторы игры
работают с панелью статистики; каждый вход, просмотр карточки игрока и выгрузка данных
записываются в журнал. Мы не передаём данные третьим лицам, кроме хостинг-провайдера, на серверах
которого работает игра. Telegram обрабатывает данные по своим правилам.

### 5. Сколько мы храним
| Данные | Срок |
|---|---|
| Профиль, статистика, история матчей, достижения | пока вы не удалите профиль |
| События использования и дни активности | до 400 дней |
| Отчёты об ошибках | 90 дней |
| Записи о сессиях входа | 90 дней после окончания сессии |
| Приглашения в комнаты | 24 часа действия + 7 дней |
| Резервные копии базы данных | **[срок ротации резервных копий]** |

### 6. Как удалить данные
В игре: **Настройки → «Удалить мои данные»**. Удаление выполняется сразу и без возможности
восстановления: удаляются профиль, статистика, история матчей, достижения, дни активности и все
сессии входа. События использования и отчёты об ошибках теряют связь с вами и удаляются по сроку
хранения. Если вы снова откроете игру, будет создан новый пустой профиль. Если доступа к игре нет,
напишите оператору (раздел 1) из того же аккаунта Telegram.

### 7. Изменения
При изменении политики мы обновим дату редакции на этой странице.

---

## Part 2 — Operator reference

### 2.1 Data inventory

| Table | Personal fields | Purpose | Retention |
|---|---|---|---|
| `users` | `telegram_id`, `display_name`, `language_code`, `platform`, `dev_device_id` (dev mode only), `created_at`, `last_seen_at` | identity, display, analytics | until account deletion |
| `profiles` | counters, XP/level, streaks, preferred character | progression | until account deletion (cascade) |
| `sessions` | `token_hash` (HMAC of the token, never the token), `method`, `platform`, `client_version`, timestamps | authentication | 90 days after expiry/revocation; immediately on account deletion |
| `user_daily_activity` | (user, UTC day) | DAU/WAU/MAU, retention | 400 days; immediately on account deletion |
| `match_participants` | per-match stats of a player | history, profile, admin | until account deletion (cascade) |
| `player_achievements` | unlock time | achievements | until account deletion (cascade) |
| `matches` | none (map, times, player count, end reason) | match statistics | kept (no personal data) |
| `invitations` | `created_by` (SET NULL on deletion) | invite links | 7 days after expiry |
| `analytics_events` | `user_id`, `session_id` (SET NULL on deletion), `platform`, props (§ANALYTICS.md) | product analytics | 400 days |
| `app_errors` | `user_id` (SET NULL on deletion), `session_id`, sanitised message, versions | debugging | 90 days |
| `admin_users` | admin username, scrypt hash | dashboard access | until removed |
| `admin_sessions` | token/CSRF HMACs, **IP, user agent** | admin security | 90 days after expiry/revocation |
| `admin_audit_log` | admin id, action, target (may be a player UUID), **IP** | accountability | 365 days |

Never collected or stored: Telegram `username`, `photo_url`, phone number, `is_premium`, raw `initData`
or its hash/signature, session tokens in plain text, passwords of players (there are none), payment
data (no payments in this release). Client error messages are sanitised (ANALYTICS.md §2.3).

Application logs (stdout, JSON): internal user ids (room joins, protocol violations), the IP of
**rejected** Telegram logins, request ids/paths (debug level). The application does not write tokens,
passwords or initData to logs.
Configure the log driver / aggregator to rotate logs (recommended ≤ 30 days). Reverse-proxy access
logs (IP, URL) are outside the application — configure their retention the same way.

### 2.2 Automatic retention job

`apps/server/src/analytics/retention.ts` (`RETENTION_DAYS`) — started by `createPersistence` in every
server process (not in tests): first run 5 minutes after start, then every 24 h. Deletes in batches of
5 000 rows (no long locks), idempotent (safe with several instances), logs the deleted counts.
Covered by `analytics/retention.test.ts`. To change a period, edit `RETENTION_DAYS`, deploy, and
update the table in Part 1 §5.

### 2.3 Account deletion

**Self-service** — `DELETE /api/me` (button «Удалить мои данные» in Settings):
1. revokes all of the player's sessions;
2. `DELETE FROM users WHERE id = …` — cascades to `profiles`, `sessions`, `user_daily_activity`,
   `match_participants`, `player_achievements`; sets `user_id`/`session_id`/`created_by` to `NULL` in
   `analytics_events`, `app_errors`, `invitations`;
3. leaves only unlinked rows: anonymous events/errors (purged by the retention job) and `matches`
   rows without player references. Admin audit entries may still contain the former internal UUID,
   which no longer resolves to anything.

Covered by `auth/auth.api.test.ts` («account deletion removes the user and personal data»).

**Operator-assisted** (player has no access, or a written request):

```sql
-- find the account (Telegram ID from the request, verified via the same Telegram account)
SELECT id, display_name, created_at FROM users WHERE telegram_id = 123456789;
BEGIN;
DELETE FROM users WHERE id = '<uuid>';                       -- same cascade as self-service
INSERT INTO admin_audit_log (action, target, details)
VALUES ('player_deleted_manual', '<uuid>', '{"ticket": "<request id>"}');
COMMIT;
```

**Backups** keep deleted data until they rotate out. Define and publish the backup retention period
(Part 1 §5); recommended ≤ 30 days. Do not restore a backup over production without re-applying
deletions requested after the backup was taken (keep the list of deletion tickets).

### 2.4 Access requests

Players see their profile, statistics, achievements and the last matches in the game. A complete
copy for a specific player can be assembled by an administrator from the player card in `/admin`
(audited as `player_viewed`) or by SQL over the tables in §2.1. There is no self-service export yet.

### 2.5 Pre-launch checklist (operator)

- [ ] Fill in operator name and contact (Part 1 §1) and backup retention (Part 1 §5); publish
      `privacy.html` with the same text.
- [ ] Decide the age rating and whether the policy needs a section on minors.
- [ ] Check the legal basis / consent requirements for your audience and the hosting location
      (cross-border transfer), and sign a data-processing agreement with the hosting provider if required.
- [ ] Check Telegram's current requirements for Mini App privacy policies and configure the link
      where Telegram expects it.
- [ ] Configure log rotation for the application and the reverse proxy.
