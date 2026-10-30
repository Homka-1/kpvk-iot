import {
  buildResearchData,
  buildResearchOutcomes,
  type ResearchDataDto,
  type ResearchMeasurementDto,
  type ScaleResultDto,
} from '@iot/shared';
import { describe, expect, it, vi } from 'vitest';
import { h } from 'vue';
import { mountWithApp } from '@/testing/mount';
import ResearchAnalysisBlock from './ResearchAnalysisBlock.vue';

// Chart.js в jsdom не рисует (нет canvas): графики заменяются заглушками.
vi.mock('vue-chartjs', () => {
  const stub = (name: string) => ({
    name,
    props: ['data', 'options'],
    setup: () => () => h('canvas', { 'data-chart': name }),
  });
  return { Bar: stub('Bar'), Line: stub('Line') };
});

const score = (code: string, rawScore: number): ScaleResultDto => ({
  scaleId: code,
  code,
  name: code,
  rawScore,
  missingAnswers: 0,
  level: null,
});

const measurement = (id: string, type: 'PRIMARY' | 'REPEATED'): ResearchMeasurementDto => ({
  id,
  title: type === 'PRIMARY' ? 'Входной замер' : 'Итоговый замер',
  measurementType: type,
  questionnaire: {
    questionnaireId: 'q1',
    versionId: 'v1',
    versionNumber: 1,
    title: 'Мотивация учения',
    isDemo: false,
  },
  direction: { code: 'LEARNING_MOTIVATION', name: 'Учебная мотивация' },
  startsOn: null,
  endsOn: null,
  createdAt: '2025-09-01T00:00:00Z',
});

// 6 участников ЭГ (рост 3–8) и 6 КГ (−1…+1); контрольные работы — входная и итоговая.
function fixture(): ResearchDataDto {
  const participants = Array.from({ length: 12 }, (_, index) => ({
    studentId: `s${index}`,
    code: `R${String(index + 1).padStart(3, '0')}`,
    group: index < 6 ? ('EXPERIMENTAL' as const) : ('CONTROL' as const),
    excluded: false,
  }));
  const growth = [3, 4, 5, 6, 7, 8, -1, 0, 1, 1, -1, 1];
  const web = { id: 'web', name: 'Веб-дизайн' };
  const entry = { id: 'w1', topic: 'Вёрстка', kind: 'ENTRY' as const, date: '2025-10-21' };
  const final = { id: 'w2', topic: 'Вёрстка', kind: 'FINAL' as const, date: '2026-04-28' };
  return {
    ...buildResearchData({
      participants,
      measurements: [measurement('m1', 'PRIMARY'), measurement('m2', 'REPEATED')],
      versionScales: new Map([['v1', [{ code: 'INT', name: 'Интерес', aggregation: 'SUM' }]]]),
      sessions: participants.flatMap((participant, index) => [
        {
          studentId: participant.studentId,
          versionId: 'v1',
          measurementType: 'PRIMARY' as const,
          completedAt: '2025-09-10T06:00:00Z',
          scores: [score('INT', 10 + index)],
        },
        {
          studentId: participant.studentId,
          versionId: 'v1',
          measurementType: 'REPEATED' as const,
          completedAt: '2026-05-10T06:00:00Z',
          scores: [score('INT', 10 + index + growth[index]!)],
        },
      ]),
      approved: new Set(),
    }),
    outcomes: buildResearchOutcomes({
      participants,
      periods: [],
      gradesBefore: null,
      gradesAfter: null,
      grades: [],
      observationsBefore: null,
      observationsAfter: null,
      criteria: [],
      ratings: [],
      controls: participants.flatMap((participant, index) => [
        {
          studentId: participant.studentId,
          discipline: web,
          kind: 'ENTRY' as const,
          score: 50 + index,
          work: entry,
        },
        {
          studentId: participant.studentId,
          discipline: web,
          kind: 'FINAL' as const,
          score: 50 + index + growth[index]! * 2,
          work: final,
        },
      ]),
    }),
  };
}

describe('этап 29: сводный анализ эксперимента', () => {
  it('разделы по отдельности, проверки, динамика и выводы текстом', async () => {
    const { wrapper } = await mountWithApp(ResearchAnalysisBlock, { props: { data: fixture() } });
    const headings = wrapper.findAll('h4').map((item) => item.text());
    expect(headings).toEqual([
      'Мотивация',
      'Саморегуляция',
      'Академические достижения',
      'Педагогические наблюдения на занятиях',
      'Корреляции Спирмена между показателями',
    ]);
    const text = wrapper.text();
    // Методики саморегуляции нет — «Нет данных», а не нули (FR-074).
    expect(text).toContain('Нет данных: нет замеров по методикам направления «Саморегуляция»');
    expect(text).toContain('Парные измерения: пройдена');
    expect(text).toContain('Все пары полные: ЭГ — 6 из 6, КГ — 6 из 6.');
    expect(text).toContain('ЭГ: значимый рост (p = 0,031');
    expect(text).toContain('КГ: статистически значимых изменений нет');
    expect(text).toContain('6 (100 %)');
    // Семестры не выбраны — проверка не пройдена, сравнения нет.
    expect(text).toContain('Периоды: не пройдена');
    // Графики: средние и динамика по разделам, ряд контрольных работ.
    expect(wrapper.findAll('[data-chart="Bar"]').length).toBeGreaterThanOrEqual(4);
    expect(wrapper.findAll('[data-chart="Line"]')).toHaveLength(1);
  });

  it('корреляции: по изменению — только показатели с сопоставимыми парами', async () => {
    const { wrapper } = await mountWithApp(ResearchAnalysisBlock, { props: { data: fixture() } });
    const legend = wrapper.findAll('.correlations__legend li').map((item) => item.text());
    expect(legend).toHaveLength(2);
    expect(legend[0]).toContain('Интерес');
    expect(legend[1]).toContain('Контрольные работы: Веб-дизайн');
    expect(wrapper.find('.correlations__table tbody td').text()).toMatch(/^1\*\*/);
  });
});
