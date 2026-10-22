# ИОТ — цифровое сопровождение индивидуальных образовательных траекторий

Веб-приложение для организации, сопровождения и мониторинга индивидуальных образовательных траекторий (ИОТ) студентов колледжа. Оно связывает психолого-педагогическую диагностику с педагогическими действиями: диагностика → мотивационный профиль → маршрут из пяти этапов → задания → мониторинг и обоснованная корректировка → обратная связь → отчёты, а для исследования — регистрация замеров и обезличенный экспорт сопоставимых данных.

Система предлагает (профиль, шаблон маршрута, предупреждения), решения принимает преподаватель.

Требования — [docs/spec/TZ.md](docs/spec/TZ.md) (ТЗ v2.0). Объём первой версии — MVP (п. 10.1 ТЗ); соответствие требований и реализации — [docs/spec/traceability.md](docs/spec/traceability.md).

## Возможности

| Роль          | Что делает в системе                                                                                                                                                                    |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Преподаватель | Ведёт студентов своих групп, назначает диагностику, утверждает мотивационные профили, составляет и корректирует ИОТ, выдаёт и проверяет задания, ведёт мониторинг, консультации, отчёты |
| Студент       | Видит свою траекторию и задания, сдаёт работы, проходит диагностику, задаёт вопросы и запрашивает консультации, заполняет рефлексию — в том числе со смартфона                          |
| Исследователь | Ведёт исследования с экспериментальной и контрольной группами, фиксирует замеры, получает описательные статистики и обезличенные выгрузки                                               |
| Администратор | Учётные записи и права, группы, дисциплины, закрепление преподавателей, настройки, журнал аудита                                                                                        |

Ключевые свойства: проверка прав и области данных на сервере; неизменяемость завершённых диагностических ответов, опубликованных версий методик и утверждённых версий ИОТ; версионирование с причиной изменения; журнал аудита; обезличивание исследовательских данных; «Нет данных» вместо нулей; интерфейс на русском языке, адаптивный от 360 px.

## Документация

| Для кого                | Документ                                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Преподаватель           | [docs/guides/teacher.md](docs/guides/teacher.md)                                                                                                                                     |
| Студент                 | [docs/guides/student.md](docs/guides/student.md)                                                                                                                                     |
| Исследователь           | [docs/guides/researcher.md](docs/guides/researcher.md)                                                                                                                               |
| Администратор           | [docs/guides/admin.md](docs/guides/admin.md)                                                                                                                                         |
| Ввод реальных методик   | [docs/guides/methodologies.md](docs/guides/methodologies.md)                                                                                                                         |
| Системный администратор | [docs/deploy/README.md](docs/deploy/README.md) — требования к серверу, установка, обновление, резервное копирование                                                                  |
| Разработчик             | [docs/architecture/overview.md](docs/architecture/overview.md), [docs/api/README.md](docs/api/README.md), [docs/spec/decisions.md](docs/spec/decisions.md)                           |
| Приёмочная комиссия     | [docs/acceptance/checklist.md](docs/acceptance/checklist.md), [docs/acceptance/act-template.md](docs/acceptance/act-template.md), [docs/testing/results.md](docs/testing/results.md) |
| Пилотная апробация      | [docs/acceptance/pilot-report-template.md](docs/acceptance/pilot-report-template.md)                                                                                                 |

Полный перечень передаваемых материалов (п. 13 ТЗ):

| Материал                                           | Где                                                                                                                                                        |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Исходный код frontend и backend                    | `apps/web`, `apps/api`, `packages/shared`                                                                                                                  |
| Структура и миграции БД                            | `apps/api/prisma/`, [docs/architecture/data-model.md](docs/architecture/data-model.md), [docs/architecture/er-diagram.md](docs/architecture/er-diagram.md) |
| Инструкции по установке                            | [docs/deploy/install.md](docs/deploy/install.md)                                                                                                           |
| Документация API                                   | [docs/api/README.md](docs/api/README.md), [docs/api/openapi.json](docs/api/openapi.json)                                                                   |
| Инструкции администратора, преподавателя, студента | [docs/guides/](docs/guides/admin.md)                                                                                                                       |
| Тестовые сценарии и результаты проверок            | [docs/testing/scenarios/README.md](docs/testing/scenarios/README.md), [docs/testing/results.md](docs/testing/results.md)                                   |
| Настройки резервного копирования                   | [docs/deploy/backup-restore.md](docs/deploy/backup-restore.md)                                                                                             |
| Порядок обновления                                 | [docs/deploy/update.md](docs/deploy/update.md)                                                                                                             |
| Перечень сторонних библиотек и лицензий            | [docs/licenses.md](docs/licenses.md)                                                                                                                       |
| Акт приёмочного тестирования                       | [docs/acceptance/act-template.md](docs/acceptance/act-template.md)                                                                                         |

## Состав репозитория

| Каталог           | Назначение                                                                    |
| ----------------- | ----------------------------------------------------------------------------- |
| `apps/api`        | Серверная часть: NestJS, REST API, OpenAPI (`/api/docs`), Prisma + PostgreSQL |
| `apps/web`        | Интерфейс: Vue 3, TypeScript, Vite, PrimeVue                                  |
| `packages/shared` | Общий код сервера и интерфейса: статусы, схемы проверки, правила расчёта      |
| `docker`          | Образы рабочей сборки, nginx, резервное копирование                           |
| `scripts`         | Служебные скрипты (перечень лицензий)                                         |
| `docs`            | Документация                                                                  |

## Рабочий сервер

Рабочий сервер разворачивается через Coolify из `docker-compose.prod.yml`: Coolify получает код по deploy key и обновляет приложение при пуше в `main`; nginx приложения обслуживает HTTPS на портах `HTTP_PORT` и `HTTPS_PORT`. Настройка — [docs/deploy/coolify.md](docs/deploy/coolify.md).

На сервере без Coolify используется `docker-compose.standalone.yml` (nginx с HTTPS, статика интерфейса, API, PostgreSQL и резервное копирование по расписанию). Порядок установки — [docs/deploy/install.md](docs/deploy/install.md); кратко:

```bash
cp .env.prod.example .env.prod  # задайте POSTGRES_PASSWORD и JWT_SECRET
# сертификат: deploy/certs/fullchain.pem и privkey.pem (для теста — docker/nginx/self-signed-cert.sh)
docker compose -f docker-compose.standalone.yml --env-file .env.prod up -d --build --wait
docker compose -f docker-compose.standalone.yml --env-file .env.prod exec api node dist/cli/create-admin.js
```

Последняя команда создаёт первого администратора и выводит временный пароль. Демо-данные на рабочем сервере не создаются; методики заказчика вносятся по [docs/guides/methodologies.md](docs/guides/methodologies.md).

## Разработка

### Требования к окружению

- Node.js 24 LTS (см. `.nvmrc`);
- pnpm 10 (`corepack enable` либо `npm i -g pnpm@10`);
- Docker с Docker Compose — для PostgreSQL 16.

### Быстрый старт

```bash
pnpm install
cp .env.example .env            # при необходимости измените пароли
cp .env.example .env.test       # в DATABASE_URL укажите базу iot_test, NODE_ENV=test
pnpm db:up                      # PostgreSQL 16: базы iot_dev и iot_test
pnpm db:migrate                 # миграции и генерация клиента Prisma
pnpm db:seed                    # демо-данные
pnpm dev                        # API на http://localhost:3000, web на http://localhost:5173
```

Проверка: `http://localhost:3000/api/health` возвращает `{"status":"ok"}`, документация API — `http://localhost:3000/api/docs`.

В `.env` и `.env.test` задайте `JWT_SECRET` — случайную строку не короче 32 символов (`openssl rand -hex 32`), разную для каждого окружения. В `.env.test` удобно увеличить `LOGIN_RATE_LIMIT` (например, до 1000), чтобы тесты входа не упирались в ограничение частоты.

### Демо-данные

`pnpm db:seed` создаёт учётные записи `admin`, `teacher`, `student`, `researcher` (по одной на роль). Пароли берутся из переменных `SEED_ADMIN_PASSWORD`, `SEED_TEACHER_PASSWORD`, `SEED_STUDENT_PASSWORD`, `SEED_RESEARCHER_PASSWORD` в `.env`; если переменная не задана, пароль генерируется и выводится в консоль один раз. Сид также создаёт демо-группу «ДЕМО-21», дисциплину «Математика (демо)», демо-методику «ДЕМО — не для исследования: Учебная мотивация (пример)» и демо-материалы библиотеки, закрепляет преподавателя `teacher` и зачисляет студента `student`. Повторный запуск сида не меняет существующие записи.

Полный набор данных для ручной проверки (две группы по 20 студентов, диагностика, профили, ИОТ, исследование) даёт приёмочный стенд: `pnpm acceptance:stand`.

### Команды

| Команда                                    | Что делает                                                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `pnpm dev`                                 | API и web в режиме разработки                                                                                            |
| `pnpm build`                               | Сборка всех пакетов                                                                                                      |
| `pnpm lint`                                | ESLint                                                                                                                   |
| `pnpm typecheck`                           | Проверка типов (`tsc`, `vue-tsc`)                                                                                        |
| `pnpm format`                              | Форматирование Prettier                                                                                                  |
| `pnpm test`                                | Модульные и e2e-тесты API (нужны запущенный PostgreSQL и `.env.test`), модульные тесты общего пакета и web               |
| `pnpm test:e2e`                            | Сквозные тесты Playwright (перед первым запуском: `pnpm --filter @iot/web exec playwright install chromium firefox`)     |
| `pnpm test:e2e:webkit`                     | Те же тесты в WebKit (в Docker-образе Playwright)                                                                        |
| `pnpm test:acceptance`                     | Приёмочный набор AT-01…AT-12 на живом стенде (база `iot_acceptance`, см. `docs/acceptance/checklist.md`)                 |
| `pnpm acceptance:stand`                    | Приёмочный стенд для ручной проверки: http://localhost:5273, учётные записи — `apps/web/e2e/acceptance/stand.local.json` |
| `pnpm test:restore`                        | Тест восстановления из резервной копии (AT-13) на рабочей сборке в Docker, около 4 минут                                 |
| `pnpm test:load:prepare`, `pnpm test:load` | Нагрузочный тест k6 на 50 пользователей (см. `docs/testing/load.md`)                                                     |
| `pnpm audit:deps`                          | Проверка зависимостей на уязвимости уровня high и critical                                                               |
| `pnpm db:up` / `pnpm db:down`              | Запуск и остановка PostgreSQL для разработки                                                                             |
| `pnpm db:migrate`                          | Применение миграций Prisma (`prisma migrate dev`)                                                                        |
| `pnpm db:seed`                             | Заполнение демо-данными                                                                                                  |
| `pnpm db:generate`                         | Генерация клиента Prisma (выполняется автоматически перед сборкой, проверкой типов и тестами API)                        |
| `pnpm db:erd`                              | Обновление ER-диаграммы `docs/architecture/er-diagram.md` по схеме                                                       |
| `pnpm docs:openapi`                        | Выгрузка описания API в `docs/api/openapi.json` (тест сверяет файл с API)                                                |
| `pnpm docs:licenses`                       | Обновление перечня библиотек и лицензий `docs/licenses.md`                                                               |
| `pnpm licenses:check`                      | Проверка: все лицензии зависимостей рассмотрены, перечень актуален (после обновления зависимостей)                       |
| `pnpm docs:screenshots`                    | Снимки экранов для руководств `docs/guides/img` на приёмочном стенде                                                     |

После изменения API выполните `pnpm docs:openapi`, после изменения зависимостей — `pnpm docs:licenses`.

## Ограничения первой версии

- **Методики.** Методики Т. А. Ильиной, А. А. Реана, В. И. Моросановой вносятся после передачи заказчиком (огр. 1 ТЗ). До этого используется только демо-методика с пометкой «ДЕМО — не для исследования».
- **Функции вне MVP** (п. 10.2 ТЗ: критерии Манна — Уитни, Вилкоксона, Спирмена, интеграция с СЭО, двуязычный интерфейс, ИИ-рекомендации и др.) не реализованы и делаются только по отдельному согласованию.
- **Уведомления** — только внутри системы (без e-mail и push).
- **Открытые вопросы к заказчику** и принятые до ответа решения — [docs/spec/open-questions.md](docs/spec/open-questions.md).
- **AT-14** (работа на сервере колледжа) и пилотная апробация выполняются колледжем — [docs/acceptance/at-14-server.md](docs/acceptance/at-14-server.md).
