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

`pnpm db:seed` создаёт учётные записи `admin`, `teacher`, `student`, `researcher` (по одной на роль). Пароли берутся из переменных `SEED_ADMIN_PASSWORD`, `SEED_TEACHER_PASSWORD`, `SEED_STUDENT_PASSWORD`, `SEED_RESEARCHER_PASSWORD` в `.env`; если переменная не задана, пароль генерируется и выводится в консоль один раз. Сид также создаёт демо-группу «ДЕМО-21» и дисциплину «Математика (демо)», закрепляет за ними преподавателя `teacher` и зачисляет в группу студента `student`. Повторный запуск сида не меняет существующие записи. Модель прав — `docs/architecture/access-model.md`.

## Рабочий сервер

Рабочее окружение — Docker Compose (`docker-compose.prod.yml`): nginx с HTTPS, статика интерфейса, API, PostgreSQL и резервное копирование по расписанию. Требования к серверу, установка, обновление и восстановление из копии — `docs/deploy/README.md`.

```bash
cp .env.prod.example .env.prod  # задайте POSTGRES_PASSWORD и JWT_SECRET
# сертификат: deploy/certs/fullchain.pem и privkey.pem (для теста — docker/nginx/self-signed-cert.sh)
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build --wait
docker compose -f docker-compose.prod.yml --env-file .env.prod exec api node dist/cli/create-admin.js
```

## Команды

| Команда                       | Что делает                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `pnpm dev`                    | API и web в режиме разработки                                                                                            |
| `pnpm build`                  | Сборка всех пакетов                                                                                                      |
| `pnpm lint`                   | ESLint                                                                                                                   |
| `pnpm typecheck`              | Проверка типов (`tsc`, `vue-tsc`)                                                                                        |
| `pnpm test`                   | Модульные и e2e-тесты API (нужны запущенный PostgreSQL и `.env.test`), модульные тесты web                               |
| `pnpm test:e2e`               | Сквозные тесты Playwright (перед первым запуском: `pnpm --filter @iot/web exec playwright install chromium`)             |
| `pnpm test:acceptance`        | Приёмочный набор AT-01…AT-12 на живом стенде (база `iot_acceptance`, см. `docs/acceptance/checklist.md`)                 |
| `pnpm acceptance:stand`       | Приёмочный стенд для ручной проверки: http://localhost:5273, учётные записи — `apps/web/e2e/acceptance/stand.local.json` |
| `pnpm test:restore`           | Тест восстановления из резервной копии (AT-13) на рабочей сборке в Docker, около 4 минут                                 |
| `pnpm db:up` / `pnpm db:down` | Запуск и остановка PostgreSQL для разработки                                                                             |
| `pnpm db:migrate`             | Применение миграций Prisma (`prisma migrate dev`)                                                                        |
| `pnpm db:seed`                | Заполнение демо-данными                                                                                                  |
| `pnpm db:generate`            | Генерация клиента Prisma (выполняется автоматически перед сборкой, проверкой типов и тестами API)                        |
| `pnpm db:erd`                 | Обновление ER-диаграммы `docs/architecture/er-diagram.md` по схеме                                                       |
| `pnpm format`                 | Форматирование Prettier                                                                                                  |
