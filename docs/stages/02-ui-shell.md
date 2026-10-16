# Этап 02 — Дизайн-система, макеты и каркас интерфейса

статус: done дата: 2026-10-16 коммиты: cf119ba + коммит журнала

## сделано

- PrimeVue **4.5.5** + @primeuix/themes 2.0.3 + primeicons 7.0.0, версии точные (без ^). PrimeVue 5 — коммерч. лицензия с ключом, колледж не подходит → ADR-008.
- тема: apps/web/src/theme/preset.ts (Aura + палитра navy, primary = navy.700, dark mode off), tokens.css (CSS-переменные --iot-\*, база, .iot-page/.iot-card/skip-link). RU-локаль PrimeVue — src/plugins/primevue.ts.
- навигация: src/navigation.ts — единственный источник меню (TEACHER_NAV 10, TEACHER_SERVICE_NAV 4, STUDENT_NAV 7, STUDENT_BOTTOM_NAV_SIZE=4, isNavItemActive). router строит маршруты из списков, все → PlaceholderView («Раздел в разработке»). meta.title → h1 и document.title «X — ИОТ».
- маршруты: преподаватель от `/` (/students, /diagnostics, /motivation-profiles, /trajectories, /assignments, /monitoring, /feedback, /analytics, /reports, /disciplines, /library, /settings, /admin); студент /student/\* (trajectory, assignments, diagnostics, achievements, feedback, profile); /login; catch-all → NotFoundView.
- layouts: StaffLayout (шапка: ИОТ, Select группа/дисциплина пустые, колокол, «Вход не выполнен» → /login; левое меню ≥1024; <1024 — Drawer по «Открыть меню», селекты второй строкой), StudentLayout (левое меню ≥1024; <1024 — нижняя панель 4 пункта + «Ещё» → Drawer снизу со всеми 7).
- компоненты: StatusBadge (tone neutral/info/success/warning/danger + иконка + текст обязателен), EmptyState (role=status), ErrorState (role=alert, retryable → emit retry), MetricCard (null → «Нет данных», to → RouterLink для FR-003), ProgressIndicator (role=progressbar, clamp 0–100, null → «Нет данных»), layout/NavMenu, layout/HeaderActions. utils/format.ts formatNumber (ru-RU).
- LoginView: форма без логики, submit → info «Вход станет доступен после подключения авторизации».
- docs/design/wireframes.md (7 экранов: панель преподавателя, профиль студента, карта ИОТ, главная студента, конструктор методики, конструктор ИОТ, вход), tokens.md, navigation.md.
- ADR-008; open-questions №13 (меню admin/researcher); traceability: NFR-003/004/005 ⚠️, новые строки п. 3.1–3.2 ✅, п. 6.1 ✅, п. 6.2–6.5 ⚠️ (макеты есть, экраны — свои этапы).
- удалены HomeView(+spec), e2e/home.spec.ts.

## требования

- п. 3.1, 3.2, огр. 7 ✅ (структура меню, тест на порядок/названия)
- п. 6.1 ✅ (токены, статус не только цветом)
- п. 6.2–6.5 ⚠️ макеты; реализация экранов — этапы 05, 11, 12, 16
- NFR-004 ⚠️ оболочки ок на 360 px; экраны разделов — дальше, финал — этап 19
- NFR-003 ⚠️ только Chromium (десктоп + mobile); Firefox/WebKit — этап 19
- NFR-005 ⚠️ ErrorState + 404; ошибки API — этапы 03+

## решения (почему)

- PrimeVue 4 не 5: лицензия (см. ADR-008). не обновлять без согласования.
- шрифт системный: локальная сеть колледжа, без CDN.
- преподаватель на корне `/`, студент `/student/*`. admin/researcher пока в StaffLayout (вопрос 13), фильтр пунктов по правам — этап 03.
- нижняя панель студента: первые 4 пункта + «Ещё» (7 не влезают в 360 px); порядок ТЗ сохранён, в «Ещё» все 7.
- плейсхолдеры селектов «Группа»/«Дисциплина» короткие — длинные резались на 360. aria-label полный.
- Select PrimeVue на узком экране не сжимался (min-width:auto у .p-select-label) → `:deep(.p-select-label){min-width:0}` + min-width:0 у контейнера.
- общие компоненты свои, не обёртки PrimeVue (кроме Button в ErrorState) — проще заменить библиотеку.
- jsdom без matchMedia → src/testing/setup.ts (vitest setupFiles).

## файлы ключевые

- apps/web/src/navigation.ts — меню (менять только по согласованию)
- apps/web/src/router/index.ts — `routes` экспортируется (для тестов), RouteMeta.title
- apps/web/src/layouts/StaffLayout.vue, StudentLayout.vue
- apps/web/src/components/\*.vue, components/layout/\*
- apps/web/src/theme/preset.ts, tokens.css; plugins/primevue.ts
- apps/web/src/testing/mount.ts — mountWithApp(component, {path}) = PrimeVue + memory router
- apps/web/e2e/navigation.spec.ts; playwright.config.ts — проекты `desktop`, `mobile-360` (Pixel 5, 360×740)
- docs/design/\*

## проверить

- `export PATH=$HOME/.npm-global/bin:$PATH`
- `pnpm lint && pnpm typecheck && pnpm test` (api e2e нужен `pnpm db:up` + .env.test)
- `pnpm test:e2e` (сам поднимает vite на 5173; reuseExistingServer — если на 5173 висит чужой dev-сервер, тесты пойдут в него)
- `pnpm dev` → http://localhost:5173/ (преподаватель), /student, /login

## тесты

- web vitest 27/27 (navigation 6, components 15, layouts 6); shared 1/1; api unit 26/26; api e2e 6/6.
- playwright 49 passed, 1 skipped (тест нижней панели пропускается на desktop — by design).
- `pnpm --filter @iot/web build` ок (JS 470 kB / 115 kB gzip).

## долги / TODO(этап NN)

- TODO(этап 03): логика входа в LoginView; имя/роль в HeaderActions вместо «Вход не выполнен»; guard'ы маршрутов, редирект студента на /student, скрытие пунктов по правам (вопрос 13).
- TODO(этап 04/16): списки групп/дисциплин в селекторах шапки (сейчас пустые массивы в StaffLayout), выбор периода.
- TODO(этап 15): счётчик на колоколе уведомлений.
- TODO(этапы с статусами): маппинг статусов (*_LABELS) → tone StatusBadge — таблица-ориентир в docs/design/tokens.md.
- TODO(этап 19): Firefox/WebKit проекты в playwright; проверка состояния ветки PrimeVue 4.x в `pnpm audit`.
- TODO(этап 22): docs/licenses.md — отметить ограничение PrimeVue 5.
- worktree: node_modules ставить `pnpm install` в корне; .env/.env.test копировать из основной копии.

## для след. этапа

- этап 03 (auth/RBAC/аудит/админка). страницы Администрирование (/admin) и Настройки (/settings) — пока PlaceholderView; заменить component в router для этих имён маршрутов (лучше: дать NavItem/route отдельный component, не плодить условия).
- для страниц использовать класс `.iot-page` + h1, EmptyState/ErrorState, MetricCard/ProgressIndicator. тесты компонентов — mountWithApp.
