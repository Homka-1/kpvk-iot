import { APP_SHORT_NAME, Permission } from '@iot/shared';
import {
  createRouter,
  createWebHistory,
  type RouteComponent,
  type RouteLocationNormalized,
  type RouteLocationRaw,
  type RouteRecordRaw,
} from 'vue-router';
import StaffLayout from '@/layouts/StaffLayout.vue';
import StudentLayout from '@/layouts/StudentLayout.vue';
import { STUDENT_NAV, TEACHER_NAV, TEACHER_SERVICE_NAV, type NavItem } from '@/navigation';
import { homePath } from '@/router/paths';
import { useAuthStore } from '@/stores/auth';
import LoginView from '@/views/LoginView.vue';
import NotFoundView from '@/views/NotFoundView.vue';
import PlaceholderView from '@/views/PlaceholderView.vue';

declare module 'vue-router' {
  interface RouteMeta {
    /** Заголовок страницы (h1 и заголовок вкладки браузера). */
    title?: string;
    /** Страница доступна без входа. */
    public?: boolean;
    /** Часть приложения: кабинет студента или рабочее место сотрудника. */
    area?: 'staff' | 'student';
    /** Разрешение, необходимое для раздела. Без него раздел показывает «Нет доступа». */
    permission?: Permission;
  }
}

/** Реализованные разделы. Остальные пункты меню пока открывают заглушку. */
const SECTION_VIEWS: Partial<Record<string, RouteComponent | (() => Promise<RouteComponent>)>> = {
  home: () => import('@/views/dashboard/TeacherDashboardView.vue'),
  students: () => import('@/views/students/StudentsView.vue'),
  diagnostics: () => import('@/views/diagnostics/DiagnosticsView.vue'),
  'motivation-profiles': () => import('@/views/profiles/MotivationProfilesView.vue'),
  trajectories: () => import('@/views/trajectories/TrajectoriesView.vue'),
  assignments: () => import('@/views/assignments/AssignmentsView.vue'),
  monitoring: () => import('@/views/monitoring/MonitoringView.vue'),
  feedback: () => import('@/views/feedback/FeedbackView.vue'),
  library: () => import('@/views/library/LibraryView.vue'),
  analytics: () => import('@/views/analytics/AnalyticsView.vue'),
  reports: () => import('@/views/reports/ReportsView.vue'),
  disciplines: () => import('@/views/disciplines/DisciplinesView.vue'),
  settings: () => import('@/views/SettingsView.vue'),
  admin: () => import('@/views/admin/AdminView.vue'),
  'student-home': () => import('@/views/student/StudentHomeView.vue'),
  'student-trajectory': () => import('@/views/student/MyTrajectoryView.vue'),
  'student-assignments': () => import('@/views/student/MyAssignmentsView.vue'),
  'student-diagnostics': () => import('@/views/student/MyDiagnosticsView.vue'),
  'student-achievements': () => import('@/views/student/MyAchievementsView.vue'),
  'student-feedback': () => import('@/views/student/MyFeedbackView.vue'),
  'student-profile': () => import('@/views/student/MyProfileView.vue'),
};

function sectionRoute(item: NavItem, basePath: string, permission?: Permission): RouteRecordRaw {
  const relative = item.path.slice(basePath.length).replace(/^\//, '');
  return {
    path: relative,
    name: item.name,
    component: SECTION_VIEWS[item.name] ?? PlaceholderView,
    meta: { title: item.label, permission: item.permission ?? permission },
  };
}

export const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: LoginView,
    meta: { title: 'Вход в систему', public: true },
  },
  {
    path: '/account/password',
    name: 'change-password',
    component: () => import('@/views/ChangePasswordView.vue'),
    meta: { title: 'Смена пароля' },
  },
  {
    path: '/student',
    component: StudentLayout,
    meta: { area: 'student' },
    children: [
      ...STUDENT_NAV.map((item) => sectionRoute(item, '/student', Permission.CABINET_ACCESS)),
      // Прохождение методики — вложенная страница раздела «Диагностика» кабинета (огр. 7).
      {
        path: 'diagnostics/:id',
        name: 'student-diagnostic-run',
        component: () => import('@/views/student/DiagnosticRunView.vue'),
        meta: { title: 'Прохождение диагностики', permission: Permission.CABINET_ACCESS },
      },
      // Карточка задания — вложенная страница раздела «Мои задания».
      {
        path: 'assignments/:id',
        name: 'student-assignment-details',
        component: () => import('@/views/student/MyAssignmentView.vue'),
        meta: { title: 'Задание', permission: Permission.CABINET_ACCESS },
      },
    ],
  },
  {
    path: '/',
    component: StaffLayout,
    meta: { area: 'staff' },
    children: [
      ...[...TEACHER_NAV, ...TEACHER_SERVICE_NAV].map((item) => sectionRoute(item, '/')),
      // Профиль студента — вложенная страница раздела «Студенты», а не пункт меню (огр. 7).
      {
        path: 'students/:id',
        name: 'student-details',
        component: () => import('@/views/students/StudentProfileView.vue'),
        meta: { title: 'Профиль студента', permission: Permission.STUDENTS_READ },
      },
      // Проверка ответа студента — вложенная страница раздела «Задания».
      {
        path: 'assignments/review/:id',
        name: 'assignment-review',
        component: () => import('@/views/assignments/AssignmentReviewView.vue'),
        meta: { title: 'Проверка задания', permission: Permission.ASSIGNMENTS_MANAGE },
      },
      // Мониторинг одной ИОТ — вложенная страница раздела «Мониторинг».
      {
        path: 'monitoring/:id',
        name: 'monitoring-details',
        component: () => import('@/views/monitoring/MonitoringDetailView.vue'),
        meta: { title: 'Мониторинг ИОТ', permission: Permission.MONITORING_READ },
      },
      // Исследование — вложенная страница раздела «Аналитика».
      {
        path: 'analytics/research/:id',
        name: 'research-details',
        component: () => import('@/views/analytics/ResearchProjectView.vue'),
        meta: { title: 'Исследование', permission: Permission.RESEARCH_READ },
      },
      // Конструктор методики — вложенная страница раздела «Диагностика».
      {
        path: 'diagnostics/questionnaires/:id',
        name: 'questionnaire-editor',
        component: () => import('@/views/diagnostics/QuestionnaireEditorView.vue'),
        meta: { title: 'Конструктор методики', permission: Permission.DIAGNOSTICS_MANAGE },
      },
      // Конструктор и страница ИОТ — вложенные страницы раздела «Индивидуальные траектории».
      {
        path: 'trajectories/new',
        name: 'trajectory-new',
        component: () => import('@/views/trajectories/TrajectoryNewView.vue'),
        meta: { title: 'Новая ИОТ', permission: Permission.TRAJECTORIES_MANAGE },
      },
      {
        path: 'trajectories/:id',
        name: 'trajectory-details',
        component: () => import('@/views/trajectories/TrajectoryView.vue'),
        meta: { title: 'Индивидуальная траектория', permission: Permission.TRAJECTORIES_MANAGE },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: NotFoundView,
    meta: { title: 'Страница не найдена', public: true },
  },
];

/**
 * Проверка перед переходом: без сессии — на страницу входа; при временном пароле — на смену
 * пароля; студент — только в своём кабинете, сотрудник — только в рабочем месте.
 * Это удобство интерфейса; права на данные проверяет сервер.
 */
export async function authGuard(to: RouteLocationNormalized): Promise<true | RouteLocationRaw> {
  const auth = useAuthStore();
  if (!auth.user) await auth.refresh();
  const user = auth.user;

  if (to.meta.public) {
    return to.name === 'login' && user ? homePath(user) : true;
  }
  if (!user) {
    return { name: 'login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } };
  }
  if (user.mustChangePassword && to.name !== 'change-password') {
    return { name: 'change-password' };
  }
  const area = to.matched[0]?.meta.area;
  if (area === 'student' && !auth.isStudent) return '/';
  if (area === 'staff' && auth.isStudent) return '/student';
  return true;
}

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(authGuard);

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} — ${APP_SHORT_NAME}` : APP_SHORT_NAME;
});
