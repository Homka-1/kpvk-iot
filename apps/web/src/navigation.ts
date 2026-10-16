/**
 * Структура навигации по ТЗ, п. 3.1 и 3.2. Порядок и названия пунктов зафиксированы
 * (ограничение 7 ТЗ): не добавлять, не переименовывать и не переставлять без согласования.
 * Из этих списков строятся меню и маршруты приложения.
 */
export interface NavItem {
  /** Имя маршрута Vue Router. */
  name: string;
  path: string;
  /** Название пункта меню и заголовок страницы. */
  label: string;
  /** Короткая подпись для нижней мобильной панели. */
  shortLabel?: string;
  /** CSS-класс иконки PrimeIcons. */
  icon: string;
}

/** Основное меню преподавателя (п. 3.1, пункты 1–10). */
export const TEACHER_NAV: readonly NavItem[] = [
  { name: 'home', path: '/', label: 'Главная', icon: 'pi pi-home' },
  { name: 'students', path: '/students', label: 'Студенты', icon: 'pi pi-users' },
  { name: 'diagnostics', path: '/diagnostics', label: 'Диагностика', icon: 'pi pi-list-check' },
  {
    name: 'motivation-profiles',
    path: '/motivation-profiles',
    label: 'Мотивационные профили',
    icon: 'pi pi-id-card',
  },
  {
    name: 'trajectories',
    path: '/trajectories',
    label: 'Индивидуальные траектории',
    icon: 'pi pi-directions',
  },
  { name: 'assignments', path: '/assignments', label: 'Задания', icon: 'pi pi-file-edit' },
  { name: 'monitoring', path: '/monitoring', label: 'Мониторинг', icon: 'pi pi-chart-line' },
  { name: 'feedback', path: '/feedback', label: 'Обратная связь', icon: 'pi pi-comments' },
  { name: 'analytics', path: '/analytics', label: 'Аналитика', icon: 'pi pi-chart-bar' },
  { name: 'reports', path: '/reports', label: 'Отчёты', icon: 'pi pi-file' },
];

/** Служебные разделы (п. 3.1). */
export const TEACHER_SERVICE_NAV: readonly NavItem[] = [
  { name: 'disciplines', path: '/disciplines', label: 'Дисциплины', icon: 'pi pi-book' },
  {
    name: 'library',
    path: '/library',
    label: 'Библиотека материалов',
    icon: 'pi pi-folder-open',
  },
  { name: 'settings', path: '/settings', label: 'Настройки', icon: 'pi pi-cog' },
  { name: 'admin', path: '/admin', label: 'Администрирование', icon: 'pi pi-shield' },
];

/** Меню студента (п. 3.2). */
export const STUDENT_NAV: readonly NavItem[] = [
  { name: 'student-home', path: '/student', label: 'Главная', icon: 'pi pi-home' },
  {
    name: 'student-trajectory',
    path: '/student/trajectory',
    label: 'Моя траектория',
    shortLabel: 'Траектория',
    icon: 'pi pi-directions',
  },
  {
    name: 'student-assignments',
    path: '/student/assignments',
    label: 'Мои задания',
    shortLabel: 'Задания',
    icon: 'pi pi-file-edit',
  },
  {
    name: 'student-diagnostics',
    path: '/student/diagnostics',
    label: 'Диагностика',
    icon: 'pi pi-list-check',
  },
  {
    name: 'student-achievements',
    path: '/student/achievements',
    label: 'Мои достижения',
    shortLabel: 'Достижения',
    icon: 'pi pi-trophy',
  },
  {
    name: 'student-feedback',
    path: '/student/feedback',
    label: 'Обратная связь',
    icon: 'pi pi-comments',
  },
  {
    name: 'student-profile',
    path: '/student/profile',
    label: 'Мой профиль',
    shortLabel: 'Профиль',
    icon: 'pi pi-user',
  },
];

/** Сколько первых пунктов студента показывать в нижней панели смартфона; остальные — в меню «Ещё». */
export const STUDENT_BOTTOM_NAV_SIZE = 4;

/**
 * Активен ли пункт меню для текущего пути. Корневые пункты («Главная») — только при точном
 * совпадении, остальные — также для вложенных страниц раздела.
 */
export function isNavItemActive(item: NavItem, currentPath: string): boolean {
  if (item.path === '/' || item.path === '/student') return currentPath === item.path;
  return currentPath === item.path || currentPath.startsWith(`${item.path}/`);
}
