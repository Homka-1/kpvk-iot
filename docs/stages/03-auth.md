# Этап 03 — Авторизация, роли, аудит, администрирование

статус: done дата: 2026-10-16 коммиты: 8c32da9 (api), b5e88cb (web) + коммит журнала

## сделано

- shared: packages/shared/src/auth.ts — RoleCode, Permission (24 кода), ROLE_PERMISSIONS, SENSITIVE_PERMISSIONS (diagnostics.answers.read, research.personal_data.read), STAFF_ROLES, cookie/заголовок имена, CurrentUser/SessionResponse/ApiErrorBody, checkPassword, zod-схемы форм. settings.ts — SYSTEM_SETTINGS (auth.maxFailedAttempts 5, auth.lockoutMinutes 15, auth.passwordMinLength 10, auth.sessionDays 7).
- api auth: POST /api/auth/login|refresh|logout, GET /api/auth/me, GET /api/auth/password-policy, POST /api/auth/change-password. JWT HS256 (JWT_SECRET ≥32, TTL JWT_ACCESS_TTL_SECONDS=900). refresh в cookie iot_refresh (httpOnly, SameSite=Strict, path /api/auth, Secure в prod), в БД sha256; ротация updateMany по старому хешу. CSRF double submit (iot_csrf + x-csrf-token) только refresh/logout.
- AuthGuard глобальный (APP_GUARD): @Public, @RequirePermissions, @AllowPendingPasswordChange. user+roles+perms из БД на каждый запрос (по sid сессии) → блок/выход/отзыв сразу. mustChangePassword → 403 на всё кроме me/change-password/password-policy.
- блокировка: неверный пароль → атомарный increment; на пороге lockedUntil, 423. BLOCKED → 403 только после верного пароля. неизвестный логин → verifyAgainstDummy (время). LoginRateLimitGuard (свой, in-memory, LOGIN_RATE_LIMIT/мин с IP, 429 + Retry-After).
- RBAC каталог синхронизируется при старте (RbacCatalogSync onApplicationBootstrap) и в сиде. роли read-only в UI.
- AccessScopeService (FR-002): all при groups.manage, иначе группы/дисциплины из действующих teacher_assignments; studentsWhere(scope).
- аудит: AuditService.log(entry, tx) — в той же транзакции; actor/ip из AsyncLocalStorage (common/request-context.ts). GET /api/audit-logs (audit.read) с фильтрами и пагинацией.
- администрирование /api/admin/users (users.manage): list/create/get/patch, block (reason), unblock (+снимает lockout), reset-password (временный пароль, сессии гасит), PUT roles (только staff роли), POST/DELETE permissions (+roles.manage, reason, expiresAt). запрет над собой (403). студенческие учётки: только block/unblock/reset (роли/ФИО/разрешения → 409). GET /api/admin/roles, /api/admin/permissions.
- /api/settings GET/PATCH (settings.manage), валидация min/max, аудит settings.updated.
- ошибки: HttpExceptionFilter — {statusCode, message, fields?}, RU по статусу если текст не кириллица, Prisma P2002/P2025/P2003 → 409/404/409 (TODO этапа 01 закрыт). validationException с приоритетом isNotEmpty.
- логи: pino AppLogger + mask.ts (ключи ПДн/секретов → [скрыто], email/телефон/ИИН регэкспом), middleware: method + шаблон маршрута без query, status, ms, userId.
- сид: роли/права + admin, teacher, student (+students DEMO-0001), researcher. пароли SEED_<РОЛЬ>_PASSWORD, иначе генерит и печатает. идемпотентен (проверено на временной БД дважды).
- web: api/http.ts (fetch, Bearer, 1 повтор после refresh на 401, ApiError), stores/auth.ts (Pinia, токен в памяти, refresh только если есть iot_csrf cookie), router authGuard (login?redirect, change-password, area student/staff), router/paths.ts (homePath, safeRedirect), navigation.ts NavItem.permission + visibleNavItems, layouts фильтруют меню и показывают ForbiddenView, HeaderActions (ФИО, роль, меню: Сменить пароль/Выйти), LoginView (VeeValidate+zod), ChangePasswordView (/account/password), SettingsView, views/admin/* (AdminView табы: Пользователи, Роли и разрешения, Журнал аудита; UserEditor, CreateUserDialog, ActionDialog, TemporaryPassword).
- docs: ADR-009, docs/architecture/access-model.md, navigation.md (кто что видит), wireframes.md §8–9, README (JWT_SECRET, сид), open-questions 5/6/8/13 статусы, traceability.

## требования

- п. 2, MVP-1 ✅ (новая строка в traceability)
- п. 8.3 ⚠️ этап 03 часть сделана; файлы — 10, helmet/XSS — 19, HTTPS/бэкап — 21
- FR-002 ⚠️ сервис scope есть + тест; применение в модулях — 04, 16
- AT-12 ⚠️ guard + студент только cabinet.access; данные студентов — 04+, IDOR — 19
- NFR-005 ⚠️ формат ошибок API + клиент; ревизия 19
- NFR-006 ⚠️ создание учётки (unique → 409)

## решения (почему)

- @nestjs/throttler НЕ используем: 6.7.1 CJS, в Jest с ESM Nest 12 → «Cannot require() ES Module … in a cycle». в node работает, в jest нет. свой guard ~40 строк. ADR-009. при нескольких инстансах API — общее хранилище.
- zod 3.25 (не 4): @vee-validate/zod 4.15 peer zod ^3.24.
- роли не редактируются в UI — каталог в коде, синк при старте. иначе админ добавит себе diagnostics.answers.read в роль.
- запрет действий над собой — чтобы админ не выдал себе конфиденциальные права/роль teacher.
- меню по правам: преподавателю скрыты «Настройки» и «Администрирование» (там сейчас только админское). отмечено в open-questions 13. если заказчик против — вернуть пункты и показывать «Нет доступа».
- смена пароля — отдельный адрес /account/password (вне меню, из шапки), т. к. «Мой профиль» студента — этап 05, а смена нужна всем ролям.
- CSRF только для cookie-запросов: остальное по Bearer, браузер сам не шлёт.
- сессия абсолютная от входа (auth.sessionDays), refresh не продлевает.
- логины хранятся lowercase (create/login приводят).
- husky pre-commit не находит pnpm (PATH агента без ~/.npm-global/bin) → агент запускал node_modules/.bin/lint-staged вручную и коммитил --no-verify. у пользователя хук работает как раньше.
- предупреждение pg «client.query() when the client is already executing» в e2e — изнутри prisma adapter-pg (interpreter), не наш код.

## файлы ключевые

- packages/shared/src/auth.ts, settings.ts — каталог прав, схемы, настройки
- apps/api/src/auth/* — guard, сервис, контроллер, scope, rbac-catalog, passwords, rate limit
- apps/api/src/users/* — администрирование
- apps/api/src/audit/_, apps/api/src/settings/_
- apps/api/src/common/http-exception.filter.ts, request-context.ts
- apps/api/src/logging/* — pino, маска
- apps/api/test/helpers.ts — createTestApp, createUser, login, withCsrf
- apps/web/src/api/http.ts, stores/auth.ts, router/index.ts (authGuard, SECTION_VIEWS), router/paths.ts
- apps/web/src/views/admin/*, SettingsView.vue, ChangePasswordView.vue, ForbiddenView.vue
- apps/web/src/testing/mount.ts — mountWithApp(..., { user }) + testUser(roles)
- apps/web/e2e/support/session.ts — mockSession/mockAdminApi (UI-тесты без API)

## проверить

- `export PATH=$HOME/.npm-global/bin:$PATH`
- в .env и .env.test добавить `JWT_SECRET=<openssl rand -hex 32>`; в .env.test `LOGIN_RATE_LIMIT=1000`. (в основной копии .env пока НЕТ JWT_SECRET → API не стартует.)
- `pnpm db:up && pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`
- `pnpm db:seed` (задать SEED_*_PASSWORD в .env) → `pnpm dev` → http://localhost:5173/login, admin → /admin
- учётки сида: admin, teacher, student, researcher

## тесты

- shared 6/6; web vitest 38/38; api unit 32/32; api e2e 30/30 (health 2, БД 4, auth 9, admin 13, logging 2); playwright 59 passed, 1 skipped (нижняя панель на desktop — by design).

## долги / TODO(этап NN)

- TODO(этап 04): создание учётки студента вместе с карточкой (users.manage? или students.manage) — ФИО студента в users и students, синхронизировать; scope (AccessScopeService) применить к спискам студентов; селекторы группы/дисциплины в шапке.
- TODO(этап 07): аудит исправления ответов — не класть содержимое ответов в before/after (админ с audit.read увидит), только id/ревизию/причину.
- TODO(этап 09): если преподавателю нужны тексты стратегий в «Настройках» — дать доступ к разделу (permission пункта) и раздел настроек для teacher.
- TODO(этап 15): счётчик на колоколе.
- TODO(этап 19): автотест «каждый маршрут под guard» (сейчас глобальный guard + @Public только health/login/refresh/logout); helmet/CSP; IDOR; проверка лимита входа через e2e.
- TODO(этап 21): trust proxy за nginx (req.ip для лимита и аудита), Secure-cookie по HTTPS, команда создания первого администратора на проде (сид демо — только dev), общее хранилище лимита при >1 инстансе.
- открытые вопросы 5, 6, 8, 13 — ждут заказчика; дефолты в access-model.md.

## для след. этапа

- новый эндпоинт: по умолчанию требует вход; права — @RequirePermissions(Permission.X); пользователь — @User() user: AuthUser; публичный — @Public().
- изменения данных — в $transaction + this.audit.log({...}, tx).
- область преподавателя: AccessScopeService.forUser(user) → studentsWhere(scope).
- ошибки: кидать Nest-исключения с русским текстом; поля формы — BadRequestException({ message, fields }).
- e2e: helpers.ts (createUser с ролью, login → accessToken). тестовая БД общая → уникальные логины uniqueLogin().
- web: api<T>(path, {method, body, query}); формы — VeeValidate + toTypedSchema(zod из shared); раздел подключать в SECTION_VIEWS (router/index.ts).
