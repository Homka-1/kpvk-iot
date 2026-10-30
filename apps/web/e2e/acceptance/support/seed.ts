/**
 * Данные приёмочного стенда (п. 11.2 ТЗ). Создаются через API под учётными записями базового
 * сида — с теми же проверками прав и правил, что у пользователей.
 *
 * Состав:
 * - дисциплина «Математика», группы «ПО-21» (экспериментальная) и «ПО-22» (контрольная) по 20
 *   студентов (AT-01), демо-преподаватель закреплён за обеими;
 * - три задания библиотеки по дисциплине;
 * - первичная диагностика по демо-методике (ввод бланка) у студентов 1–10 каждой группы;
 * - подтверждённый мотивационный профиль и утверждённая ИОТ из пяти этапов у студентов 1–5
 *   экспериментальной группы, подтверждённый профиль у студента 8;
 * - исследование «Эффективность ИОТ» (ЭГ и КГ, входной замер) в статусе «Проводится».
 * Студенты 11–20 остаются без диагностики: на них приёмочные сценарии проверяют работу с нуля.
 *
 * Файл выполняется и в Playwright, и напрямую в Node (`pnpm acceptance:stand`), поэтому
 * импорты — с расширением `.ts`, без зависимостей от исходников других пакетов.
 */
import { randomBytes } from 'node:crypto';

export interface StandStudent {
  id: string;
  login: string;
  fullName: string;
  participantCode: string;
  /** Утверждённая ИОТ (студенты 1–5 экспериментальной группы). */
  trajectoryId: string | null;
}

export interface StandGroup {
  id: string;
  name: string;
  students: StandStudent[];
}

export interface StandData {
  apiUrl: string;
  webUrl: string;
  passwords: { admin: string; teacher: string; researcher: string; students: string };
  discipline: { id: string; name: string };
  experimental: StandGroup;
  control: StandGroup;
  tasks: { id: string; title: string }[];
  questionnaire: { id: string; title: string; versionId: string };
  research: { id: string; title: string };
}

export const DISCIPLINE = 'Математика';
export const TASK_TITLES = [
  'Линейные уравнения',
  'Системы линейных уравнений',
  'Текстовые задачи на движение',
];
export const RESEARCH_TITLE = 'Эффективность ИОТ';
export const TRAJECTORY_GOALS = 'Освоить решение уравнений и текстовых задач';
const STUDENTS_PER_GROUP = 20;
const DAY = 86_400_000;

// Вымышленные ФИО для тестового стенда.
const LAST_NAMES = [
  'Абенов',
  'Борисов',
  'Ветров',
  'Габдуллин',
  'Дмитриев',
  'Ермеков',
  'Жуков',
  'Зайцев',
  'Ибраев',
  'Козлов',
  'Лебедев',
  'Мухамедов',
  'Новиков',
  'Оспанов',
  'Петров',
  'Романов',
  'Сериков',
  'Тимуров',
  'Уразов',
  'Фёдоров',
];
const FIRST_NAMES = ['Алихан', 'Данияр', 'Егор', 'Иван', 'Максим'];

/** Ответы демо-методики: высокий, низкий и средний уровни (контрольные примеры п. 11.3). */
export const ANSWERS = {
  high: {
    q1: 5,
    q2: 1,
    q3: 5,
    q4: 1,
    q5: 'q5-o1',
    q6: ['q6-o1', 'q6-o2'],
    q7: 10,
    q8: 'Больше практики',
  },
  low: { q1: 1, q2: 5, q3: 2, q4: 4, q5: 'q5-o3', q6: ['q6-o4'], q7: 0 },
  medium: { q1: 3, q2: 3, q3: 3, q4: 3, q5: 'q5-o2', q6: ['q6-o1', 'q6-o2'], q7: 4 },
} as const;
const PATTERNS = [ANSWERS.high, ANSWERS.medium, ANSWERS.low];

type Json = Record<string, unknown>;

/** Минимальный клиент API с access-токеном и ключом идемпотентности (NFR-006). */
export class ApiClient {
  readonly apiUrl: string;
  readonly token: string | null;

  constructor(apiUrl: string, token: string | null = null) {
    this.apiUrl = apiUrl;
    this.token = token;
  }

  static async login(apiUrl: string, login: string, password: string): Promise<ApiClient> {
    const session = await new ApiClient(apiUrl).call<{ accessToken: string }>(
      'POST',
      '/auth/login',
      { login, password },
    );
    return new ApiClient(apiUrl, session.accessToken);
  }

  async call<T = Json>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.request(method, path, body);
    if (!response.ok) {
      throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
    }
    return (response.status === 204 ? {} : await response.json()) as T;
  }

  /** Запрос без проверки статуса — для проверок отказа в доступе. */
  request(method: string, path: string, body?: unknown): Promise<Response> {
    return fetch(`${this.apiUrl}/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': `acceptance-${randomBytes(8).toString('hex')}`,
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
}

/** Дата `YYYY-MM-DD` со сдвигом в днях от сегодняшнего дня (местное время). */
export function isoDate(offsetDays: number): string {
  const date = new Date(Date.now() + offsetDays * DAY);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export async function seedAcceptance(options: {
  apiUrl: string;
  webUrl: string;
  passwords: { admin: string; teacher: string; researcher: string };
}): Promise<StandData> {
  const { apiUrl } = options;
  const admin = await ApiClient.login(apiUrl, 'admin', options.passwords.admin);
  const teacher = await ApiClient.login(apiUrl, 'teacher', options.passwords.teacher);
  const researcher = await ApiClient.login(apiUrl, 'researcher', options.passwords.researcher);
  const studentPassword = `Приёмка-${randomBytes(6).toString('hex')}`;
  const me = await teacher.call<{ id: string }>('GET', '/auth/me');

  const discipline = await admin.call<{ id: string }>('POST', '/disciplines', {
    name: DISCIPLINE,
    code: 'МАТ',
  });
  const groups: StandGroup[] = [];
  for (const name of ['ПО-21', 'ПО-22']) {
    const group = await admin.call<{ id: string }>('POST', '/groups', {
      name,
      course: 2,
      specialty: 'Программное обеспечение',
    });
    await admin.call('POST', '/teacher-assignments', {
      teacherId: me.id,
      groupId: group.id,
      disciplineId: discipline.id,
    });
    groups.push({ id: group.id, name, students: [] });
  }
  const [experimental, control] = groups as [StandGroup, StandGroup];

  for (const [groupIndex, group] of groups.entries()) {
    for (let index = 0; index < STUDENTS_PER_GROUP; index += 1) {
      const lastName = LAST_NAMES[(index + groupIndex * 7) % LAST_NAMES.length]!;
      const firstName = FIRST_NAMES[index % FIRST_NAMES.length]!;
      const participantCode = `P-${groupIndex + 1}${String(index + 1).padStart(3, '0')}`;
      const created = await teacher.call<{
        student: { id: string };
        login: string;
        temporaryPassword: string;
      }>('POST', '/students', { lastName, firstName, groupId: group.id, participantCode });
      const temporary = await ApiClient.login(apiUrl, created.login, created.temporaryPassword);
      await temporary.call('POST', '/auth/change-password', {
        currentPassword: created.temporaryPassword,
        newPassword: studentPassword,
      });
      group.students.push({
        id: created.student.id,
        login: created.login,
        fullName: `${lastName} ${firstName}`,
        participantCode,
        trajectoryId: null,
      });
    }
  }

  const types = await teacher.call<{ id: string; code: string }[]>('GET', '/assignment-types');
  const practical = types.find((type) => type.code === 'practical') ?? types[0]!;
  const tasks: StandData['tasks'] = [];
  for (const title of TASK_TITLES) {
    const task = await teacher.call<{ id: string }>('POST', '/library-assignments', {
      title,
      disciplineId: discipline.id,
      topic: 'Уравнения',
      goal: 'Закрепить решение уравнений',
      difficulty: 'BASIC',
      typeId: practical.id,
      instruction: 'Решите задачи и запишите ход решения.',
      submissionFormats: ['TEXT', 'FILE'],
      criteria: [
        { title: 'Верность решения', maxScore: 60 },
        { title: 'Оформление', maxScore: 40 },
      ],
      attachments: [],
    });
    tasks.push({ id: task.id, title });
  }

  const questionnaires = await teacher.call<
    { id: string; title: string; isDemo: boolean; published: { id: string } | null }[]
  >('GET', '/questionnaires');
  const demo = questionnaires.find((item) => item.isDemo && item.published);
  if (!demo) throw new Error('В базовом сиде нет опубликованной демо-методики');
  const questionnaire = { id: demo.id, title: demo.title, versionId: demo.published!.id };

  // Первичная диагностика студентов 1–10 обеих групп: ввод бумажных бланков (FR-022).
  for (const group of groups) {
    for (const [index, student] of group.students.slice(0, 10).entries()) {
      await diagnose(teacher, questionnaire.id, student.id, 'PRIMARY', PATTERNS[index % 3]!);
    }
  }

  // Подтверждённый профиль: студенты 1–5 и 8 экспериментальной группы (FR-027, FR-029).
  for (const index of [0, 1, 2, 3, 4, 7]) {
    const proposal = await teacher.call<{ id: string; proposedLevel: string | null }>(
      'POST',
      `/students/${experimental.students[index]!.id}/motivation-profiles`,
      {},
    );
    await teacher.call('POST', `/motivation-profiles/${proposal.id}/decision`, {
      level: proposal.proposedLevel,
    });
  }

  // Исследование до ИОТ: контрольная группа не должна получить экспериментальную ИОТ (огр. 4).
  const research = await researcher.call<{ id: string }>('POST', '/research-projects', {
    title: RESEARCH_TITLE,
    description: 'Сравнение экспериментальной и контрольной групп (приёмочный стенд)',
    startsOn: isoDate(-30),
    endsOn: isoDate(150),
  });
  await researcher.call('POST', `/research-projects/${research.id}/participants`, {
    groupId: experimental.id,
    group: 'EXPERIMENTAL',
  });
  await researcher.call('POST', `/research-projects/${research.id}/participants`, {
    groupId: control.id,
    group: 'CONTROL',
  });
  await researcher.call('POST', `/research-projects/${research.id}/measurements`, {
    versionId: questionnaire.versionId,
    measurementType: 'PRIMARY',
    title: 'Входной замер',
    startsOn: isoDate(-30),
    endsOn: isoDate(30),
  });
  await researcher.call('POST', `/research-projects/${research.id}/status`, { status: 'ACTIVE' });

  // Утверждённая ИОТ: студенты 1–5 экспериментальной группы (FR-034, FR-039).
  for (const student of experimental.students.slice(0, 5)) {
    student.trajectoryId = await approvedTrajectory(teacher, student.id, discipline.id, tasks);
  }

  return {
    apiUrl,
    webUrl: options.webUrl,
    passwords: { ...options.passwords, students: studentPassword },
    discipline: { id: discipline.id, name: DISCIPLINE },
    experimental,
    control,
    tasks,
    questionnaire,
    research: { id: research.id, title: RESEARCH_TITLE },
  };
}

/** Назначение методики одному студенту и ввод ответов с бумажного бланка. */
export async function diagnose(
  teacher: ApiClient,
  questionnaireId: string,
  studentId: string,
  measurementType: 'PRIMARY' | 'REPEATED' | 'INTERMEDIATE',
  answers: Json,
): Promise<void> {
  const assignment = await teacher.call<{ sessions: { id: string }[] }>(
    'POST',
    '/diagnostic-assignments',
    {
      questionnaireId,
      studentId,
      measurementType,
      startsAt: new Date(Date.now() - 14 * DAY).toISOString(),
      endsAt: new Date(Date.now() + 14 * DAY).toISOString(),
    },
  );
  const sessionId = assignment.sessions[0]!.id;
  const form = await teacher.call<{ questions: FormQuestion[] }>(
    'GET',
    `/diagnostic-sessions/${sessionId}/form`,
  );
  await teacher.call('POST', `/diagnostic-sessions/${sessionId}/paper`, {
    answers: toFormAnswers(form.questions, answers),
    completedAt: new Date(Date.now() - DAY).toISOString(),
  });
}

interface FormQuestion {
  key: string;
  options: { key: string }[];
}

/**
 * Ответы из файла методики (`q1`, вариант `q5-o2`) → ключи формы прохождения (id вопросов и
 * вариантов). Форма отдаёт вопросы и варианты в порядке методики.
 */
function toFormAnswers(questions: FormQuestion[], answers: Json): Json {
  const option = (value: string) => {
    const [, question, index] = /^q(\d+)-o(\d+)$/.exec(value)!;
    return questions[Number(question) - 1]!.options[Number(index) - 1]!.key;
  };
  return Object.fromEntries(
    Object.entries(answers).map(([key, value]) => [
      questions[Number(key.slice(1)) - 1]!.key,
      typeof value === 'string' && value.startsWith(`${key}-o`)
        ? option(value)
        : Array.isArray(value)
          ? value.map((item: string) => option(item))
          : value,
    ]),
  );
}

/**
 * ИОТ из стандартного шаблона: пять этапов по месяцу, текущий — первый. В первом этапе два
 * задания, во втором — одно; у каждого этапа контрольная точка в последний день.
 */
async function approvedTrajectory(
  teacher: ApiClient,
  studentId: string,
  disciplineId: string,
  tasks: StandData['tasks'],
): Promise<string> {
  const options = await teacher.call<{ templates: { id: string; isStandard: boolean }[] }>(
    'GET',
    `/students/${studentId}/trajectory-options`,
  );
  const draft = await teacher.call<{
    id: string;
    updatedAt: string;
    stages: { id: string; title: string; goal: string }[];
  }>('POST', '/trajectories', {
    studentId,
    disciplineId,
    templateId: options.templates.find((template) => template.isStandard)!.id,
  });
  const stageTasks = [[tasks[0]!, tasks[1]!], [tasks[2]!], [], [], []];
  const filled = await teacher.call<{ updatedAt: string }>('PUT', `/trajectories/${draft.id}`, {
    updatedAt: draft.updatedAt,
    goals: TRAJECTORY_GOALS,
    plannedResults: 'Решает уравнения и текстовые задачи базового уровня',
    supportMethods: 'Консультации раз в неделю',
    startDate: isoDate(-10),
    plannedEndDate: isoDate(140),
    stages: draft.stages.map((stage, index) => {
      const start = isoDate(-10 + index * 30);
      const end = isoDate(19 + index * 30);
      return {
        id: stage.id,
        title: stage.title,
        goal: stage.goal,
        startDate: start,
        endDate: end,
        checkpoints: [{ title: `Контрольная точка этапа ${index + 1}`, dueDate: end }],
        materialIds: [],
        assignments: stageTasks[index]!.map((task) => ({
          assignmentId: task.id,
          dueAt: new Date(`${end}T23:59:59`).toISOString(),
        })),
      };
    }),
  });
  await teacher.call('POST', `/trajectories/${draft.id}/approve`, { updatedAt: filled.updatedAt });
  return draft.id;
}
