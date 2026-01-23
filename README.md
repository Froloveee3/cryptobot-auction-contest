# CryptoBot Auction (Telegram Gift Auctions‑like)

Монорепо: **NestJS backend** + **React frontend** для системы многораундовых аукционов с real‑time обновлениями (Socket.IO), ботами и анти‑снайпингом.

## Действующий сайт / демо

- **Сайт (Frontend)**: `https://www.cryptobot-auction-contest.ru` (также доступен `https://cryptobot-auction-contest.ru`)
- **API**: `https://api.cryptobot-auction-contest.ru/api`
- **WS (Socket.IO namespace `/auctions`)**: `https://ws.cryptobot-auction-contest.ru`
- **Видео‑демо**: `https://drive.google.com/file/d/1uOwDzdaZuKa5kakU-Dp3-ycTJeExXx5N/view?usp=sharing`

## Что внутри

- **Backend**: NestJS, MongoDB (replica set для транзакций), Redis, BullMQ, Socket.IO, Prometheus `/api/metrics`
- **Frontend**: React + TypeScript, Socket.IO client, защищённые роуты, страница профиля
- **Manual scripted tests**: `scripts/manual-tests/*` (сценарии “как интеграционные” для Docker‑стека)

## Ключевая логика (коротко)

- **Аукцион = набор раундов**. В каждом раунде есть “окно времени”, leaderboard (Top‑100) и лимит призов (supply).
- **1 активная ставка на пользователя на аукцион**: пользователь не может держать несколько активных ставок одновременно.
- **Режимы ставки**:
  - `new`: создать новую ставку (amount = абсолютная сумма)
  - `raise`: увеличить существующую (amount = delta; минимум = `minIncrement`)
  - UI на странице аукциона автоматически выбирает `new/raise` по факту наличия активной ставки.
- **Антиснайпинг**: если ставка сделана в конце раунда и попадает в top‑N (зависит от правил раунда), раунд продлевается.
- **Боты**:
  - аккаунты ботов имеют **зарезервированный префикс** `_bot…`, чтобы не конфликтовать с реальными username.
  - боты не “мучают судей” постоянными ставками на последней секунде (избегают окна антиснайпинга).
- **Подарки (gifts)**: выигранные подарки фиксируются с номером экземпляра и раундом; в профиле есть вкладка “Коллекция”.

## Принятые допущения / ограничения

- **Usernames в веб‑регистрации**: только `^[A-Za-z][A-Za-z0-9]*$` (без `_`). Префикс `_bot` зарезервирован для системных/бот‑аккаунтов.
- **Баланс = ledger**: изменения баланса пишутся в историю транзакций (deposit/lock/refund/charge…).
- **MongoDB** запускается **replica set** (для транзакций). Для dev в Docker это делается контейнером `mongodb-init`.
- **JWT**:
  - есть **авто‑refresh** токена, пока пользователь открыт в приложении (sliding session),
  - на бэкенде есть “grace window” для refresh сразу после истечения токена (на случай троттлинга вкладки браузером).

## Быстрый старт (Docker, рекомендовано)

Проект использует Docker Compose **profiles**:
- **default**: только инфраструктура (MongoDB + Redis)
- **dev**: backend + worker + frontend (watch mode)
- **perf**: backend + worker (production‑like images)
- **loadtest**: k6 контейнер (запускается вручную)
- **hybrid**: helper для “backend на host, Mongo в Docker”

### 1) Env

- Root (для Docker Compose): `.env.example` → `./.env`
- Backend (для локального запуска backend): `backend/.env.example` → `backend/.env.local`
- Frontend (для локального запуска frontend): `frontend/.env.example` → `frontend/.env.local`

Расширенная документация по env лежит в `docs/environment.md`.

### 2) Запуск dev‑стека

```bash
docker compose --profile dev up -d mongodb redis mongodb-init backend backend-worker frontend
```

### 3) Открыть

- **Frontend**: `http://localhost:3001`
- **API**: `http://localhost:3000/api`
- **Swagger**: `http://localhost:3000/api/docs`
- **Metrics**: `http://localhost:3000/api/metrics`

Остановить:

```bash
docker compose --profile dev down
```

## Локальная разработка (без пересборки контейнеров)

Скрипты в root `package.json`:

```bash
npm run dev:both-local
# в другом окне:
npm run dev:both-local:frontend
```

## Тесты

### Manual scripted scenarios (интеграционные “смоук‑тесты”)

```bash
npm run test:manual
```

### Jest (backend)

```bash
cd backend
npm test
npm run test:e2e
```

## Нагрузочное тестирование (k6)

Подними целевой стек (dev или perf), затем:

```bash
docker compose --profile loadtest run --rm --no-deps k6 run \
  -e K6_BASE_URL=http://backend-perf:3000/api \
  -e ADMIN_USERNAME=admin -e ADMIN_PASSWORD=adminadmin \
  -e USERS=2000 -e INIT_BAL=100000 \
  -e RATE=2000 -e DURATION=60s \
  /scripts/k6-bids-arrival.js
```

## Документация

В `docs/` лежит краткая практическая документация:
- `docs/README.md`
- `docs/postman-collection.json`
- `docs/postman-environment.json`

## Конфигурация доменов (prod)

Frontend читает только переменные `REACT_APP_*` и сам добавляет `/api` к `REACT_APP_API_URL`.

- **`REACT_APP_API_URL`**: ставь **origin** (без `/api`), например `https://api.cryptobot-auction-contest.ru`
- **`REACT_APP_WS_URL`**: базовый URL WS (без `/auctions`), например `https://ws.cryptobot-auction-contest.ru`
