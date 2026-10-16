import { APP_SHORT_NAME } from '@iot/shared';
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import StaffLayout from '@/layouts/StaffLayout.vue';
import StudentLayout from '@/layouts/StudentLayout.vue';
import { STUDENT_NAV, TEACHER_NAV, TEACHER_SERVICE_NAV, type NavItem } from '@/navigation';
import LoginView from '@/views/LoginView.vue';
import NotFoundView from '@/views/NotFoundView.vue';
import PlaceholderView from '@/views/PlaceholderView.vue';

declare module 'vue-router' {
  interface RouteMeta {
    /** Заголовок страницы (h1 и заголовок вкладки браузера). */
    title?: string;
  }
}

/** Пока разделы не реализованы, каждый пункт меню открывает заглушку. */
function sectionRoute(item: NavItem, basePath: string): RouteRecordRaw {
  const relative = item.path.slice(basePath.length).replace(/^\//, '');
  return {
    path: relative,
    name: item.name,
    component: PlaceholderView,
    meta: { title: item.label },
  };
}

export const routes: RouteRecordRaw[] = [
  { path: '/login', name: 'login', component: LoginView, meta: { title: 'Вход в систему' } },
  {
    path: '/student',
    component: StudentLayout,
    children: STUDENT_NAV.map((item) => sectionRoute(item, '/student')),
  },
  {
    path: '/',
    component: StaffLayout,
    children: [...TEACHER_NAV, ...TEACHER_SERVICE_NAV].map((item) => sectionRoute(item, '/')),
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: NotFoundView,
    meta: { title: 'Страница не найдена' },
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} — ${APP_SHORT_NAME}` : APP_SHORT_NAME;
});
