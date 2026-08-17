# CREATIN.WORLD MVP

Рабочий MVP role-based платформы CREATIN.WORLD на Next.js, TypeScript, PostgreSQL и Prisma. Интерфейс разложен на страницы и компоненты, но сохраняет визуальный стиль HTML-прототипа: винный акцент, крупная типографика, плотные панели, светлая и тёмная темы и адаптивный сайдбар.

## Что собрано

- Frontend на Next.js App Router + TypeScript.
- Backend API через Next route handlers.
- PostgreSQL + Prisma schema + SQL migration.
- Seed-данные: 108 креаторов, заказчик, админ, заказы, приглашение, отклики, пакеты, чат, AI-рекомендации, feature flags.
- Telegram Login: production-проверка подписи Telegram и dev bypass для локального MVP.
- Роли `CREATOR`, `CLIENT`, `ADMIN`.
- AI-подбор топ-3 креаторов отдельно для каждого заказа через внешний API с локальным fallback и AI-логами.
- Тестовая платежная архитектура.
- Feature flags для оплаты, модерации и strict external AI.
- Локальное файловое хранилище портфолио в `uploads`.
- Административная панель с созданием заказов, очередью модерации и журналом рекомендаций.
- Источник заказа `CLIENT` или `CREATOR` без изменения связей откликов, чатов и заказчика-владельца.
- Приглашения креаторов в конкретный опубликованный заказ; принятие создает отклик.
- Профили креаторов с портфолио, реальными контактными ограничениями и загрузкой файлов.
- Чат только внутри заказа и только через отклик креатора.
- Детальная страница заказа с его брифом, откликами, AI-топ-3 и связанными чатами.

## Быстрый запуск

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Откройте `http://localhost:3000`.

`pnpm dev` запускает Next.js в webpack + polling режиме, чтобы избежать `EMFILE` watcher-ошибок на macOS с большим `node_modules`. Для Turbopack можно использовать `pnpm dev:turbo`.

`pnpm db:seed` полностью пересоздает демо-данные. Команда `pnpm db:seed:creators`
без удаления существующих заказов и чатов добавляет или обновляет 100 разнообразных
тестовых профилей для проверки AI-подбора.

## Тема интерфейса

Светлая и тёмная темы переключаются кнопкой в шапке или в разделе "Настройки".
Выбор хранится в `localStorage` под ключом `creatin-world-theme` и применяется до
первой отрисовки страницы, поэтому при перезагрузке нет вспышки другой темы.

## Демо-вход

В `.env.example` включен `TELEGRAM_AUTH_BYPASS=true`, поэтому локально можно пользоваться кнопкой "Демо-вход через Telegram".

На публичной странице `/login` доступны только роли "Я креатор" и "Я заказчик", каждая
с двумя действиями: "Являюсь пользователем" (вход по уже существующему аккаунту) и
"Зарегистрироваться" (короткая анкета → заявка уходит на модерацию администратору,
если тумблер "Ручная модерация" включён в админке).

- Креатор (демо-вход): `Анна Ким`
- Заказчик (демо-вход): `NORTH STUDIO`

### Админка

Админ-панель намеренно не рекламируется на публичном сайте: на неё нет ссылок ни в
шапке, ни на странице входа. Реальный роут — `/admin`, но напрямую он недоступен
(отдаёт 404) и открывается только по секретному пути из переменной окружения
`NEXT_PUBLIC_ADMIN_PANEL_PATH` (см. `.env`, по умолчанию `/cw-console-74x2`), см.
`middleware.ts`. Смените значение на своё и держите его в секрете. Вход в саму
админку — отдельная форма прямо на этой странице (демо-кнопка или Telegram-виджет),
не связанная с общим `/login`.

Для production-режима:

```env
TELEGRAM_AUTH_BYPASS="false"
TELEGRAM_BOT_USERNAME="your_bot"
TELEGRAM_BOT_TOKEN="your_bot_token"
TELEGRAM_ADMIN_IDS="123456789,987654321"
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME="your_bot"
AUTH_SECRET="long-random-secret"
AUTH_COOKIE_SECURE="true"
```

Роль существующего пользователя не меняется параметром формы входа. Новый администратор создается только для Telegram ID из `TELEGRAM_ADMIN_IDS`; dev-аккаунт `90001` разрешен только при включенном bypass.

Для локального запуска по `http://localhost` оставьте `AUTH_COOKIE_SECURE=false`. Значение `true` используется только при публикации приложения по HTTPS; иначе Safari не сохранит сессионную cookie.

## Feature flags

На первом этапе все разделы доступны без реальной оплаты и ручной модерации.

```env
FEATURE_PAYMENTS_REQUIRED="false"
FEATURE_MODERATION_REQUIRED="false"
FEATURE_AI_EXTERNAL_REQUIRED="false"
```

Flags также сидятся в таблицу `FeatureFlag` и переключаются в админке:

- `payments.required`
- `moderation.required`
- `ai.external_required`

## AI API

Основной вариант — прямое подключение OpenAI через Responses API и Structured Outputs:

```env
OPENAI_API_KEY="sk-..."
OPENAI_MODEL="gpt-5.6"
FEATURE_AI_EXTERNAL_REQUIRED="false"
```

SDK берет ключ только на сервере. После изменения `.env` перезапустите `pnpm dev`.
Кнопка AI-подбора на странице конкретного заказа сначала ранжирует доступных
креаторов по категории, фактическому содержанию брифа, роли, навыкам, опыту,
бюджету и внутреннему рейтингу. Внешняя модель получает шорт-лист из 30 профилей,
а не всю базу. Модель возвращает до трех валидных `creatorProfileId`, оценки и
краткие объяснения; чужие и повторяющиеся ID отбрасываются перед записью в БД.

Для подключения собственного AI-сервиса вместо OpenAI оставьте `OPENAI_API_KEY`
пустым и задайте `AI_API_ENDPOINT`. `/api/ai/match` отправит на него запрос:

```json
{
  "model": "creatin-top3",
  "task": "rank_top_3_creators_for_order",
  "order": {},
  "candidates": []
}
```

Ожидаемый ответ:

```json
{
  "matches": [
    {
      "creatorProfileId": "creator_profile_id",
      "score": 96,
      "rationale": "Почему креатор подходит"
    }
  ]
}
```

Если ни один провайдер не задан или внешний вызов недоступен, используется
детерминированный резервный подбор по тем же сигналам. Он умеет учитывать
содержание брифа, даже если пользователь ошибочно выбрал другую категорию.
Запуски и ошибки попадают в `AiLog`. `FEATURE_AI_EXTERNAL_REQUIRED="true"`
отключает резервный подбор при ошибке API.

Каждый запуск принимает обязательный `orderId`. Существующие `AiMatch` заменяются только для этого заказа; результаты других заказов не изменяются и отображаются на их собственных детальных страницах.

## Работа с заказом

- В разделе "Мои заказы" каждая карточка открывает отдельный экран заказа.
- При создании выбирается "От заказчика" или "От креатора"; значение отображается в карточке и деталях.
- Администратор создаёт и сразу публикует заказ для явно выбранной компании.
- URL содержит `pane=orderDetail&orderId=...`, поэтому заказ можно открыть напрямую или перезагрузить без потери контекста.
- Отклики и счетчики фильтруются по текущему `orderId`.
- AI-топ-3 запускается и отображается только для текущего заказа.
- Кнопка чата у отклика открывает именно его диалог, а не первый чат в общем списке.

## Платежи

Провайдер находится в `lib/payments.ts` и сейчас реализован как `TEST`.

- При `FEATURE_PAYMENTS_REQUIRED=false` тестовый платеж автоматически получает `SUCCEEDED` и открывает доступ.
- При `FEATURE_PAYMENTS_REQUIRED=true` платеж остается в `CREATED`, чтобы позже подключить реальный provider callback.

## Файлы портфолио

Загрузка портфолио:

```http
POST /api/files/portfolio
Content-Type: multipart/form-data

file=<binary>
```

Файлы сохраняются локально в `FILE_STORAGE_PATH` или `./uploads`, метаданные лежат в `PortfolioFile`. UI принимает PDF, JPG, PNG, WEBP и MP4 размером до 15 МБ.

## Приглашения

- Заказчик выбирает опубликованный заказ в каталоге креаторов.
- `POST /api/invitations` создает приглашение, привязанное к заказу и креатору.
- Креатор принимает или отклоняет его через `PATCH /api/invitations/[id]`.
- Принятие приглашения автоматически создает `Application`.
- Чат по-прежнему может создать только владелец заказа и только из этого отклика.

## Чаты

Свободных личных сообщений нет.

Схема и API enforcing:

- `Application` обязательно связан с `Order` и `CreatorProfile`.
- `Chat.applicationId` уникален и обязателен.
- `Chat` содержит `orderId`, `clientProfileId`, `creatorProfileId`.
- `POST /api/chats` принимает только `applicationId`.
- `POST /api/chats/[id]/messages` разрешает сообщения только участникам этого чата или администратору.
- Выбранный чат сохраняется в `pane=chats&chatId=...`.
- После нового сообщения обновляется `Chat.updatedAt`, поэтому список сортируется по последней активности.

## Основные API

- `POST /api/auth/telegram`
- `GET /api/auth/session`
- `POST /api/auth/logout`
- `GET /api/bootstrap`
- `GET /api/creators`
- `GET /api/orders`
- `POST /api/orders`
- `GET /api/orders/[id]`
- `PATCH /api/orders/[id]` — решение администратора по модерации
- `POST /api/orders/[id]/applications`
- `GET /api/applications`
- `GET|POST /api/invitations`
- `PATCH /api/invitations/[id]`
- `GET /api/chats`
- `POST /api/chats`
- `POST /api/chats/[id]/messages`
- `POST /api/ai/match`
- `POST /api/payments/test`
- `GET|PUT /api/feature-flags`
- `PUT /api/settings`
- `GET /api/admin/overview`
- `PATCH /api/admin/creators/[id]`

## Полезные команды

```bash
pnpm prisma:generate
pnpm db:migrate
pnpm db:deploy
pnpm db:seed
pnpm db:seed:creators
pnpm db:studio
pnpm check
pnpm build
pnpm dev
```

## Структура

```text
app/                  Next.js pages and API routes
components/           UI components by domain
lib/                  server helpers: Prisma, auth, AI, payments, storage
prisma/schema.prisma  database schema
prisma/migrations/    SQL migrations
prisma/seed.ts        seed data
docker-compose.yml    local PostgreSQL
```
