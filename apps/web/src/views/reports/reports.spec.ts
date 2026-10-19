import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountWithApp, testUser } from '@/testing/mount';
import ReportsView from './ReportsView.vue';

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('раздел «Отчёты»', () => {
  it('FR-076–FR-080: преподаватель видит четыре вида отчётов; группа нужна для группового', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('[]', { status: 200 })),
    );
    const { wrapper } = await mountWithApp(ReportsView, {
      path: '/reports',
      user: testUser(['teacher']),
    });
    await flushPromises();
    const text = wrapper.text();
    for (const title of [
      'Индивидуальный отчёт студента',
      'Отчёт по группе',
      'Отчёт по реализации ИОТ',
      'Отчёт по диагностике',
    ]) {
      expect(text).toContain(title);
    }
    expect(text).toContain('PDF');
    expect(text).toContain('XLSX');
    expect(text).toContain('Выберите группу в шапке.');
    const buttons = wrapper.findAll('button').filter((b) => b.text().startsWith('Сформировать'));
    expect(buttons).toHaveLength(4);
    // Без группы в шапке недоступны индивидуальный и групповой отчёты, остальные — можно.
    expect(buttons.map((button) => button.attributes('disabled') !== undefined)).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it('п. 2.4: исследователь отчётов по студентам не получает', async () => {
    const { wrapper } = await mountWithApp(ReportsView, {
      path: '/reports',
      user: testUser(['researcher']),
    });
    await flushPromises();
    expect(wrapper.text()).toContain('Нет доступа к отчётам');
    expect(wrapper.findAll('button')).toHaveLength(0);
  });
});
