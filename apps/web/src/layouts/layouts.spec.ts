import { describe, expect, it } from 'vitest';
import {
  STUDENT_BOTTOM_NAV_SIZE,
  STUDENT_NAV,
  TEACHER_NAV,
  TEACHER_SERVICE_NAV,
} from '@/navigation';
import { mountWithApp } from '@/testing/mount';
import StaffLayout from './StaffLayout.vue';
import StudentLayout from './StudentLayout.vue';

describe('StaffLayout', () => {
  it('ТЗ п. 4.1, 6.2: шапка с группой, дисциплиной, уведомлениями и профилем', async () => {
    const { wrapper } = await mountWithApp(StaffLayout, { path: '/' });
    const header = wrapper.find('header');
    expect(header.text()).toContain('ИОТ');
    expect(header.find('[aria-label="Учебная группа"]').exists()).toBe(true);
    expect(header.find('[aria-label="Дисциплина"]').exists()).toBe(true);
    expect(header.find('[aria-label="Уведомления"]').exists()).toBe(true);
    expect(header.text()).toContain('Вход не выполнен');
  });

  it('ТЗ п. 3.1: левое меню — 10 основных пунктов и 4 служебных', async () => {
    const { wrapper } = await mountWithApp(StaffLayout, { path: '/' });
    const links = wrapper.find('aside nav').findAll('a');
    expect(links.map((link) => link.text())).toEqual(
      [...TEACHER_NAV, ...TEACHER_SERVICE_NAV].map((item) => item.label),
    );
  });

  it('текущий раздел отмечен aria-current', async () => {
    const { wrapper } = await mountWithApp(StaffLayout, { path: '/monitoring' });
    const current = wrapper.find('aside nav').findAll('[aria-current="page"]');
    expect(current.map((link) => link.text())).toEqual(['Мониторинг']);
  });

  it('раздел открывает заглушку «Раздел в разработке» с заголовком пункта', async () => {
    const { wrapper } = await mountWithApp(StaffLayout, { path: '/analytics' });
    expect(wrapper.find('main h1').text()).toBe('Аналитика');
    expect(wrapper.find('main').text()).toContain('Раздел в разработке');
  });
});

describe('StudentLayout', () => {
  it('ТЗ п. 3.2: боковое меню студента — 7 пунктов', async () => {
    const { wrapper } = await mountWithApp(StudentLayout, { path: '/student' });
    const links = wrapper.find('aside nav').findAll('a');
    expect(links.map((link) => link.text())).toEqual(STUDENT_NAV.map((item) => item.label));
  });

  it('ТЗ п. 3.2: нижняя мобильная панель — основные пункты и «Ещё»', async () => {
    const { wrapper } = await mountWithApp(StudentLayout, { path: '/student/trajectory' });
    const bottom = wrapper.find('nav[aria-label="Быстрая навигация"]');
    expect(bottom.findAll('a')).toHaveLength(STUDENT_BOTTOM_NAV_SIZE);
    expect(bottom.find('button').text()).toBe('Ещё');
    expect(bottom.find('[aria-current="page"]').text()).toBe('Траектория');
  });
});
