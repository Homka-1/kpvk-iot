import { describe, expect, it } from 'vitest';
import { STUDENT_BOTTOM_NAV_SIZE, STUDENT_NAV, TEACHER_NAV } from '@/navigation';
import { mountWithApp, testUser } from '@/testing/mount';
import StaffLayout from './StaffLayout.vue';
import StudentLayout from './StudentLayout.vue';

const sidebarLabels = (wrapper: Awaited<ReturnType<typeof mountWithApp>>['wrapper']) =>
  wrapper
    .find('aside nav')
    .findAll('a')
    .map((link) => link.text());

describe('StaffLayout', () => {
  it('ТЗ п. 4.1, 6.2: шапка с группой, дисциплиной, уведомлениями и профилем пользователя', async () => {
    const { wrapper } = await mountWithApp(StaffLayout, { path: '/' });
    const header = wrapper.find('header');
    expect(header.text()).toContain('ИОТ');
    expect(header.find('[aria-label="Учебная группа"]').exists()).toBe(true);
    expect(header.find('[aria-label="Дисциплина"]').exists()).toBe(true);
    expect(header.find('[aria-label="Уведомления"]').exists()).toBe(true);
    expect(header.text()).toContain('Иванова Анна Сергеевна');
    expect(header.text()).toContain('Преподаватель');
  });

  it('ТЗ п. 3.1: преподаватель видит 10 основных пунктов и свои служебные разделы', async () => {
    const { wrapper } = await mountWithApp(StaffLayout, { path: '/' });
    expect(sidebarLabels(wrapper)).toEqual([
      ...TEACHER_NAV.map((item) => item.label),
      'Дисциплины',
      'Библиотека материалов',
    ]);
  });

  it('п. 2.1: администратор видит главную и служебные разделы', async () => {
    const { wrapper } = await mountWithApp(StaffLayout, { path: '/', user: testUser(['admin']) });
    expect(sidebarLabels(wrapper)).toEqual([
      'Главная',
      'Дисциплины',
      'Настройки',
      'Администрирование',
    ]);
  });

  it('п. 2.4: исследователь видит главную, аналитику и отчёты', async () => {
    const { wrapper } = await mountWithApp(StaffLayout, {
      path: '/',
      user: testUser(['researcher']),
    });
    expect(sidebarLabels(wrapper)).toEqual(['Главная', 'Аналитика', 'Отчёты']);
  });

  it('раздел без нужного разрешения показывает «Нет доступа»', async () => {
    const { wrapper } = await mountWithApp(StaffLayout, { path: '/admin' });
    expect(wrapper.find('main h1').text()).toBe('Администрирование');
    expect(wrapper.find('main').text()).toContain('Нет доступа к разделу');
  });

  it('текущий раздел отмечен aria-current', async () => {
    const { wrapper } = await mountWithApp(StaffLayout, { path: '/monitoring' });
    const current = wrapper.find('aside nav').findAll('[aria-current="page"]');
    expect(current.map((link) => link.text())).toEqual(['Мониторинг']);
  });

  it('раздел открывается в оболочке с заголовком пункта', async () => {
    const { wrapper } = await mountWithApp(StaffLayout, { path: '/reports' });
    expect(wrapper.find('main h1').text()).toBe('Отчёты');
  });
});

describe('StudentLayout', () => {
  const student = testUser(['student']);

  it('ТЗ п. 3.2: боковое меню студента — 7 пунктов', async () => {
    const { wrapper } = await mountWithApp(StudentLayout, { path: '/student', user: student });
    expect(sidebarLabels(wrapper)).toEqual(STUDENT_NAV.map((item) => item.label));
  });

  it('ТЗ п. 3.2: нижняя мобильная панель — основные пункты и «Ещё»', async () => {
    const { wrapper } = await mountWithApp(StudentLayout, {
      path: '/student/trajectory',
      user: student,
    });
    const bottom = wrapper.find('nav[aria-label="Быстрая навигация"]');
    expect(bottom.findAll('a')).toHaveLength(STUDENT_BOTTOM_NAV_SIZE);
    expect(bottom.find('button').text()).toBe('Ещё');
    expect(bottom.find('[aria-current="page"]').text()).toBe('Траектория');
  });
});
