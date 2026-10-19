/**
 * Данные для нагрузочного теста (NFR-001, NFR-002): объём пилота — две группы по 25 студентов,
 * у каждого утверждённая ИОТ с заданиями, диагностика и отправленный ответ. Всё создаётся через
 * API (те же проверки, что у пользователей). Только для отдельной базы нагрузочного теста,
 * не для рабочей. Порядок запуска — docs/testing/load.md.
 *
 * Переменные: LOAD_API_URL (по умолчанию http://localhost:3000), SEED_ADMIN_PASSWORD,
 * SEED_TEACHER_PASSWORD (из .env), LOAD_ACCOUNTS_FILE — куда записать учётные записи для k6.
 */
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnv } from '../../src/config/load-env.js';
import { loadDefinitions } from '../../src/diagnostics/questionnaire-definitions.js';

loadEnv();

const API = process.env.LOAD_API_URL ?? 'http://localhost:3000';
const OUTPUT = resolve(
  process.env.LOAD_ACCOUNTS_FILE ?? resolve(import.meta.dirname, 'accounts.local.json'),
);
const GROUPS = 2;
const STUDENTS_PER_GROUP = 25;
const tag = randomBytes(2).toString('hex').toUpperCase();

type Json = Record<string, unknown>;

async function call<T = Json>(
  token: string | null,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${API}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': `load-${randomBytes(8).toString('hex')}`,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return (res.status === 204 ? {} : await res.json()) as T;
}

async function login(loginName: string, password: string): Promise<string> {
  const session = await call<{ accessToken: string }>(null, 'POST', '/auth/login', {
    login: loginName,
    password,
  });
  return session.accessToken;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Задайте ${name} (пароль учётной записи из сида)`);
  return value;
}

async function main(): Promise<void> {
  const admin = await login('admin', requireEnv('SEED_ADMIN_PASSWORD'));
  const teacherPassword = requireEnv('SEED_TEACHER_PASSWORD');
  const teacher = await login('teacher', teacherPassword);
  const me = await call<{ id: string }>(teacher, 'GET', '/auth/me');

  const discipline = await call<{ id: string }>(admin, 'POST', '/disciplines', {
    name: `Нагрузка ${tag}`,
  });
  const groupIds: string[] = [];
  for (let index = 0; index < GROUPS; index += 1) {
    const group = await call<{ id: string }>(admin, 'POST', '/groups', {
      name: `НТ-${tag}-${index + 1}`,
      course: 2,
      specialty: 'Программное обеспечение',
    });
    await call(admin, 'POST', '/teacher-assignments', {
      teacherId: me.id,
      groupId: group.id,
      disciplineId: discipline.id,
    });
    groupIds.push(group.id);
  }

  const types = await call<{ id: string }[]>(teacher, 'GET', '/assignment-types');
  const tasks: string[] = [];
  for (const title of ['Задача 1', 'Задача 2', 'Задача 3']) {
    const task = await call<{ id: string }>(teacher, 'POST', '/library-assignments', {
      title: `${title} ${tag}`,
      disciplineId: discipline.id,
      difficulty: 'BASIC',
      typeId: types[0]!.id,
      instruction: 'Выполните задание',
      submissionFormats: ['TEXT'],
      criteria: [{ title: 'Верность', maxScore: 5 }],
      attachments: [],
    });
    tasks.push(task.id);
  }

  const demo = loadDefinitions().find((definition) => definition.slug === 'demo-motivation')!;
  const questionnaire = await call<{ id: string; versions: { id: string }[] }>(
    teacher,
    'POST',
    '/questionnaires',
    { content: { ...structuredClone(demo.content), title: `Методика нагрузки ${tag}` } },
  );
  await call(
    teacher,
    'POST',
    `/questionnaires/${questionnaire.id}/versions/${questionnaire.versions[0]!.id}/publish`,
  );

  const students: { login: string; password: string }[] = [];
  const studentIds: string[] = [];
  for (const groupId of groupIds) {
    for (let index = 0; index < STUDENTS_PER_GROUP; index += 1) {
      const created = await call<{
        student: { id: string };
        login: string;
        temporaryPassword: string;
      }>(teacher, 'POST', '/students', {
        lastName: `Нагрузочный${index + 1}`,
        firstName: 'Студент',
        groupId,
      });
      const password = `Нагрузка-${randomBytes(6).toString('hex')}`;
      const temporary = await login(created.login, created.temporaryPassword);
      await call(temporary, 'POST', '/auth/change-password', {
        currentPassword: created.temporaryPassword,
        newPassword: password,
      });
      students.push({ login: created.login, password });
      studentIds.push(created.student.id);
      await trajectoryFor(teacher, created.student.id, discipline.id, tasks);
    }

    const diagnostic = await call<{ sessions: { id: string }[] }>(
      teacher,
      'POST',
      '/diagnostic-assignments',
      {
        questionnaireId: questionnaire.id,
        groupId,
        measurementType: 'PRIMARY',
        startsAt: new Date(Date.now() - 10 * 86_400_000).toISOString(),
        endsAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      },
    );
    for (const session of diagnostic.sessions) {
      const form = await call<{ questions: Question[] }>(
        teacher,
        'GET',
        `/diagnostic-sessions/${session.id}/form`,
      );
      await call(teacher, 'POST', `/diagnostic-sessions/${session.id}/paper`, {
        answers: answersFor(form.questions),
        completedAt: new Date(Date.now() - 86_400_000).toISOString(),
      });
    }
  }

  // Каждый студент отправляет ответ на первое задание: у преподавателя появляется очередь проверки.
  for (const student of students) {
    const token = await login(student.login, student.password);
    const cabinet = await call<{ items: { id: string }[] }>(token, 'GET', '/cabinet/assignments');
    const first = cabinet.items[0];
    if (!first) continue;
    await call(token, 'POST', `/cabinet/assignments/${first.id}/start`, {});
    await call(token, 'POST', `/cabinet/assignments/${first.id}/submissions`, { text: 'Ответ' });
  }

  writeFileSync(
    OUTPUT,
    JSON.stringify(
      {
        teacher: { login: 'teacher', password: teacherPassword },
        students,
        groupIds,
        disciplineId: discipline.id,
        studentIds,
      },
      null,
      2,
    ),
  );
  console.log(`Готово: ${students.length} студентов. Учётные записи для k6 — ${OUTPUT}`);
}

interface Question {
  key: string;
  type: string;
  options: { key: string }[];
  minValue?: number | null;
}

function answersFor(questions: Question[]): Record<string, unknown> {
  return Object.fromEntries(
    questions.map((question) => [
      question.key,
      question.type === 'SINGLE_CHOICE'
        ? question.options[0]!.key
        : question.type === 'MULTIPLE_CHOICE'
          ? [question.options[0]!.key]
          : question.type === 'SHORT_TEXT'
            ? 'ответ'
            : (question.minValue ?? 1),
    ]),
  );
}

async function trajectoryFor(
  teacher: string,
  studentId: string,
  disciplineId: string,
  tasks: string[],
): Promise<void> {
  const options = await call<{ templates: { id: string; isStandard: boolean }[] }>(
    teacher,
    'GET',
    `/students/${studentId}/trajectory-options`,
  );
  const draft = await call<{
    id: string;
    updatedAt: string;
    stages: { id: string; title: string; goal: string }[];
  }>(teacher, 'POST', '/trajectories', {
    studentId,
    disciplineId,
    templateId: options.templates.find((template) => template.isStandard)!.id,
  });
  const year = new Date().getFullYear();
  const filled = await call<{ updatedAt: string }>(teacher, 'PUT', `/trajectories/${draft.id}`, {
    updatedAt: draft.updatedAt,
    goals: 'Освоить дисциплину',
    startDate: `${year}-09-01`,
    plannedEndDate: `${year + 1}-01-31`,
    stages: draft.stages.map((stage, index) => {
      const month = ['09', '10', '11', '12', '01'][index]!;
      const stageYear = index === 4 ? year + 1 : year;
      const end = `${stageYear}-${month}-28`;
      return {
        id: stage.id,
        title: stage.title,
        goal: stage.goal,
        startDate: `${stageYear}-${month}-01`,
        endDate: end,
        checkpoints: [{ title: `Контрольная точка ${index + 1}`, dueDate: end }],
        materialIds: [],
        assignments:
          index < tasks.length
            ? [{ assignmentId: tasks[index]!, dueAt: new Date(`${end}T23:59:59`).toISOString() }]
            : [],
      };
    }),
  });
  await call(teacher, 'POST', `/trajectories/${draft.id}/approve`, {
    updatedAt: filled.updatedAt,
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
