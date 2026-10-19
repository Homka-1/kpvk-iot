import type { DiagnosticComparisonDto, ScaleResultDto } from '@iot/shared';
import { describe, expect, it, vi } from 'vitest';
import { h } from 'vue';
import { mountWithApp } from '@/testing/mount';
import DiagnosticComparison from './DiagnosticComparison.vue';

// Chart.js в jsdom не рисует (нет canvas): график заменяется заглушкой с теми же данными.
vi.mock('vue-chartjs', () => ({
  Line: {
    name: 'Line',
    props: ['data', 'options'],
    setup(props: { data: { datasets: { data: (number | null)[] }[] } }) {
      return () =>
        h('canvas', { 'data-series': JSON.stringify(props.data.datasets.map((d) => d.data)) });
    },
  },
}));

const score = (
  code: string,
  name: string,
  rawScore: number | null,
  missing = 0,
): ScaleResultDto => ({
  scaleId: code,
  code,
  name,
  rawScore,
  missingAnswers: missing,
  level: rawScore === null ? null : { code: 'mid', label: 'Средний' },
});

const comparison: DiagnosticComparisonDto = {
  questionnaireId: 'q1',
  title: 'ДЕМО — не для исследования: Учебная мотивация',
  isDemo: true,
  scales: [
    { code: 'INTEREST', name: 'Интерес' },
    { code: 'ACHIEVEMENT', name: 'Достижения' },
  ],
  measurements: [
    {
      sessionId: 's1',
      measurementType: 'PRIMARY',
      source: 'ONLINE',
      versionId: 'v1',
      versionNumber: 1,
      completedAt: '2026-09-10T10:00:00.000Z',
      values: {
        INTEREST: score('INTEREST', 'Интерес', 12),
        ACHIEVEMENT: score('ACHIEVEMENT', 'Достижения', null, 2),
      },
    },
    {
      sessionId: 's2',
      measurementType: 'REPEATED',
      source: 'PAPER',
      versionId: 'v1',
      versionNumber: 1,
      completedAt: '2026-12-10T10:00:00.000Z',
      values: {
        INTEREST: score('INTEREST', 'Интерес', 15.5),
        ACHIEVEMENT: score('ACHIEVEMENT', 'Достижения', 9),
      },
    },
  ],
  changes: { INTEREST: 3.5, ACHIEVEMENT: null },
  excluded: [
    {
      sessionId: 's3',
      measurementType: 'INTERMEDIATE',
      versionNumber: 2,
      completedAt: '2026-11-01T10:00:00.000Z',
      reason: 'Версия 2 не утверждена как сопоставимая с версией 1',
    },
  ],
};

describe('сравнение замеров', () => {
  it('AT-10, FR-024: повторный замер рядом с первичным, изменение со стрелкой и текстом', async () => {
    const { wrapper } = await mountWithApp(DiagnosticComparison, { props: { comparison } });
    const headers = wrapper.findAll('thead th').map((cell) => cell.text());
    expect(headers[1]).toContain('Первичный');
    expect(headers[1]).toContain('10.09.2026, версия 1');
    expect(headers[2]).toContain('Повторный');
    expect(headers[3]).toBe('Изменение');
    const rows = wrapper.findAll('tbody tr').map((row) => row.text());
    expect(rows[0]).toContain('+3,5');
    expect(wrapper.find('tbody tr .pi-arrow-up-right').exists()).toBe(true);
  });

  it('FR-074, FR-015: пропуск — «Нет данных», на графике — разрыв (null), не ноль', async () => {
    const { wrapper } = await mountWithApp(DiagnosticComparison, { props: { comparison } });
    const achievement = wrapper.findAll('tbody tr')[1]!.text();
    expect(achievement).toContain('Нет данных');
    expect(achievement).toContain('без ответа: 2');
    const series = JSON.parse(wrapper.find('canvas').attributes('data-series')!);
    expect(series).toEqual([
      [12, 15.5],
      [null, 9],
    ]);
  });

  it('UC-06: несопоставимый замер показан отдельно с причиной; один замер — без графика', async () => {
    const { wrapper } = await mountWithApp(DiagnosticComparison, { props: { comparison } });
    expect(wrapper.text()).toContain('Не входят в сравнение');
    expect(wrapper.text()).toContain('Версия 2 не утверждена как сопоставимая с версией 1');

    const single = await mountWithApp(DiagnosticComparison, {
      props: {
        comparison: {
          ...comparison,
          measurements: comparison.measurements.slice(0, 1),
          changes: {},
          excluded: [],
        },
      },
    });
    expect(single.wrapper.text()).toContain('Пока один замер');
    expect(single.wrapper.find('canvas').exists()).toBe(false);
  });
});
