# Frontend Integration Tests

Интеграционные тесты для проверки функционала после рефакторинга.

## Структура

- `contracts/` - Тесты нормализации данных (API/WS контракты)
- `api/` - Тесты HTTP API интеграции
- `ws/` - Тесты WebSocket интеграции
- `auth/` - Тесты авторизации и AuthContext
- `helpers/` - Вспомогательные функции для тестов

## Запуск тестов

### С реальным backend

1. Убедитесь, что backend запущен:
   ```bash
   docker compose --profile dev up -d mongodb redis mongodb-init backend backend-worker
   ```

2. Установите переменные окружения (опционально):
   ```bash
   export REACT_APP_TEST_USE_REAL_BACKEND=true
   export REACT_APP_TEST_API_URL=http://localhost:3000/api
   export REACT_APP_TEST_WS_URL=http://localhost:3000
   ```

3. Запустите тесты:
   ```bash
   cd frontend
   npm test -- --testPathPattern=integration
   ```

### Без backend (unit тесты контрактов)

Тесты нормализации контрактов не требуют backend и всегда выполняются:
```bash
cd frontend
npm test -- --testPathPattern=integration/contracts
```

## Покрытие

### Contracts (нормализация)
- ✅ API DTO нормализация (User, Auction, Round, Bid, LeaderboardEntry)
- ✅ WS payload нормализация (AuctionCreated, Snapshot, Patch, BidPlaced, Round events)

### HTTP API
- ✅ Auth API (register, login, telegram login)
- ✅ Auctions API (list, get, create, start, getCurrentRound)
- ✅ Bids API (place, get, pagination, filtering)

### WebSocket
- ✅ Connection
- ✅ Lobby events (join, auction:created, sync:lobby)
- ✅ Auction events (join, snapshot, bid:placed, round:started)
- ✅ Heartbeat (app:ping/app:pong)

### Auth
- ✅ AuthContext (login, register, logout, token restoration)
- ✅ Web auth flow
- ✅ Telegram auth (требует настройки)

## Настройка

### Переменные окружения

- `REACT_APP_TEST_USE_REAL_BACKEND` - использовать реальный backend (default: false)
- `REACT_APP_TEST_API_URL` - URL API для тестов (default: http://localhost:3000/api)
- `REACT_APP_TEST_WS_URL` - URL WebSocket для тестов (default: http://localhost:3000)
- `REACT_APP_TEST_ADMIN_USERNAME` - admin username (default: admin)
- `REACT_APP_TEST_ADMIN_PASSWORD` - admin password (default: adminadmin)

## Примечания

- Тесты автоматически пропускаются, если backend недоступен (кроме unit тестов контрактов)
- Каждый тест создает изолированные данные (пользователи, аукционы)
- WebSocket тесты требуют активного backend с запущенным WebSocket gateway
- Telegram auth тесты требуют валидного `TELEGRAM_BOT_TOKEN` и генерации initData
