import { expect, test } from '@playwright/test';
import type { CabinetTrajectoryDto, DashboardDto } from '@iot/shared';
import { expectNoHorizontalScroll, fakeUser, mockSession } from './support/session';

const dashboard: DashboardDto = {
  period: { from: '2026-09-01', to: null },
  cards: {
    students: 24,
    activeTrajectories: 18,
    averageProgress: 62,
    toReview: 7,
    overdueAssignments: 3,
    needsAttention: 4,
  },
  stages: [1, 2, 3, 4, 5].map((position) => ({
    position,
    counts: { NOT_STARTED: position * 3, IN_PROGRESS: 2, COMPLETED: 18 - position * 3 - 2 },
  })),
  profiles: {
    total: 24,
    HIGH: 5,
    MEDIUM: 10,
    LOW: 3,
    PROPOSED: 1,
    NEEDS_MORE_DIAGNOSTICS: 1,
    NONE: 4,
  },
  recentAssignments: [
    {
      id: 'ta1',
      title: 'Эссе «Почему мне интересна профессия программиста»',
      status: 'SUBMITTED',
      assignedAt: '2026-10-15T09:00:00Z',
      dueAt: '2026-10-25T20:59:59Z',
      student: { id: 'st1', fullName: 'Петров Иван Сергеевич' },
      discipline: 'Основы алгоритмизации и программирования',
    },
  ],
  activity: [
    {
      kind: 'DIFFICULTY_REPORT',
      at: '2026-10-18T09:00:00Z',
      student: { id: 'st2', fullName: 'Сидорова Мария Алексеевна' },
      title: 'Не получается разобраться с циклами в задаче 3',
      reviewId: null,
      open: true,
    },
  ],
  upcoming: [
    {
      kind: 'CHECKPOINT',
      id: 'cp1',
      date: '2026-11-12',
      title: 'Контрольная работа по циклам',
      stageTitle: 'Основной',
      trajectoryId: 't1',
      student: { id: 'st1', fullName: 'Петров Иван Сергеевич' },
      discipline: 'Основы алгоритмизации и программирования',
    },
  ],
};

test.describe('главная панель преподавателя', () => {
  test('п. 4.1, 6.2, FR-003, NFR-004: показатели, диаграммы и переход к отфильтрованному списку', async ({
    page,
  }) => {
    await mockSession(page, fakeUser(['teacher']));
    const periods: string[] = [];
    await page.route(/\/api\/dashboard(\?.*)?$/, (route) => {
      periods.push(new URL(route.request().url()).searchParams.get('period') ?? '');
      return route.fulfill({ json: dashboard });
    });
    await page.route(/\/api\/students(\?.*)?$/, (route) =>
      route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20 } }),
    );
    await page.goto('/');

    const cards = page.getByRole('region', { name: 'Сводные показатели' });
    await expect(cards.getByRole('link')).toHaveCount(6);
    await expect(cards).toContainText('Студентов24');
    await expect(page.getByRole('heading', { name: 'Выполнение ИОТ' })).toBeVisible();
    await expect(page.getByRole('img', { name: /Маршруты по статусу/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Высокий уровень' })).toBeVisible();
    await expect(page.getByText('Не рассмотрено')).toBeVisible();
    await expectNoHorizontalScroll(page);

    // FR-004: смена периода — новый запрос с выбранным периодом.
    await page.getByRole('combobox', { name: 'Период' }).click();
    await page.getByRole('option', { name: 'Последние 4 недели' }).click();
    await expect.poll(() => periods.at(-1)).toBe('WEEKS_4');

    // FR-003: показатель открывает отфильтрованный список.
    await cards.getByRole('link', { name: /требующих внимания/ }).click();
    await expect(page).toHaveURL('/students?attention=1');
    await expect(page.getByRole('combobox', { name: 'Фильтр «Требуют внимания»' })).toContainText(
      'Требуют внимания',
    );
  });

  test('FR-005: пустая база — пояснения вместо нулей', async ({ page }) => {
    await mockSession(page, fakeUser(['teacher']));
    await page.goto('/');
    await expect(page.getByText('Нет данных')).toHaveCount(6);
    await expect(page.getByText('Активных ИОТ пока нет')).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});

const trajectory: CabinetTrajectoryDto = {
  id: 't1',
  status: 'ACTIVE',
  version: 1,
  discipline: { id: 'd1', name: 'Основы алгоритмизации и программирования' },
  teacher: { id: 'u1', fullName: 'Иванова Анна Сергеевна' },
  goals: 'Освоить базовые алгоритмические конструкции',
  plannedResults: null,
  supportMethods: null,
  startDate: null,
  plannedEndDate: null,
  currentStageId: 's2',
  approvedAt: '2026-09-10T00:00:00Z',
  completedAt: null,
  finalAssessment: null,
  stages: [
    {
      id: 's1',
      sortOrder: 0,
      title: 'Адаптационный',
      goal: 'Познакомиться с курсом',
      description: null,
      plannedResults: null,
      startDate: null,
      endDate: null,
      status: 'COMPLETED',
      checkpoints: [
        { id: 'k1', title: 'Входной тест', description: null, dueDate: null, status: 'PASSED' },
      ],
      materials: [],
      assignments: [],
    },
    {
      id: 's2',
      sortOrder: 1,
      title: 'Основной',
      goal: 'Научиться планировать решение задач',
      description: null,
      plannedResults: null,
      startDate: null,
      endDate: null,
      status: 'IN_PROGRESS',
      checkpoints: [],
      materials: [],
      assignments: [],
    },
  ],
  proposals: [],
};

test('п. 6.5, NFR-004: главная студента отвечает на четыре вопроса', async ({ page }) => {
  await mockSession(page, fakeUser(['student']));
  await page.route(/\/api\/cabinet\/trajectories$/, (route) =>
    route.fulfill({ json: [trajectory] }),
  );
  await page.route(/\/api\/cabinet\/assignments$/, (route) =>
    route.fulfill({
      json: {
        choices: [],
        items: [
          {
            id: 'a1',
            status: 'RETURNED',
            dueAt: '2026-11-12T20:59:59Z',
            assignedAt: '2026-10-01T00:00:00Z',
            assignment: {
              id: 'x',
              title: 'Блок-схема алгоритма поиска максимума',
              typeName: 'Практическая работа',
              difficulty: 'BASIC',
              topic: null,
            },
            discipline: trajectory.discipline,
            trajectory: null,
            choiceGroup: null,
            assignedBy: null,
            result: null,
          },
        ],
      },
    }),
  );
  await page.goto('/student');

  for (const name of [
    'Моя текущая цель',
    'Что выполнить сейчас',
    'Чего я достиг',
    'Где получить помощь',
  ]) {
    await expect(page.getByRole('heading', { name })).toBeVisible();
  }
  await expect(page.getByText('Научиться планировать решение задач')).toBeVisible();
  await expect(page.getByText('Возвращено на доработку')).toBeVisible();
  await expect(page.getByText('Пройдено этапов: 1')).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByRole('button', { name: 'Задать вопрос' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});
