# ИОТ — цифровое сопровождение индивидуальных образовательных траекторий

Веб-приложение для организации, сопровождения и мониторинга индивидуальных образовательных траекторий (ИОТ) студентов колледжа: психолого-педагогическая диагностика, мотивационные профили, конструктор ИОТ, задания, мониторинг, обратная связь и исследовательская аналитика.

Требования — `docs/spec/TZ.md` (ТЗ v2.0). Ход разработки — `docs/STATUS.md`.

## Состав

| Каталог           | Назначение                                                            |
| ----------------- | --------------------------------------------------------------------- |
| `apps/api`        | Backend: NestJS, REST API, OpenAPI (`/api/docs`), Prisma + PostgreSQL |
| `apps/web`        | Frontend: Vue 3, TypeScript, Vite                                     |
| `packages/shared` | Общие типы и константы для API и интерфейса                           |
| `docs`            | Спецификация, архитектура, решения, журналы этапов                    |

## Требования к окружению

- Node.js 24 LTS (см. `.nvmrc`);
- pnpm 10 (`corepack enable` либо `npm i -g pnpm@10`);
- Docker с Docker Compose — для PostgreSQL 16.

## Быстрый старт (разработка)

```bash
pnpm install
cp .env.example .env            # при необходимости измените пароли
cp .env.example .env.test       # в DATABASE_URL укажите базу iot_test, NODE_ENV=test
pnpm db:up                      # PostgreSQL 16: базы iot_dev и iot_test
pnpm db:migrate                 # миграции и генерация клиента Prisma
pnpm dev                        # API на http://localhost:3000, web на http://localhost:5173
```

Проверка: `http://localhost:3000/api/health` возвращает `{"status":"ok"}`, документация API — `http://localhost:3000/api/docs`.

В `.env` и `.env.test` задайте `JWT_SECRET` — случайную строку не короче 32 символов (`openssl rand -hex 32`), разную для каждого окружения. В `.env.test` удобно увеличить `LOGIN_RATE_LIMIT` (например, до 1000), чтобы тесты входа не упирались в ограничение частоты.

### Демо-учётные записи

`pnpm db:seed` создаёт учётные записи `admin`, `teacher`, `student`, `researcher` (по одной на роль). Пароли берутся из переменных `SEED_ADMIN_PASSWORD`, `SEED_TEACHER_PASSWORD`, `SEED_STUDENT_PASSWORD`, `SEED_RESEARCHER_PASSWORD` в `.env`; если переменная не задана, пароль генерируется и выводится в консоль один раз. Повторный запуск сида не меняет существующие учётные записи. Модель прав — `docs/architecture/access-model.md`.

## Команды

| Команда                       | Что делает                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `pnpm dev`                    | API и web в режиме разработки                                                                                |
| `pnpm build`                  | Сборка всех пакетов                                                                                          |
| `pnpm lint`                   | ESLint                                                                                                       |
| `pnpm typecheck`              | Проверка типов (`tsc`, `vue-tsc`)                                                                            |
| `pnpm test`                   | Модульные и e2e-тесты API (нужны запущенный PostgreSQL и `.env.test`), модульные тесты web                   |
| `pnpm test:e2e`               | Сквозные тесты Playwright (перед первым запуском: `pnpm --filter @iot/web exec playwright install chromium`) |
| `pnpm db:up` / `pnpm db:down` | Запуск и остановка PostgreSQL для разработки                                                                 |
| `pnpm db:migrate`             | Применение миграций Prisma (`prisma migrate dev`)                                                            |
| `pnpm db:seed`                | Заполнение демо-данными                                                                                      |
| `pnpm db:generate`            | Генерация клиента Prisma (выполняется автоматически перед сборкой, проверкой типов и тестами API)            |
| `pnpm db:erd`                 | Обновление ER-диаграммы `docs/architecture/er-diagram.md` по схеме                                           |
| `pnpm format`                 | Форматирование Prettier                                                                                      |
