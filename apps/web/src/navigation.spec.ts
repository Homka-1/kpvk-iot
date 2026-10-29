import { describe, expect, it } from 'vitest';
import {
  isNavItemActive,
  STUDENT_NAV,
  TEACHER_NAV,
  TEACHER_SERVICE_NAV,
  type NavItem,
} from './navigation';
import { createTestRouter } from './testing/mount';

const labels = (items: readonly NavItem[]) => items.map((item) => item.label);

describe('навигация', () => {
  it('ТЗ п. 3.1: меню преподавателя — 10 пунктов в порядке ТЗ и «Академические достижения» (этап 28)', () => {
    expect(labels(TEACHER_NAV)).toEqual([
      'Главная',
      'Студенты',
      'Диагностика',
      'Мотивационные профили',
      'Индивидуальные траектории',
      'Задания',
      'Мониторинг',
      'Академические достижения',
      'Обратная связь',
      'Аналитика',
      'Отчёты',
    ]);
  });

  it('ТЗ п. 3.1: служебные разделы — 4 пункта', () => {
    expect(labels(TEACHER_SERVICE_NAV)).toEqual([
      'Дисциплины',
      'Библиотека материалов',
      'Настройки',
      'Администрирование',
    ]);
  });

  it('ТЗ п. 3.2: меню студента — 7 пунктов в порядке ТЗ', () => {
    expect(labels(STUDENT_NAV)).toEqual([
      'Главная',
      'Моя траектория',
      'Мои задания',
      'Диагностика',
      'Мои достижения',
      'Обратная связь',
      'Мой профиль',
    ]);
  });

  it('каждый пункт меню ведёт на свой маршрут с заголовком пункта', () => {
    const router = createTestRouter();
    for (const item of [...TEACHER_NAV, ...TEACHER_SERVICE_NAV, ...STUDENT_NAV]) {
      const resolved = router.resolve(item.path);
      expect(resolved.name, item.path).toBe(item.name);
      expect(resolved.meta.title).toBe(item.label);
    }
  });

  it('неизвестный адрес ведёт на страницу «не найдено»', () => {
    expect(createTestRouter().resolve('/нет-такого').name).toBe('not-found');
  });

  it('«Главная» активна только на своём адресе, разделы — и на вложенных страницах', () => {
    const [home, students] = TEACHER_NAV;
    expect(isNavItemActive(home!, '/')).toBe(true);
    expect(isNavItemActive(home!, '/students')).toBe(false);
    expect(isNavItemActive(students!, '/students')).toBe(true);
    expect(isNavItemActive(students!, '/students/42')).toBe(true);
    expect(isNavItemActive(students!, '/students-archive')).toBe(false);
  });
});
