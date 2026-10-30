import { randomBytes, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  type AnswerValue,
  type CurrentUser,
  type DifficultyLevel,
  DemoStage,
  type MeasurementType,
  type MotivationLevel,
  type MotivationProfileStatus,
  Permission,
  RoleCode,
  STANDARD_TRAJECTORY_STAGES,
  scoreQuestionnaire,
} from '@iot/shared';
import { hashPassword } from '../auth/passwords.js';
import { readContent, versionContentInclude } from '../diagnostics/questionnaire-content.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MotivationProfilesService } from '../profiles/motivation-profiles.service.js';
import { toSnapshot, TrajectoriesService } from '../trajectories/trajectories.service.js';
import { answersForLevel, type Disposition, levelFor } from './demo-answers.js';
import {
  ACADEMIC_YEAR,
  ASSESSMENT_COMMENTS,
  PROFILE_STUDENT_SUMMARIES,
  CONSULTATION_NOTES,
  CONSULTATION_SUMMARIES,
  CONSULTATION_TOPICS,
  CONTROL_GROUP,
  DEMO_FRESH_DIAGNOSTICS,
  CORRECTION_REASONS,
  CONTROL_DISCIPLINE,
  DEMO_ASSIGNMENTS,
  DEMO_CONTROL_WORKS,
  DEMO_DISCIPLINES,
  DEMO_FINAL_CONTROL_WORK,
  DEMO_TEACHER_LOGINS,
  DEMO_MATERIALS,
  DEMO_PERIOD,
  DEMO_TEACHER_PASSWORD,
  type DemoControlWork,
  type DemoTeacher,
  EXPERIMENTAL_GROUP,
  FINAL_ASSESSMENTS,
  OBSERVATION_NOTES,
  REFLECTION_ACHIEVEMENTS,
  REFLECTION_DIFFICULTIES,
  REFLECTION_NEXT_STEPS,
  RETURN_COMMENTS,
  ROUTE_PROPOSALS,
  STUDENT_DIFFICULTIES,
  STUDENT_QUESTIONS,
  SUBMISSION_TEXTS,
  TEACHER_COMMENTS,
  TEACHER_GOALS,
  TEACHER_RECOMMENDATIONS,
  TEACHER_REPLIES,
  TRAJECTORY_DISCIPLINES,
} from './demo-catalog.js';
import {
  between,
  chance,
  clamp,
  intBetween,
  noise,
  pick,
  type Random,
  shuffle,
} from './demo-random.js';
import { addDays, at, day, daysBetween, laterOf, weekday, workday, workTime } from './demo-time.js';

type Tx = Prisma.TransactionClient;

/** Состояние генерации, сохраняемое в копии между первичным и повторным замером. */
export interface DemoState {
  stage: DemoStage;
  projectId: string | null;
  dispositions: Record<string, Disposition>;
  /** Прирост внутренней мотивации за время ИОТ (экспериментальная группа). */
  growth: Record<string, number>;
  /** Отстающие по веб-дизайну: входной контроль ниже 70 баллов (в состояниях до 1.28.5 нет). */
  lagging?: string[];
  curatorId: string;
}

export const DEMO_STATE_KEY = 'demo.state';
export const DEMO_RESEARCH_TITLE =
  'Влияние индивидуальных образовательных траекторий на учебную мотивацию студентов I курса';

/** Этапы ИОТ: даты начала и окончания (зимние каникулы между вторым и третьим этапами). */
const STAGE_DATES: [string, string][] = [
  ['2025-10-27', '2025-11-23'],
  ['2025-11-24', '2025-12-26'],
  ['2026-01-12', '2026-02-15'],
  ['2026-02-16', '2026-03-22'],
  ['2026-03-23', DEMO_PERIOD.trajectoriesEnd],
];
const LESSON_TIMES = { experimental: '08:30', control: '10:10' };
/** Дни занятий: вторник и четверг. */
const LESSON_WEEKDAYS = [2, 4];
const TIMELINE_START = '2025-08-25';

interface StudentInfo {
  id: string;
  userId: string | null;
  groupId: string;
  experimental: boolean;
}

interface VersionInfo {
  id: string;
  questionnaireId: string;
  title: string;
  content: ReturnType<typeof readContent>;
}

interface DisciplineInfo {
  id: string;
  name: string;
  teacherId: string;
}

interface LibraryAssignment {
  id: string;
  title: string;
  stage: number | null;
  difficulty: DifficultyLevel;
  criteria: { id: string; maxScore: number }[];
}

interface Context {
  random: Random;
  students: StudentInfo[];
  groups: { experimental: string; control: string };
  versions: VersionInfo[];
  state: DemoState;
  adminId: string | null;
  researcherId: string | null;
  audit: Prisma.AuditLogCreateManyInput[];
  notifications: Prisma.NotificationCreateManyInput[];
}

/**
 * Генератор демонстрационной активности за период исследования (октябрь 2025 — апрель 2026):
 * преподаватели и дисциплины, расписание с журналом наблюдений, первичная диагностика и
 * профили, исследование ЭГ/КГ, ИОТ экспериментальной группы с заданиями и проверкой,
 * обратная связь, консультации, оценки за семестры, входной и текущий контроль; отдельно —
 * повторный замер с итоговым контролем.
 * Работает с базой, выбранной `databaseRouter` (копией); расчёт баллов и предложение профиля —
 * теми же функциями, что и в приложении, поэтому уровни следуют правилам методик.
 */
@Injectable()
export class DemoActivityGenerator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: MotivationProfilesService,
    private readonly trajectories: TrajectoriesService,
  ) {}

  async readState(): Promise<DemoState | null> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key: DEMO_STATE_KEY } });
    return row ? (row.value as unknown as DemoState) : null;
  }

  /** Первичный замер и весь учебный период до окончания ИОТ. */
  async generatePrimary(random: Random, report: (step: string) => void): Promise<void> {
    const ctx = await this.context(random, null);
    report('Перенос существующих данных на период исследования');
    await this.rebaseTimeline(ctx);
    await this.resetDiagnostics(ctx);
    report('Преподаватели и дисциплины');
    const disciplines = await this.teachersAndDisciplines(ctx);
    report('Библиотека заданий и материалов');
    const library = await this.library(ctx, disciplines);
    report('Первичная диагностика');
    const primary = await this.diagnostics(ctx, 'PRIMARY');
    report('Мотивационные профили');
    await this.motivationProfiles(ctx, DEMO_PERIOD.profilesOn, true);
    report('Исследование ЭГ и КГ');
    await this.research(ctx, primary);
    report('Индивидуальные траектории и задания');
    await this.trajectoriesFor(ctx, disciplines, library);
    report('Расписание и журнал наблюдений');
    await this.lessons(ctx, disciplines);
    report('Обращения, консультации и наблюдения');
    await this.controlGroupSupport(ctx, disciplines);
    await this.observations(ctx, disciplines);
    report('Оценки за семестры');
    await this.grades(ctx, disciplines);
    report('Входной и текущий контроль');
    const controls = disciplines.get(CONTROL_DISCIPLINE);
    if (controls) {
      for (const work of DEMO_CONTROL_WORKS) {
        await this.controlWork(ctx, controls.id, controls.teacherId, work);
      }
    }
    report('Завершение');
    await this.finish(ctx, DemoStage.PRIMARY);
  }

  /** Повторный замер после завершения ИОТ: мотивация ЭГ выросла, КГ почти без изменений. */
  async generateRepeated(random: Random, report: (step: string) => void): Promise<void> {
    const state = await this.readState();
    if (!state || state.stage !== DemoStage.PRIMARY) {
      throw new Error('Сначала подготовьте демо-данные с первичным замером');
    }
    const ctx = await this.context(random, state);
    for (const student of ctx.students) {
      const before = ctx.state.dispositions[student.id];
      if (!before) continue;
      const delta = student.experimental
        ? (ctx.state.growth[student.id] ?? 0.2)
        : between(random, -0.04, 0.06);
      ctx.state.dispositions[student.id] = {
        INTRINSIC: clamp(before.INTRINSIC + delta, 0.05, 0.97),
        EXTRINSIC: clamp(before.EXTRINSIC + (student.experimental ? -0.05 : 0.01), 0.05, 0.95),
        REFERENCE: clamp(before.REFERENCE + delta / 2, 0.05, 0.95),
      };
    }
    report('Повторная диагностика');
    const repeated = await this.diagnostics(ctx, 'REPEATED');
    report('Мотивационные профили по повторному замеру');
    await this.motivationProfiles(ctx, DEMO_PERIOD.researchTo, false);
    report('Замеры исследования');
    if (ctx.state.projectId) {
      await this.measurements(ctx, ctx.state.projectId, repeated, 'REPEATED');
      await this.prisma.researchProject.update({
        where: { id: ctx.state.projectId },
        data: { status: 'COMPLETED', updatedAt: at(DEMO_PERIOD.researchTo, '17:00') },
      });
      this.audit(
        ctx,
        'research_project.status_changed',
        'research_project',
        ctx.state.projectId,
        ctx.researcherId,
        at(DEMO_PERIOD.researchTo, '17:00'),
        {
          status: 'COMPLETED',
        },
      );
    }
    report('Итоговый контроль');
    // Итоговая работа — та же, что входная: дисциплина и автор берутся из входной работы.
    const entry = await this.prisma.controlWork.findFirst({
      where: {
        kind: 'ENTRY',
        topic: DEMO_FINAL_CONTROL_WORK.topic,
        discipline: { name: CONTROL_DISCIPLINE },
      },
    });
    if (entry?.createdById) {
      await this.controlWork(ctx, entry.disciplineId, entry.createdById, DEMO_FINAL_CONTROL_WORK);
    }
    report('Завершение');
    await this.finish(ctx, DemoStage.REPEATED);
  }

  // ── Контекст ──

  private async context(random: Random, state: DemoState | null): Promise<Context> {
    const groups = await this.prisma.group.findMany({
      where: { name: { in: [EXPERIMENTAL_GROUP, CONTROL_GROUP] } },
      select: { id: true, name: true },
    });
    const experimental = groups.find((group) => group.name === EXPERIMENTAL_GROUP);
    const control = groups.find((group) => group.name === CONTROL_GROUP);
    if (!experimental || !control) {
      throw new Error(`Не найдены группы «${EXPERIMENTAL_GROUP}» и «${CONTROL_GROUP}»`);
    }
    const students = await this.prisma.student.findMany({
      where: { currentGroupId: { in: [experimental.id, control.id] }, archivedAt: null },
      select: { id: true, userId: true, currentGroupId: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    if (students.length === 0) throw new Error('В группах исследования нет студентов');

    const published = await this.prisma.questionnaireVersion.findMany({
      where: { status: 'PUBLISHED', questionnaire: { status: 'ACTIVE' } },
      include: { ...versionContentInclude, questionnaire: { select: { isDemo: true } } },
      orderBy: { versionNumber: 'desc' },
    });
    const real = published.filter((version) => !version.questionnaire.isDemo);
    const chosen = new Map<string, (typeof published)[number]>();
    for (const version of real.length > 0 ? real : published) {
      if (!chosen.has(version.questionnaireId)) chosen.set(version.questionnaireId, version);
    }
    if (chosen.size === 0) throw new Error('Нет опубликованных методик диагностики');

    const roleUsers = async (code: string) =>
      (
        await this.prisma.user.findMany({
          where: { status: 'ACTIVE', roles: { some: { role: { code } } } },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        })
      ).map((user) => user.id);
    const [admins, researchers] = await Promise.all([
      roleUsers(RoleCode.ADMIN),
      roleUsers(RoleCode.RESEARCHER),
    ]);

    const ctx: Context = {
      random,
      students: students.map((student) => ({
        id: student.id,
        userId: student.userId,
        groupId: student.currentGroupId!,
        experimental: student.currentGroupId === experimental.id,
      })),
      groups: { experimental: experimental.id, control: control.id },
      versions: [...chosen.values()].map((version) => ({
        id: version.id,
        questionnaireId: version.questionnaireId,
        title: version.title,
        content: readContent(version),
      })),
      state: state ?? {
        stage: DemoStage.NONE,
        projectId: null,
        dispositions: {},
        growth: {},
        lagging: [],
        curatorId: '',
      },
      adminId: admins[0] ?? null,
      researcherId: researchers[0] ?? admins[0] ?? null,
      audit: [],
      notifications: [],
    };
    if (!state) await this.initDispositions(ctx);
    return ctx;
  }

  /**
   * Склонность к внутренней мотивации: по уже принятому решению о профиле, иначе — случайно
   * (примерно 25 % высокий, 50 % средний, 25 % низкий уровень).
   */
  private async initDispositions(ctx: Context): Promise<void> {
    const decided = await this.prisma.student.findMany({
      where: { id: { in: ctx.students.map((student) => student.id) } },
      select: {
        id: true,
        currentMotivationProfile: { select: { level: true, proposedLevel: true } },
      },
    });
    const known = new Map(
      decided.map((row) => [
        row.id,
        row.currentMotivationProfile?.level ?? row.currentMotivationProfile?.proposedLevel ?? null,
      ]),
    );
    for (const student of ctx.students) {
      const { random } = ctx;
      const draw = random();
      const level: MotivationLevel =
        known.get(student.id) ?? (draw < 0.25 ? 'HIGH' : draw < 0.75 ? 'MEDIUM' : 'LOW');
      const intrinsic =
        level === 'HIGH'
          ? between(random, 0.8, 0.95)
          : level === 'MEDIUM'
            ? between(random, 0.46, 0.62)
            : between(random, 0.12, 0.3);
      ctx.state.dispositions[student.id] = {
        INTRINSIC: intrinsic,
        EXTRINSIC: between(random, 0.3, 0.8),
        REFERENCE: clamp(intrinsic * 0.6 + between(random, 0, 0.4), 0, 1),
      };
      if (student.experimental) ctx.state.growth[student.id] = between(random, 0.15, 0.3);
    }
    // Отстающие — самые слабо мотивированные: по одному в каждой группе, иногда ещё один.
    const intrinsic = (id: string) => ctx.state.dispositions[id]!.INTRINSIC;
    const weakest = [...ctx.students].sort((a, b) => intrinsic(a.id) - intrinsic(b.id));
    const lagging = [true, false].flatMap((experimental) =>
      weakest.filter((student) => student.experimental === experimental).slice(0, 1),
    );
    if (chance(ctx.random, 0.5)) {
      const extra = weakest.find((student) => !lagging.includes(student));
      if (extra) lagging.push(extra);
    }
    ctx.state.lagging = lagging.map((student) => student.id);
  }

  // ── Перенос существующих данных ──

  /**
   * Прохождения, профили и индивидуальные назначения диагностики студентов из
   * `DEMO_FRESH_DIAGNOSTICS` удаляются в копии: первичный замер создаёт им новые прохождения.
   * Триггеры (и действия внешних ключей) отключены, поэтому ссылки снимаются явно.
   */
  private async resetDiagnostics(ctx: Context): Promise<void> {
    const studentIds = (
      await this.prisma.student.findMany({
        where: {
          participantCode: { in: DEMO_FRESH_DIAGNOSTICS },
          id: { in: ctx.students.map((student) => student.id) },
        },
        select: { id: true },
      })
    ).map((student) => student.id);
    if (studentIds.length === 0) return;
    const ofStudents = { studentId: { in: studentIds } };
    await this.withoutTriggers(async (tx) => {
      await tx.student.updateMany({
        where: { id: { in: studentIds } },
        data: { currentMotivationProfileId: null },
      });
      await tx.trajectory.updateMany({
        where: { motivationProfile: ofStudents },
        data: { motivationProfileId: null },
      });
      await tx.motivationProfileSource.deleteMany({ where: { profile: ofStudents } });
      await tx.motivationProfileHistory.deleteMany({ where: { profile: ofStudents } });
      await tx.motivationProfile.deleteMany({ where: ofStudents });
      await tx.diagnosticScore.deleteMany({ where: { session: ofStudents } });
      await tx.diagnosticAnswer.deleteMany({ where: { session: ofStudents } });
      await tx.diagnosticRevision.deleteMany({ where: { session: ofStudents } });
      await tx.diagnosticSession.deleteMany({ where: ofStudents });
      await tx.diagnosticAssignment.deleteMany({ where: ofStudents });
    });
  }

  /**
   * Учётные записи, группы, студенты и методики созданы в рабочей базе позже периода
   * исследования; в копии их даты переносятся на начало учебного года.
   */
  private async rebaseTimeline(ctx: Context): Promise<void> {
    const base = at(TIMELINE_START, '10:00');
    const later = { gt: base };
    const groupIds = [ctx.groups.experimental, ctx.groups.control];
    await this.withoutTriggers(async (tx) => {
      await tx.user.updateMany({ where: { createdAt: later }, data: { createdAt: base } });
      await tx.group.updateMany({ where: { id: { in: groupIds } }, data: { createdAt: base } });
      await tx.discipline.updateMany({ where: { createdAt: later }, data: { createdAt: base } });
      await tx.student.updateMany({
        where: { currentGroupId: { in: groupIds } },
        data: { createdAt: base },
      });
      await tx.enrollment.updateMany({
        where: { groupId: { in: groupIds }, startsAt: later },
        data: { startsAt: base, createdAt: base },
      });
      await tx.teacherAssignment.updateMany({
        where: { startsAt: later },
        data: { startsAt: base, createdAt: base },
      });
      await tx.questionnaire.updateMany({ where: { createdAt: later }, data: { createdAt: base } });
      await tx.questionnaireVersion.updateMany({
        where: { createdAt: later },
        data: { createdAt: base, publishedAt: base },
      });
      await tx.observationCriterion.updateMany({ data: { createdAt: base } });
    });
  }

  // ── Преподаватели, дисциплины, библиотека ──

  private async teachersAndDisciplines(ctx: Context): Promise<Map<string, DisciplineInfo>> {
    const teacherRole = await this.prisma.role.findUniqueOrThrow({
      where: { code: RoleCode.TEACHER },
    });
    const existingTeachers = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        roles: { some: { roleId: teacherRole.id } },
        login: { notIn: DEMO_TEACHER_LOGINS },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        login: true,
        roles: { select: { role: { select: { code: true } } } },
      },
    });
    const passwordHash = await hashPassword(DEMO_TEACHER_PASSWORD);
    const created = at(TIMELINE_START, '11:00');

    const result = new Map<string, DisciplineInfo>();
    for (const item of DEMO_DISCIPLINES) {
      const { teacher } = item;
      const teacherId =
        'login' in teacher
          ? await this.demoTeacher(ctx, teacher, teacherRole.id, passwordHash, created)
          : // Преподаватель из рабочей базы; если его нет — первый существующий преподаватель.
            (
              existingTeachers.find((user) => user.login === teacher.existingLogin) ??
              existingTeachers[0]
            )?.id;
      if (!teacherId) continue;
      const discipline =
        (await this.prisma.discipline.findUnique({ where: { name: item.name } })) ??
        (await this.prisma.discipline.create({
          data: {
            name: item.name,
            code: (await this.prisma.discipline.findUnique({ where: { code: item.code } }))
              ? null
              : item.code,
            description: item.description,
            createdById: ctx.adminId,
            createdAt: created,
          },
        }));
      result.set(item.name, { id: discipline.id, name: item.name, teacherId });
    }

    // Существующие преподаватели без роли администратора закрепляются за всеми дисциплинами,
    // чтобы видеть данные групп. Администратору закрепления не нужны: ему доступны все группы,
    // а в списках дисциплин он остаётся только у своей.
    const assistants = existingTeachers
      .filter((user) => !user.roles.some(({ role }) => role.code === RoleCode.ADMIN))
      .map((user) => user.id);
    const pairs: Prisma.TeacherAssignmentCreateManyInput[] = [];
    for (const groupId of [ctx.groups.experimental, ctx.groups.control]) {
      for (const discipline of result.values()) {
        for (const teacherId of new Set([discipline.teacherId, ...assistants])) {
          pairs.push({
            teacherId,
            groupId,
            disciplineId: discipline.id,
            startsAt: at(TIMELINE_START, '12:00'),
            createdById: ctx.adminId,
            createdAt: at(TIMELINE_START, '12:00'),
          });
        }
      }
    }
    const current = await this.prisma.teacherAssignment.findMany({
      where: { endsAt: null },
      select: { teacherId: true, groupId: true, disciplineId: true },
    });
    const has = new Set(
      current.map((row) => `${row.teacherId}:${row.groupId}:${row.disciplineId}`),
    );
    await this.prisma.teacherAssignment.createMany({
      data: pairs.filter((row) => !has.has(`${row.teacherId}:${row.groupId}:${row.disciplineId}`)),
    });
    // Решения по профилям принимает преподаватель-исследователь: существующая учётная запись
    // преподавателя, а если её нет — преподаватель математики.
    ctx.state.curatorId = existingTeachers[0]?.id ?? result.get('Математика')!.teacherId;
    return result;
  }

  /** Учётная запись сгенерированного преподавателя (создаётся при первой подготовке). */
  private async demoTeacher(
    ctx: Context,
    teacher: DemoTeacher,
    roleId: string,
    passwordHash: string,
    created: Date,
  ): Promise<string> {
    const user =
      (await this.prisma.user.findUnique({ where: { login: teacher.login } })) ??
      (await this.prisma.user.create({
        data: {
          ...teacher,
          passwordHash,
          createdById: ctx.adminId,
          createdAt: created,
          passwordChangedAt: created,
          roles: { create: { roleId, grantedById: ctx.adminId, grantedAt: created } },
        },
      }));
    return user.id;
  }

  private async library(
    ctx: Context,
    disciplines: Map<string, DisciplineInfo>,
  ): Promise<{
    assignments: Map<string, LibraryAssignment[]>;
    materials: Map<string, { id: string; topic: string }[]>;
  }> {
    const types = new Map(
      (await this.prisma.assignmentType.findMany()).map((type) => [type.code, type.id]),
    );
    const assignments = new Map<string, LibraryAssignment[]>();
    for (const [name, items] of Object.entries(DEMO_ASSIGNMENTS)) {
      const discipline = disciplines.get(name)!;
      const list: LibraryAssignment[] = [];
      for (const [index, item] of items.entries()) {
        const createdAt = at(addDays('2025-09-15', index), '16:00');
        const row = await this.prisma.assignment.create({
          data: {
            title: item.title,
            disciplineId: discipline.id,
            topic: item.topic,
            goal: item.goal,
            difficulty: item.difficulty,
            typeId: types.get(item.type) ?? [...types.values()][0]!,
            instruction: item.instruction,
            submissionFormats: item.formats,
            maxScore: item.criteria.reduce((sum, criterion) => sum + criterion.maxScore, 0),
            createdById: discipline.teacherId,
            createdAt,
            updatedAt: createdAt,
            criteria: {
              create: item.criteria.map((criterion, sortOrder) => ({ ...criterion, sortOrder })),
            },
          },
          include: { criteria: { orderBy: { sortOrder: 'asc' } } },
        });
        list.push({
          id: row.id,
          title: row.title,
          stage: item.stage,
          difficulty: item.difficulty,
          criteria: row.criteria.map((criterion) => ({
            id: criterion.id,
            maxScore: Number(criterion.maxScore),
          })),
        });
        this.audit(
          ctx,
          'assignment.created',
          'assignment',
          row.id,
          discipline.teacherId,
          createdAt,
        );
      }
      assignments.set(name, list);
    }

    const materials = new Map<string, { id: string; topic: string }[]>();
    for (const [index, [name, title, topic, url, body]] of DEMO_MATERIALS.entries()) {
      const discipline = disciplines.get(name)!;
      const createdAt = at(addDays('2025-09-10', index), '15:00');
      const row = await this.prisma.material.create({
        data: {
          title,
          description: body,
          kind: url ? 'LINK' : 'TEXT',
          url,
          body: url ? null : body,
          disciplineId: discipline.id,
          topic,
          createdById: discipline.teacherId,
          createdAt,
          updatedAt: createdAt,
        },
      });
      materials.set(name, [...(materials.get(name) ?? []), { id: row.id, topic }]);
    }
    return { assignments, materials };
  }

  // ── Диагностика ──

  /**
   * Замер по каждой методике для обеих групп. Существующие завершённые прохождения
   * первичного замера переносятся в окно замера, незавершённые — завершаются.
   * Возвращает назначения по версиям методик (для привязки к замерам исследования).
   */
  private async diagnostics(
    ctx: Context,
    measurementType: MeasurementType,
  ): Promise<Map<string, string[]>> {
    const primary = measurementType === 'PRIMARY';
    const from = primary ? DEMO_PERIOD.primaryFrom : DEMO_PERIOD.repeatedFrom;
    const to = primary ? DEMO_PERIOD.primaryTo : DEMO_PERIOD.repeatedTo;
    const window = { startsAt: at(from, '08:00'), endsAt: at(to, '18:00') };
    const createdAt = at(addDays(from, -3), '15:00');
    // В повторном замере один студент контрольной группы не успевает пройти диагностику:
    // такие пропуски аналитика показывает отдельно (FR-073).
    const missed = primary
      ? null
      : pick(
          ctx.random,
          ctx.students.filter((student) => !student.experimental),
        ).id;
    const result = new Map<string, string[]>();

    for (const version of ctx.versions) {
      for (const groupId of [ctx.groups.experimental, ctx.groups.control]) {
        let assignment = primary
          ? await this.prisma.diagnosticAssignment.findFirst({
              where: { versionId: version.id, groupId, cancelledAt: null, measurementType },
              orderBy: { createdAt: 'asc' },
            })
          : null;
        assignment = assignment
          ? await this.prisma.diagnosticAssignment.update({
              where: { id: assignment.id },
              data: { ...window, createdAt },
            })
          : await this.prisma.diagnosticAssignment.create({
              data: {
                versionId: version.id,
                groupId,
                measurementType,
                ...window,
                assignedById: ctx.state.curatorId,
                createdAt,
              },
            });
        result.set(version.id, [...(result.get(version.id) ?? []), assignment.id]);

        for (const student of ctx.students.filter((item) => item.groupId === groupId)) {
          const completedAt = workTime(
            addDays(from, intBetween(ctx.random, 0, daysBetween(from, to))),
            ctx.random,
          );
          if (student.userId) {
            ctx.notifications.push({
              userId: student.userId,
              type: 'diagnostic.assigned',
              title: 'Назначена диагностика',
              body: version.title,
              link: '/student/diagnostics',
              createdAt,
              readAt: at(from, '08:30'),
            });
          }
          if (student.id === missed) {
            await this.prisma.diagnosticSession.create({
              data: {
                assignmentId: assignment.id,
                studentId: student.id,
                versionId: version.id,
                status: 'EXPIRED',
                measurementType,
                createdAt,
                updatedAt: window.endsAt,
              },
            });
            continue;
          }
          const sessions = await this.prisma.diagnosticSession.findMany({
            where: { studentId: student.id, versionId: version.id },
            orderBy: { createdAt: 'asc' },
          });
          const done = primary ? sessions.find((item) => item.status === 'COMPLETED') : undefined;
          let sessionId = done?.id;
          if (done) {
            await this.shiftSession(done.id, completedAt, measurementType);
          } else {
            const open =
              (primary
                ? sessions.find((item) =>
                    ['ASSIGNED', 'IN_PROGRESS', 'EXPIRED'].includes(item.status),
                  )
                : undefined) ??
              (await this.prisma.diagnosticSession.create({
                data: {
                  assignmentId: assignment.id,
                  studentId: student.id,
                  versionId: version.id,
                  measurementType,
                  createdAt,
                },
              }));
            sessionId = open.id;
            await this.completeSession(
              ctx,
              student,
              version,
              open.id,
              completedAt,
              measurementType,
            );
          }
          if (primary) {
            // Прочие завершённые прохождения методики в рабочей базе (прежние версии, повторные
            // попытки) уходят в историю до замера: профиль берёт последнее прохождение методики.
            const earlier = await this.prisma.diagnosticSession.findMany({
              where: {
                studentId: student.id,
                status: 'COMPLETED',
                id: { not: sessionId },
                version: { questionnaireId: version.questionnaireId },
              },
              orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
            });
            for (const [index, item] of earlier.entries()) {
              await this.shiftSession(
                item.id,
                new Date(completedAt.getTime() - (index + 1) * 24 * 3600 * 1000),
                item.measurementType,
              );
            }
          }
          // Прочие незавершённые прохождения той же методики в копии не нужны.
          await this.prisma.diagnosticSession.updateMany({
            where: {
              studentId: student.id,
              versionId: version.id,
              status: { in: ['ASSIGNED', 'IN_PROGRESS'] },
            },
            data: { status: 'CANCELLED' },
          });
        }
      }
    }
    return result;
  }

  private async completeSession(
    ctx: Context,
    student: StudentInfo,
    version: VersionInfo,
    sessionId: string,
    completedAt: Date,
    measurementType: MeasurementType,
  ): Promise<void> {
    const answers = this.answersFor(ctx, student, version);
    const durationSeconds = intBetween(ctx.random, 6 * 60, 22 * 60);
    await this.prisma.$transaction(async (tx) => {
      await tx.diagnosticSession.update({
        where: { id: sessionId },
        data: {
          status: 'COMPLETED',
          source: 'ONLINE',
          measurementType,
          startedAt: new Date(completedAt.getTime() - durationSeconds * 1000),
          completedAt,
          durationSeconds,
          draftAnswers: Prisma.DbNull,
          currentRevision: 1,
          updatedAt: completedAt,
        },
      });
      await this.writeAnswers(tx, ctx, student, version, sessionId, answers, completedAt);
    });
    this.audit(
      ctx,
      'diagnostic_session.completed',
      'diagnostic_session',
      sessionId,
      student.userId,
      completedAt,
      {
        studentId: student.id,
        versionId: version.id,
      },
    );
  }

  /** Ответы, по которым правило методики даёт уровень, соответствующий склонности студента. */
  private answersFor(
    ctx: Context,
    student: StudentInfo,
    version: VersionInfo,
  ): Record<string, Exclude<AnswerValue, null>> {
    const disposition = ctx.state.dispositions[student.id]!;
    return answersForLevel(
      version.content,
      disposition,
      levelFor(disposition.INTRINSIC),
      ctx.random,
    );
  }

  /** Первая редакция ответов прохождения и баллы шкал по ним. */
  private async writeAnswers(
    tx: Tx,
    ctx: Context,
    student: StudentInfo,
    version: VersionInfo,
    sessionId: string,
    answers: Record<string, Exclude<AnswerValue, null>>,
    completedAt: Date,
  ): Promise<void> {
    await tx.diagnosticRevision.create({
      data: {
        sessionId,
        revision: 1,
        kind: 'INITIAL',
        scoringVersionId: version.id,
        createdById: student.userId ?? ctx.state.curatorId,
        createdAt: completedAt,
      },
    });
    await tx.diagnosticAnswer.createMany({
      data: Object.entries(answers).map(([questionId, value]) => ({
        sessionId,
        questionId,
        revision: 1,
        value: value as Prisma.InputJsonValue,
        createdAt: completedAt,
      })),
    });
    await tx.diagnosticScore.createMany({
      data: scoreQuestionnaire(version.content, answers).map((score) => ({
        sessionId,
        scaleId: score.scaleKey,
        revision: 1,
        rawScore: score.rawScore,
        interpretationRuleId: score.rule?.key ?? null,
        missingAnswers: score.missingAnswers,
        createdAt: completedAt,
      })),
    });
  }

  /**
   * Замена ответов завершённых прохождений в копии (например, перенесённых из рабочей базы, по
   * которым уровни методик расходятся): прежние редакции удаляются, записывается одна новая с
   * ответами под склонность студента. Дата и способ прохождения сохраняются.
   */
  private async reanswerSessions(
    ctx: Context,
    student: StudentInfo,
    sessionIds: string[],
  ): Promise<void> {
    if (!ctx.state.dispositions[student.id]) return;
    const sessions = await this.prisma.diagnosticSession.findMany({
      where: { id: { in: sessionIds }, status: 'COMPLETED' },
    });
    for (const session of sessions) {
      const version = ctx.versions.find((item) => item.id === session.versionId);
      if (!version || !session.completedAt) continue;
      const completedAt = session.completedAt;
      const answers = this.answersFor(ctx, student, version);
      await this.withoutTriggers(async (tx) => {
        await tx.diagnosticScore.deleteMany({ where: { sessionId: session.id } });
        await tx.diagnosticAnswer.deleteMany({ where: { sessionId: session.id } });
        await tx.diagnosticRevision.deleteMany({ where: { sessionId: session.id } });
        await tx.diagnosticSession.update({
          where: { id: session.id },
          data: { currentRevision: 1 },
        });
        await this.writeAnswers(tx, ctx, student, version, session.id, answers, completedAt);
      });
    }
  }

  /** Перенос уже завершённого прохождения в окно замера (в копии; записи защищены триггерами). */
  private async shiftSession(
    sessionId: string,
    completedAt: Date,
    measurementType: MeasurementType,
  ): Promise<void> {
    await this.withoutTriggers(async (tx) => {
      const session = await tx.diagnosticSession.findUniqueOrThrow({ where: { id: sessionId } });
      const duration = session.durationSeconds ?? 600;
      await tx.diagnosticSession.update({
        where: { id: sessionId },
        data: {
          measurementType,
          startedAt: new Date(completedAt.getTime() - duration * 1000),
          completedAt,
          createdAt: new Date(completedAt.getTime() - 3 * 24 * 3600 * 1000),
          updatedAt: completedAt,
        },
      });
      await tx.diagnosticRevision.updateMany({
        where: { sessionId },
        data: { createdAt: completedAt },
      });
      await tx.diagnosticAnswer.updateMany({
        where: { sessionId },
        data: { createdAt: completedAt },
      });
      await tx.diagnosticScore.updateMany({
        where: { sessionId },
        data: { createdAt: completedAt },
      });
    });
  }

  // ── Мотивационные профили ──

  /**
   * Предложение профиля по правилам методик (как кнопка «Сформировать профиль») и решение
   * преподавателя через день. Если данные не изменились, прежний профиль только переносится
   * по датам; при нехватке данных профиль остаётся «Требуется дополнительная диагностика».
   */
  private async motivationProfiles(
    ctx: Context,
    decidedOn: string,
    shiftExisting: boolean,
  ): Promise<void> {
    const proposedAt = at(addDays(decidedOn, -1), '16:00');
    const decidedAt = at(decidedOn, '15:00');
    for (const student of ctx.students) {
      const row = await this.prisma.student.findUniqueOrThrow({
        where: { id: student.id },
        select: { currentMotivationProfileId: true },
      });
      let basis = await this.profiles.collectBasis(student.id);
      const current = row.currentMotivationProfileId
        ? await this.prisma.motivationProfile.findUnique({
            where: { id: row.currentMotivationProfileId },
            include: { sources: { select: { sessionId: true } } },
          })
        : null;
      const sources = new Set(current?.sources.map((item) => item.sessionId) ?? []);
      // Данные не изменились и уровень определён: прежний профиль остаётся.
      const keep =
        !!current &&
        current.status !== 'NEEDS_MORE_DIAGNOSTICS' &&
        sources.size === basis.sessionIds.length &&
        basis.sessionIds.every((id) => sources.has(id));
      if (current && shiftExisting) {
        // В первичном замере профиль рабочей базы переносится на дату замера, а заменяемый новым
        // профилем — на день раньше, в историю.
        const shiftedAt = keep ? proposedAt : at(addDays(decidedOn, -2), '16:00');
        const shiftedDecidedAt = keep ? decidedAt : at(addDays(decidedOn, -2), '17:00');
        await this.withoutTriggers(async (tx) => {
          await tx.motivationProfile.update({
            where: { id: current.id },
            data: {
              createdAt: shiftedAt,
              updatedAt: current.decidedAt ? shiftedDecidedAt : shiftedAt,
              ...(current.decidedAt ? { decidedAt: shiftedDecidedAt } : {}),
            },
          });
          await tx.motivationProfileHistory.updateMany({
            where: {
              profileId: current.id,
              status: { in: ['PROPOSED', 'NEEDS_MORE_DIAGNOSTICS'] },
            },
            data: { createdAt: shiftedAt },
          });
          await tx.motivationProfileHistory.updateMany({
            where: { profileId: current.id, status: { in: ['CONFIRMED', 'CORRECTED'] } },
            data: { createdAt: shiftedDecidedAt },
          });
        });
      }
      if (keep) {
        if (shiftExisting && current.status === 'PROPOSED' && current.proposedLevel) {
          await this.decide(ctx, student, current.id, current.proposedLevel, decidedAt);
        }
        continue;
      }

      // Демо не оставляет профилей «Требуется дополнительная диагностика»: если уровни методик
      // расходятся или не определены, ответы прохождений перегенерируются под склонность студента.
      for (let attempt = 0; !basis.level && attempt < 3; attempt += 1) {
        await this.reanswerSessions(ctx, student, basis.sessionIds);
        basis = await this.profiles.collectBasis(student.id);
      }

      const status: MotivationProfileStatus = basis.level ? 'PROPOSED' : 'NEEDS_MORE_DIAGNOSTICS';
      const profile = await this.prisma.motivationProfile.create({
        data: {
          studentId: student.id,
          status,
          proposedLevel: basis.level,
          basis: basis.dto as unknown as Prisma.InputJsonValue,
          createdAt: proposedAt,
          updatedAt: proposedAt,
          sources: { create: basis.sessionIds.map((sessionId) => ({ sessionId })) },
          history: {
            create: {
              status,
              toLevel: basis.level,
              reason: basis.dto.reason,
              changedById: ctx.state.curatorId,
              createdAt: proposedAt,
            },
          },
        },
      });
      await this.prisma.student.update({
        where: { id: student.id },
        data: { currentMotivationProfileId: profile.id },
      });
      this.audit(
        ctx,
        status === 'PROPOSED'
          ? 'motivation_profile.proposed'
          : 'motivation_profile.needs_more_diagnostics',
        'motivation_profile',
        profile.id,
        ctx.state.curatorId,
        proposedAt,
        { studentId: student.id, status, proposedLevel: basis.level, sources: basis.sessionIds },
      );
      if (basis.level) {
        await this.decide(ctx, student, profile.id, basis.level, decidedAt);
      }
    }
  }

  private async decide(
    ctx: Context,
    student: StudentInfo,
    profileId: string,
    proposedLevel: MotivationLevel,
    decidedAt: Date,
  ): Promise<void> {
    // Изредка преподаватель корректирует уровень на соседний по своим наблюдениям.
    const corrected = chance(ctx.random, 0.06) && proposedLevel !== 'HIGH';
    const level: MotivationLevel = corrected
      ? proposedLevel === 'LOW'
        ? 'MEDIUM'
        : 'HIGH'
      : proposedLevel;
    const reason = corrected
      ? 'Уровень повышен с учётом педагогических наблюдений: на занятиях студент проявляет устойчивый интерес к предмету.'
      : null;
    const status: MotivationProfileStatus = corrected ? 'CORRECTED' : 'CONFIRMED';
    await this.prisma.motivationProfile.update({
      where: { id: profileId },
      data: {
        status,
        level,
        correctionReason: reason,
        studentSummary: pick(ctx.random, PROFILE_STUDENT_SUMMARIES[level]),
        decidedById: ctx.state.curatorId,
        decidedAt,
        updatedAt: decidedAt,
        history: {
          create: {
            status,
            fromLevel: proposedLevel,
            toLevel: level,
            reason,
            changedById: ctx.state.curatorId,
            createdAt: decidedAt,
          },
        },
      },
    });
    this.audit(
      ctx,
      corrected ? 'motivation_profile.corrected' : 'motivation_profile.confirmed',
      'motivation_profile',
      profileId,
      ctx.state.curatorId,
      decidedAt,
      { status, level },
      { studentId: student.id, proposedLevel },
      reason,
    );
  }

  // ── Исследование ──

  private async research(ctx: Context, primary: Map<string, string[]>): Promise<void> {
    const createdAt = at('2025-09-25', '14:00');
    const project = await this.prisma.researchProject.create({
      data: {
        title: DEMO_RESEARCH_TITLE,
        description: `Экспериментальная группа ${EXPERIMENTAL_GROUP} занимается по индивидуальным образовательным траекториям (математика, информатика), контрольная группа ${CONTROL_GROUP} — по обычной программе. Первичный замер — октябрь 2025 года, повторный — апрель 2026 года.`,
        status: 'ACTIVE',
        startsAt: day(DEMO_PERIOD.researchFrom),
        endsAt: day(DEMO_PERIOD.researchTo),
        createdById: ctx.researcherId,
        createdAt,
        updatedAt: at(DEMO_PERIOD.researchFrom, '09:00'),
      },
    });
    ctx.state.projectId = project.id;
    const ordered = [
      ...ctx.students.filter((student) => student.experimental),
      ...ctx.students.filter((student) => !student.experimental),
    ];
    await this.prisma.researchParticipant.createMany({
      data: ordered.map((student, index) => ({
        projectId: project.id,
        studentId: student.id,
        code: `R${String(index + 1).padStart(3, '0')}`,
        group: student.experimental ? 'EXPERIMENTAL' : 'CONTROL',
        includedAt: at(DEMO_PERIOD.researchFrom, '10:00'),
      })),
    });
    this.audit(
      ctx,
      'research_project.created',
      'research_project',
      project.id,
      ctx.researcherId,
      createdAt,
      {
        title: project.title,
      },
    );
    await this.measurements(ctx, project.id, primary, 'PRIMARY');
  }

  private async measurements(
    ctx: Context,
    projectId: string,
    assignments: Map<string, string[]>,
    measurementType: MeasurementType,
  ): Promise<void> {
    const primary = measurementType === 'PRIMARY';
    for (const version of ctx.versions) {
      const measurement = await this.prisma.researchMeasurement.create({
        data: {
          projectId,
          versionId: version.id,
          measurementType,
          title: `${primary ? 'Первичный' : 'Повторный'} замер: ${version.title}`,
          startsAt: day(primary ? DEMO_PERIOD.primaryFrom : DEMO_PERIOD.repeatedFrom),
          endsAt: day(primary ? DEMO_PERIOD.primaryTo : DEMO_PERIOD.repeatedTo),
          createdAt: at(
            addDays(primary ? DEMO_PERIOD.primaryFrom : DEMO_PERIOD.repeatedFrom, -4),
            '11:00',
          ),
        },
      });
      await this.prisma.diagnosticAssignment.updateMany({
        where: { id: { in: assignments.get(version.id) ?? [] } },
        data: { researchMeasurementId: measurement.id },
      });
    }
  }

  // ── ИОТ экспериментальной группы ──

  private async trajectoriesFor(
    ctx: Context,
    disciplines: Map<string, DisciplineInfo>,
    library: Awaited<ReturnType<DemoActivityGenerator['library']>>,
  ): Promise<void> {
    const templates = await this.prisma.trajectoryTemplate.findMany({
      where: { createdById: null, archivedAt: null },
      include: { stages: { orderBy: { sortOrder: 'asc' } } },
    });
    const strategies = await this.profiles.getStrategies();
    const experimental = ctx.students.filter((student) => student.experimental);
    // Две-три траектории корректируются перед третьим этапом (UC-05).
    const corrected = new Set(
      shuffle(ctx.random, experimental)
        .slice(0, 3)
        .map((student) => student.id),
    );

    for (const student of experimental) {
      const profile = await this.profiles.lastDecided(student.id);
      const level = (profile?.level ?? null) as MotivationLevel | null;
      const template =
        templates.find((item) => item.motivationLevel === level && level !== null) ??
        templates.find((item) => item.isStandard);
      for (const [index, name] of TRAJECTORY_DISCIPLINES.entries()) {
        await this.trajectory(ctx, {
          student,
          discipline: disciplines.get(name)!,
          profileId: profile?.id ?? null,
          level,
          template,
          supportMethods: level ? strategies[level].join('\n') : null,
          assignments: library.assignments.get(name) ?? [],
          materials: library.materials.get(name) ?? [],
          correct: corrected.has(student.id) && index === 0,
        });
      }
    }
  }

  private async trajectory(
    ctx: Context,
    input: {
      student: StudentInfo;
      discipline: DisciplineInfo;
      profileId: string | null;
      level: MotivationLevel | null;
      template: { id: string; stages: { title: string; goal: string | null }[] } | undefined;
      supportMethods: string | null;
      assignments: LibraryAssignment[];
      materials: { id: string; topic: string }[];
      correct: boolean;
    },
  ): Promise<void> {
    const { student, discipline, random } = { ...input, random: ctx.random };
    const teacherId = discipline.teacherId;
    const createdAt = at('2025-10-23', '14:00', intBetween(random, 0, 120));
    const approvedAt = at(DEMO_PERIOD.trajectoriesOn, '10:00', intBetween(random, 0, 240));
    const stages = input.template?.stages ?? STANDARD_TRAJECTORY_STAGES;
    const theta0 = ctx.state.dispositions[student.id]!.INTRINSIC;
    const growth = ctx.state.growth[student.id] ?? 0.2;

    const trajectory = await this.prisma.trajectory.create({
      data: {
        studentId: student.id,
        disciplineId: discipline.id,
        teacherId,
        templateId: input.template?.id ?? null,
        motivationProfileId: input.profileId,
        researchProjectId: ctx.state.projectId,
        status: 'ACTIVE',
        goals: `Освоить ключевые темы дисциплины «${discipline.name}» первого курса, развить учебную самостоятельность и интерес к профессии.`,
        plannedResults:
          'Выполнены задания всех пяти этапов, пройдены контрольные точки, представлен итоговый проект.',
        supportMethods: input.supportMethods,
        startDate: day(STAGE_DATES[0]![0]),
        plannedEndDate: day(DEMO_PERIOD.trajectoriesEnd),
        currentVersion: 1,
        approvedById: teacherId,
        approvedAt,
        createdById: teacherId,
        createdAt,
        updatedAt: approvedAt,
      },
    });

    const stageRows: { id: string; checkpointId: string; assignmentIds: string[]; dues: Date[] }[] =
      [];
    for (const [index, template] of stages.entries()) {
      const [from, to] = STAGE_DATES[index]!;
      const difficulties = stageDifficulties(input.level, index);
      const picked = difficulties
        .map((difficulty) =>
          input.assignments.find((item) => item.stage === index && item.difficulty === difficulty),
        )
        .filter((item) => item !== undefined);
      const stageTopic = input.assignments.find((item) => item.stage === index);
      const stage = await this.prisma.trajectoryStage.create({
        data: {
          trajectoryId: trajectory.id,
          sortOrder: index,
          title: template.title,
          goal: template.goal,
          startDate: day(from),
          endDate: day(to),
          status: index === 0 ? 'IN_PROGRESS' : 'NOT_STARTED',
          createdAt,
          updatedAt: approvedAt,
          checkpoints: {
            create: {
              title: `Контрольная точка этапа «${template.title}»`,
              description: 'Проверка результатов этапа и рефлексия.',
              dueDate: day(to),
              createdAt,
              updatedAt: approvedAt,
            },
          },
        },
        include: { checkpoints: true },
      });
      const topic = stageTopic
        ? DEMO_ASSIGNMENTS[discipline.name]?.find((item) => item.title === stageTopic.title)?.topic
        : undefined;
      const material = input.materials.find((item) => item.topic === topic);
      if (material) {
        await this.prisma.stageMaterial.create({
          data: { stageId: stage.id, materialId: material.id },
        });
      }
      const length = daysBetween(from, to);
      const dues = picked.map((_, position) =>
        at(
          picked.length > 1 && position === 0 ? addDays(from, Math.floor(length / 2)) : to,
          '18:00',
        ),
      );
      const assignmentIds: string[] = [];
      for (const [position, item] of picked.entries()) {
        const row = await this.prisma.trajectoryAssignment.create({
          data: {
            assignmentId: item.id,
            studentId: student.id,
            trajectoryId: trajectory.id,
            stageId: stage.id,
            status: 'ASSIGNED',
            dueAt: dues[position]!,
            assignedById: teacherId,
            assignedAt: approvedAt,
            updatedAt: approvedAt,
          },
        });
        assignmentIds.push(row.id);
      }
      stageRows.push({ id: stage.id, checkpointId: stage.checkpoints[0]!.id, assignmentIds, dues });
    }
    await this.prisma.trajectory.update({
      where: { id: trajectory.id },
      data: { currentStageId: stageRows[0]!.id, updatedAt: approvedAt },
    });
    await this.snapshot(trajectory.id, 1, teacherId, approvedAt, null);
    this.audit(ctx, 'trajectory.created', 'trajectory', trajectory.id, teacherId, createdAt, {
      studentId: student.id,
      disciplineId: discipline.id,
    });
    this.audit(ctx, 'trajectory.approved', 'trajectory', trajectory.id, teacherId, approvedAt, {
      status: 'ACTIVE',
      version: 1,
    });
    this.notify(
      ctx,
      student,
      'trajectory.approved',
      'Утверждена индивидуальная траектория',
      discipline.name,
      '/student/trajectory',
      approvedAt,
    );

    let lastActivity = approvedAt;
    for (const [index, stage] of stageRows.entries()) {
      const [from, to] = STAGE_DATES[index]!;
      let stageEnd = to;
      if (input.correct && index === 2) {
        // Корректировка (UC-05): третий этап продлён на неделю, новая версия с причиной.
        const reason = pick(random, CORRECTION_REASONS);
        const correctedAt = at(from, '11:00');
        const shiftedTo = addDays(to, 7);
        await this.prisma.trajectoryStage.update({
          where: { id: stage.id },
          data: { endDate: day(shiftedTo), updatedAt: correctedAt },
        });
        await this.prisma.trajectoryCheckpoint.update({
          where: { id: stage.checkpointId },
          data: { dueDate: day(shiftedTo), updatedAt: correctedAt },
        });
        await this.prisma.trajectoryAssignment.update({
          where: { id: stage.assignmentIds.at(-1)! },
          data: { dueAt: at(shiftedTo, '18:00'), updatedAt: correctedAt },
        });
        stage.dues[stage.dues.length - 1] = at(shiftedTo, '18:00');
        stageEnd = shiftedTo;
        const version = 2;
        await this.prisma.trajectory.update({
          where: { id: trajectory.id },
          data: { currentVersion: version, updatedAt: correctedAt },
        });
        await this.snapshot(trajectory.id, version, teacherId, correctedAt, reason);
        this.audit(
          ctx,
          'trajectory.corrected',
          'trajectory',
          trajectory.id,
          teacherId,
          correctedAt,
          { version },
          { version: 1 },
          reason,
        );
        this.notify(
          ctx,
          student,
          'trajectory.corrected',
          'Индивидуальная траектория скорректирована',
          `${discipline.name} · версия ${version}`,
          '/student/trajectory',
          correctedAt,
        );
      }
      const theta = clamp(theta0 + (growth * index) / 4, 0, 1);
      await this.prisma.trajectoryStage.update({
        where: { id: stage.id },
        data: { status: 'IN_PROGRESS', updatedAt: at(from, '08:00') },
      });
      await this.stageSupport(
        ctx,
        student,
        discipline,
        trajectory.id,
        stage.id,
        stage.assignmentIds[0] ?? null,
        from,
        stageEnd,
        theta,
        index,
      );

      let completedAll = true;
      let stageDone = at(stageEnd, '18:00');
      for (const [position, assignmentId] of stage.assignmentIds.entries()) {
        const done = await this.simulateAssignment(
          ctx,
          student,
          teacherId,
          discipline,
          assignmentId,
          stage.dues[position]!,
          from,
          theta,
        );
        if (done) {
          stageDone = laterOf(stageDone, done);
          lastActivity = laterOf(lastActivity, done);
        } else completedAll = false;
      }
      const passed = completedAll || chance(random, 0.5);
      const checkpointAt = at(workday(stageEnd), '16:00');
      await this.prisma.trajectoryCheckpoint.update({
        where: { id: stage.checkpointId },
        data: {
          status: passed ? 'PASSED' : 'MISSED',
          passedAt: passed ? checkpointAt : null,
          updatedAt: checkpointAt,
        },
      });
      await this.prisma.trajectoryStage.update({
        where: { id: stage.id },
        data: { status: 'COMPLETED', completedAt: stageDone, updatedAt: stageDone },
      });
      await this.prisma.trajectory.update({
        where: { id: trajectory.id },
        data: { currentStageId: stage.id },
      });
      if (chance(random, 0.75)) {
        const reflectedAt = at(addDays(stageEnd, 1), '19:00', intBetween(random, 0, 180));
        await this.prisma.reflection.create({
          data: {
            studentId: student.id,
            trajectoryId: trajectory.id,
            stageId: stage.id,
            checkpointId: stage.checkpointId,
            selfAssessment: clamp(Math.round(2 + 3 * theta + noise(random, 0.6)), 1, 5),
            achievements: pick(random, REFLECTION_ACHIEVEMENTS),
            difficulties: pick(random, REFLECTION_DIFFICULTIES),
            nextSteps: pick(random, REFLECTION_NEXT_STEPS),
            createdAt: reflectedAt,
          },
        });
        await this.prisma.feedback.updateMany({
          where: { stageId: stage.id, kind: 'SELF_ASSESSMENT_REQUEST', resolvedAt: null },
          data: { resolvedAt: reflectedAt },
        });
        this.notify(
          ctx,
          { userId: teacherId },
          'reflection.created',
          'Студент заполнил рефлексию',
          discipline.name,
          `/students/${student.id}?tab=support`,
          reflectedAt,
        );
      }
    }

    const completedAt = laterOf(at(DEMO_PERIOD.trajectoriesEnd, '15:00'), lastActivity);
    const finalTheta = clamp(theta0 + growth, 0, 1);
    await this.prisma.trajectoryAssignment.updateMany({
      where: {
        trajectoryId: trajectory.id,
        status: { in: ['ASSIGNED', 'IN_PROGRESS', 'RETURNED'] },
      },
      data: { status: 'CANCELLED', updatedAt: completedAt },
    });
    await this.prisma.trajectory.update({
      where: { id: trajectory.id },
      data: {
        status: 'COMPLETED',
        completedAt,
        finalAssessment:
          FINAL_ASSESSMENTS[finalTheta >= 0.75 ? 'high' : finalTheta >= 0.45 ? 'medium' : 'low'],
        updatedAt: completedAt,
      },
    });
    this.audit(
      ctx,
      'trajectory.completed',
      'trajectory',
      trajectory.id,
      teacherId,
      completedAt,
      {
        status: 'COMPLETED',
      },
      { status: 'ACTIVE' },
    );
    this.notify(
      ctx,
      student,
      'trajectory.completed',
      'Индивидуальная траектория завершена',
      discipline.name,
      '/student/trajectory',
      completedAt,
    );
  }

  /** Снимок маршрута в версии (FR-043) — тем же представлением, что и при утверждении. */
  private async snapshot(
    trajectoryId: string,
    versionNumber: number,
    teacherId: string,
    createdAt: Date,
    reason: string | null,
  ): Promise<void> {
    const dto = await this.trajectories.get(systemUser(teacherId), trajectoryId);
    await this.prisma.trajectoryVersion.create({
      data: {
        trajectoryId,
        versionNumber,
        status: 'ACTIVE',
        snapshot: toSnapshot(dto) as unknown as Prisma.InputJsonValue,
        reason,
        createdById: teacherId,
        createdAt,
      },
    });
  }

  /**
   * Выполнение задания: отправка (иногда с опозданием), проверка по критериям, иногда возврат
   * на доработку и повторная сдача. Возвращает момент принятия или null, если студент не сдал.
   */
  private async simulateAssignment(
    ctx: Context,
    student: StudentInfo,
    teacherId: string,
    discipline: DisciplineInfo,
    trajectoryAssignmentId: string,
    dueAt: Date,
    stageFrom: string,
    theta: number,
  ): Promise<Date | null> {
    const { random } = ctx;
    if (chance(random, 0.02 + 0.06 * (1 - theta))) return null;
    const assignment = await this.prisma.trajectoryAssignment.findUniqueOrThrow({
      where: { id: trajectoryAssignmentId },
      include: { assignment: { include: { criteria: { orderBy: { sortOrder: 'asc' } } } } },
    });
    const earliest = at(addDays(stageFrom, 2), '15:00');
    const late = chance(random, 0.04 + 0.1 * (1 - theta));
    let submittedAt = late
      ? new Date(dueAt.getTime() + between(random, 0.3, 3) * 86400000)
      : new Date(
          Math.max(earliest.getTime(), dueAt.getTime() - between(random, 0.1, 5) * 86400000),
        );
    const returned = chance(random, 0.06 + 0.16 * (1 - theta));
    const attempts = returned ? 2 : 1;
    let acceptedAt = submittedAt;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const submission = await this.prisma.submission.create({
        data: {
          trajectoryAssignmentId,
          attemptNumber: attempt,
          text: attempt > 1 ? SUBMISSION_TEXTS[3]! : pick(random, SUBMISSION_TEXTS.slice(0, 3)),
          url: chance(random, 0.3) ? 'https://github.com/' : null,
          submittedAt,
        },
      });
      this.notify(
        ctx,
        { userId: teacherId },
        'assignment.submitted',
        attempt > 1 ? 'Доработанное задание на проверке' : 'Задание на проверке',
        assignment.assignment.title,
        `/assignments/review/${trajectoryAssignmentId}`,
        submittedAt,
      );
      const assessedAt = workTime(
        addDays(submittedAt.toISOString().slice(0, 10), intBetween(random, 1, 3)),
        random,
      );
      const accepted = attempt === attempts;
      if (!accepted) {
        await this.prisma.assessment.create({
          data: {
            submissionId: submission.id,
            assessorId: teacherId,
            decision: 'RETURNED',
            comment: pick(random, RETURN_COMMENTS),
            createdAt: assessedAt,
          },
        });
        this.notify(
          ctx,
          student,
          'assignment.returned',
          'Задание возвращено на доработку',
          assignment.assignment.title,
          `/student/assignments/${trajectoryAssignmentId}`,
          assessedAt,
        );
        submittedAt = new Date(assessedAt.getTime() + between(random, 1, 3) * 86400000);
        continue;
      }
      const ratio = clamp(0.55 + 0.4 * theta + noise(random, 0.08), 0.4, 1);
      const scores = assignment.assignment.criteria.map((criterion) => ({
        criterionId: criterion.id,
        score: clamp(
          Math.round(Number(criterion.maxScore) * clamp(ratio + noise(random, 0.06), 0.3, 1)),
          1,
          Number(criterion.maxScore),
        ),
      }));
      const total = scores.reduce((sum, item) => sum + item.score, 0);
      const maxScore = assignment.assignment.criteria.reduce(
        (sum, item) => sum + Number(item.maxScore),
        0,
      );
      const assessment = await this.prisma.assessment.create({
        data: {
          submissionId: submission.id,
          assessorId: teacherId,
          decision: 'ACCEPTED',
          score: total,
          comment: pick(
            random,
            ASSESSMENT_COMMENTS[ratio >= 0.85 ? 'high' : ratio >= 0.65 ? 'medium' : 'low'],
          ),
          createdAt: assessedAt,
          criterionScores: { create: scores },
        },
      });
      await this.prisma.academicResult.create({
        data: {
          studentId: student.id,
          disciplineId: discipline.id,
          source: 'ASSIGNMENT',
          trajectoryAssignmentId,
          assessmentId: assessment.id,
          title: assignment.assignment.title,
          score: total,
          maxScore,
          recordedAt: assessedAt,
          recordedById: teacherId,
          createdAt: assessedAt,
        },
      });
      this.audit(
        ctx,
        'submission.assessed',
        'trajectory_assignment',
        trajectoryAssignmentId,
        teacherId,
        assessedAt,
        {
          decision: 'ACCEPTED',
          score: total,
        },
      );
      this.notify(
        ctx,
        student,
        'assignment.assessed',
        'Задание проверено',
        `${assignment.assignment.title}: ${total} из ${maxScore}`,
        `/student/assignments/${trajectoryAssignmentId}`,
        assessedAt,
      );
      acceptedAt = assessedAt;
    }
    await this.prisma.trajectoryAssignment.update({
      where: { id: trajectoryAssignmentId },
      data: { status: 'COMPLETED', completedAt: acceptedAt, updatedAt: acceptedAt },
    });
    return acceptedAt;
  }

  /** Сопровождение на этапе: цели, рекомендации, обращения студента с ответами, консультации. */
  private async stageSupport(
    ctx: Context,
    student: StudentInfo,
    discipline: DisciplineInfo,
    trajectoryId: string,
    stageId: string,
    trajectoryAssignmentId: string | null,
    from: string,
    to: string,
    theta: number,
    index: number,
  ): Promise<void> {
    const { random } = ctx;
    const teacherId = discipline.teacherId;
    const length = Math.max(daysBetween(from, to), 1);
    const moment = (share: number) => workTime(addDays(from, Math.floor(length * share)), random);
    const base = { studentId: student.id, trajectoryId, stageId };

    if (chance(random, 0.5)) {
      const createdAt = moment(0.05);
      await this.prisma.feedback.create({
        data: {
          ...base,
          authorId: teacherId,
          kind: 'SHORT_TERM_GOAL',
          body: pick(random, TEACHER_GOALS),
          dueDate: day(addDays(from, Math.min(14, length))),
          createdAt,
          updatedAt: createdAt,
        },
      });
      this.notify(
        ctx,
        student,
        'feedback.created',
        'Новое сообщение преподавателя: краткосрочная цель',
        discipline.name,
        '/student/feedback',
        createdAt,
      );
    }
    if (chance(random, 0.4)) {
      const createdAt = moment(0.3);
      await this.prisma.feedback.create({
        data: {
          ...base,
          authorId: teacherId,
          kind: 'RECOMMENDATION',
          body: pick(random, TEACHER_RECOMMENDATIONS),
          createdAt,
          updatedAt: createdAt,
        },
      });
      this.notify(
        ctx,
        student,
        'feedback.created',
        'Новое сообщение преподавателя: рекомендация',
        discipline.name,
        '/student/feedback',
        createdAt,
      );
    }
    if (index === 2) {
      const createdAt = moment(0.1);
      await this.prisma.feedback.create({
        data: {
          ...base,
          authorId: teacherId,
          kind: 'SELF_ASSESSMENT_REQUEST',
          body: 'Оцените, насколько вы продвинулись за первые этапы маршрута, и заполните рефлексию после контрольной точки.',
          dueDate: day(addDays(to, 3)),
          createdAt,
          updatedAt: createdAt,
        },
      });
    }
    if (chance(random, 0.15)) {
      const createdAt = moment(0.6);
      await this.prisma.feedback.create({
        data: {
          ...base,
          authorId: teacherId,
          kind: 'COMMENT',
          visibility: 'INTERNAL',
          body: pick(random, CONSULTATION_NOTES),
          createdAt,
          updatedAt: createdAt,
        },
      });
    }
    if (student.userId && chance(random, 0.25 + 0.25 * (1 - theta))) {
      const difficulty = chance(random, 0.45);
      await this.thread(ctx, student, teacherId, discipline.name, {
        ...base,
        trajectoryAssignmentId,
        kind: difficulty ? 'DIFFICULTY_REPORT' : 'QUESTION',
        body: pick(random, difficulty ? STUDENT_DIFFICULTIES : STUDENT_QUESTIONS),
        createdAt: moment(0.45),
      });
    }
    if (student.userId && index === 3 && theta > 0.6 && chance(random, 0.25)) {
      await this.thread(ctx, student, teacherId, discipline.name, {
        ...base,
        trajectoryAssignmentId: null,
        kind: 'ROUTE_CHANGE_PROPOSAL',
        body: pick(random, ROUTE_PROPOSALS),
        createdAt: moment(0.15),
      });
    }
    if (chance(random, 0.12 + 0.18 * (1 - theta))) {
      await this.consultation(ctx, student, teacherId, trajectoryId, moment(0.55));
    }
    if (index === 4 && chance(random, 0.5)) {
      const createdAt = moment(0.9);
      await this.prisma.feedback.create({
        data: {
          ...base,
          authorId: teacherId,
          kind: 'COMMENT',
          body: pick(random, TEACHER_COMMENTS),
          createdAt,
          updatedAt: createdAt,
        },
      });
    }
  }

  /** Обращение студента и ответ преподавателя на следующий рабочий день; обращение рассмотрено. */
  private async thread(
    ctx: Context,
    student: StudentInfo,
    teacherId: string,
    disciplineName: string,
    input: {
      studentId: string;
      trajectoryId: string | null;
      stageId: string | null;
      trajectoryAssignmentId: string | null;
      kind: 'QUESTION' | 'DIFFICULTY_REPORT' | 'ROUTE_CHANGE_PROPOSAL';
      body: string;
      createdAt: Date;
    },
  ): Promise<void> {
    const { random } = ctx;
    const repliedAt = workTime(addDays(input.createdAt.toISOString().slice(0, 10), 1), random);
    const root = await this.prisma.feedback.create({
      data: {
        ...input,
        authorId: student.userId!,
        resolvedAt: repliedAt,
        updatedAt: repliedAt,
      },
    });
    await this.prisma.feedback.create({
      data: {
        studentId: student.id,
        authorId: teacherId,
        kind: 'COMMENT',
        parentId: root.id,
        trajectoryId: input.trajectoryId,
        stageId: input.stageId,
        trajectoryAssignmentId: input.trajectoryAssignmentId,
        body:
          input.kind === 'ROUTE_CHANGE_PROPOSAL'
            ? 'Хорошая идея. Учтём это при выборе задания следующего этапа.'
            : pick(random, TEACHER_REPLIES),
        createdAt: repliedAt,
        updatedAt: repliedAt,
      },
    });
    this.notify(
      ctx,
      { userId: teacherId },
      'feedback.created',
      'Новое обращение студента',
      disciplineName,
      '/feedback',
      input.createdAt,
    );
    this.notify(
      ctx,
      student,
      'feedback.reply',
      'Ответ преподавателя',
      disciplineName,
      '/student/feedback',
      repliedAt,
    );
    if (input.kind === 'DIFFICULTY_REPORT' && chance(random, 0.4)) {
      await this.prisma.student.update({
        where: { id: student.id },
        data: { supportStatus: 'NEEDS_ATTENTION' },
      });
    }
  }

  private async consultation(
    ctx: Context,
    student: StudentInfo,
    teacherId: string,
    trajectoryId: string | null,
    heldAt: Date,
  ): Promise<void> {
    const { random } = ctx;
    const byStudent = student.userId !== null && chance(random, 0.5);
    const createdAt = new Date(heldAt.getTime() - between(random, 1, 4) * 86400000);
    const cancelled = chance(random, 0.08);
    await this.prisma.consultation.create({
      data: {
        studentId: student.id,
        teacherId,
        trajectoryId,
        status: cancelled ? 'CANCELLED' : 'HELD',
        topic: pick(random, CONSULTATION_TOPICS),
        scheduledAt: heldAt,
        heldAt: cancelled ? null : heldAt,
        summary: cancelled ? null : pick(random, CONSULTATION_SUMMARIES),
        internalNote: cancelled ? null : pick(random, CONSULTATION_NOTES),
        requestedById: byStudent ? student.userId : teacherId,
        createdAt,
        updatedAt: heldAt,
      },
    });
    this.notify(
      ctx,
      student,
      cancelled ? 'consultation.cancelled' : 'consultation.held',
      cancelled ? 'Консультация отменена' : 'Консультация проведена',
      null,
      '/student/feedback',
      heldAt,
    );
  }

  // ── Контрольная группа, наблюдения ──

  /** Студенты контрольной группы тоже задают вопросы и получают консультации (без ИОТ). */
  private async controlGroupSupport(
    ctx: Context,
    disciplines: Map<string, DisciplineInfo>,
  ): Promise<void> {
    const { random } = ctx;
    const list = [...disciplines.values()];
    for (const student of ctx.students.filter((item) => !item.experimental)) {
      const count = intBetween(random, 0, 2);
      for (let i = 0; i < count && student.userId; i += 1) {
        const discipline = pick(random, list);
        const date = addDays(DEMO_PERIOD.researchFrom, intBetween(random, 10, 200));
        await this.thread(ctx, student, discipline.teacherId, discipline.name, {
          studentId: student.id,
          trajectoryId: null,
          stageId: null,
          trajectoryAssignmentId: null,
          kind: chance(random, 0.6) ? 'QUESTION' : 'DIFFICULTY_REPORT',
          body: pick(random, chance(random, 0.6) ? STUDENT_QUESTIONS : STUDENT_DIFFICULTIES),
          createdAt: workTime(date, random),
        });
      }
      if (chance(random, 0.3)) {
        const discipline = pick(random, list);
        const date = addDays(DEMO_PERIOD.researchFrom, intBetween(random, 20, 200));
        await this.consultation(ctx, student, discipline.teacherId, null, workTime(date, random));
      }
    }
  }

  /** Записи педагогических наблюдений (FR-014): в начале и в конце периода. */
  private async observations(
    ctx: Context,
    disciplines: Map<string, DisciplineInfo>,
  ): Promise<void> {
    const { random } = ctx;
    const list = [...disciplines.values()];
    const data: Prisma.PedagogicalObservationCreateManyInput[] = [];
    for (const student of ctx.students) {
      for (const [date, kind] of [
        [addDays('2025-11-05', intBetween(random, 0, 20)), 'flat'],
        [addDays('2026-03-10', intBetween(random, 0, 30)), student.experimental ? 'up' : 'flat'],
      ] as const) {
        const discipline =
          student.experimental && kind === 'up'
            ? disciplines.get(pick(random, TRAJECTORY_DISCIPLINES))!
            : pick(random, list);
        const observedAt = workTime(date, random);
        data.push({
          studentId: student.id,
          disciplineId: discipline.id,
          authorId: discipline.teacherId,
          observedAt,
          text: pick(random, OBSERVATION_NOTES[kind]),
          visibility: 'INTERNAL',
          createdAt: observedAt,
          updatedAt: observedAt,
        });
      }
    }
    await this.prisma.pedagogicalObservation.createMany({ data });
  }

  // ── Расписание и журнал ──

  /**
   * Два занятия в неделю у каждой группы (вторник, четверг), дисциплины чередуются; журнал
   * заполняется по каждому студенту. У ЭГ оценки наблюдений растут по ходу ИОТ.
   */
  private async lessons(ctx: Context, disciplines: Map<string, DisciplineInfo>): Promise<void> {
    const { random } = ctx;
    const criteria = await this.prisma.observationCriterion.findMany({
      where: { archivedAt: null },
      orderBy: { sortOrder: 'asc' },
      select: { id: true },
    });
    const list = [...disciplines.values()];
    const [breakFrom, breakTo] = DEMO_PERIOD.winterBreak;
    const trajectorySpan = daysBetween(DEMO_PERIOD.trajectoriesOn, DEMO_PERIOD.trajectoriesEnd);
    const offsets = new Map(ctx.students.map((student) => [student.id, noise(random, 0.05)]));

    const lessons: Prisma.LessonCreateManyInput[] = [];
    const entries: Prisma.LessonJournalEntryCreateManyInput[] = [];
    const ratings: Prisma.LessonRatingCreateManyInput[] = [];
    let slot = 0;
    for (
      let date: string = DEMO_PERIOD.lessonsFrom;
      date <= DEMO_PERIOD.researchTo;
      date = addDays(date, 1)
    ) {
      if (!LESSON_WEEKDAYS.includes(weekday(date)) || (date >= breakFrom && date <= breakTo))
        continue;
      const discipline = list[slot % list.length]!;
      slot += 1;
      const progress = clamp(daysBetween(DEMO_PERIOD.trajectoriesOn, date) / trajectorySpan, 0, 1);
      for (const [groupId, time] of [
        [ctx.groups.experimental, LESSON_TIMES.experimental],
        [ctx.groups.control, LESSON_TIMES.control],
      ] as const) {
        const lessonId = randomUUID();
        const filledAt = at(date, time, 120 + intBetween(random, 0, 300));
        lessons.push({
          id: lessonId,
          groupId,
          disciplineId: discipline.id,
          teacherId: discipline.teacherId,
          date: day(date),
          startTime: time,
          createdById: discipline.teacherId,
          createdAt: at(DEMO_PERIOD.lessonsFrom, '08:00', -3 * 24 * 60),
          updatedAt: filledAt,
        });
        for (const student of ctx.students.filter((item) => item.groupId === groupId)) {
          const disposition = ctx.state.dispositions[student.id]!;
          const absent = chance(random, 0.03 + 0.07 * (1 - disposition.INTRINSIC));
          const entryId = randomUUID();
          entries.push({
            id: entryId,
            lessonId,
            studentId: student.id,
            absent,
            updatedById: discipline.teacherId,
            createdAt: filledAt,
            updatedAt: filledAt,
          });
          if (absent) continue;
          const growth = student.experimental
            ? (ctx.state.growth[student.id] ?? 0) * 1.2 * progress
            : 0;
          const engagement = 0.3 + 0.45 * disposition.INTRINSIC + growth + offsets.get(student.id)!;
          for (const criterion of criteria) {
            ratings.push({
              entryId,
              criterionId: criterion.id,
              score: chance(random, 0.04)
                ? null
                : clamp(Math.round(1 + 4 * (engagement + noise(random, 0.12))), 1, 5),
            });
          }
        }
      }
    }
    await this.prisma.lesson.createMany({ data: lessons });
    for (let i = 0; i < entries.length; i += 2000) {
      await this.prisma.lessonJournalEntry.createMany({ data: entries.slice(i, i + 2000) });
    }
    for (let i = 0; i < ratings.length; i += 5000) {
      await this.prisma.lessonRating.createMany({ data: ratings.slice(i, i + 5000) });
    }
  }

  // ── Контрольные работы ──

  /**
   * Контрольная работа обеих групп с результатами: у каждого студента балл, без отметок.
   * Входной уровень следует мотивации студента по шкале колледжа («4» с 70, «5» с 90):
   * ниже 70 на входном контроле — только 2–3 отстающих (`DemoState.lagging`);
   * к итоговому ЭГ растёт заметно (прирост мотивации за ИОТ), КГ — немного.
   */
  private async controlWork(
    ctx: Context,
    disciplineId: string,
    teacherId: string,
    plan: DemoControlWork,
  ): Promise<void> {
    const { random } = ctx;
    const createdAt = at(addDays(plan.date, -7), '15:30');
    const recordedAt = at(addDays(plan.date, 1), '16:00', intBetween(random, 0, 90));
    const work = await this.prisma.controlWork.create({
      data: {
        disciplineId,
        topic: plan.topic,
        kind: plan.kind,
        criteria: plan.criteria,
        createdById: teacherId,
        createdAt,
        updatedAt: createdAt,
        groups: {
          create: [ctx.groups.experimental, ctx.groups.control].map((groupId) => ({
            groupId,
            date: day(plan.date),
          })),
        },
      },
    });
    this.audit(ctx, 'control_work.created', 'control_work', work.id, teacherId, createdAt, {
      topic: plan.topic,
      kind: plan.kind,
    });
    const rows: Prisma.ControlResultCreateManyInput[] = [];
    for (const student of ctx.students) {
      const theta = ctx.state.dispositions[student.id]?.INTRINSIC ?? 0.5;
      const growth = ctx.state.growth[student.id] ?? 0.2;
      // При повторном замере мотивация ЭГ уже выросла: входной уровень считается от исходной.
      const level = plan.kind === 'FINAL' && student.experimental ? theta - growth : theta;
      const lagging = ctx.state.lagging?.includes(student.id) ?? false;
      const base = lagging ? 58 + 8 * level : 66 + 24 * level;
      // Рост — доля запаса до 100 баллов: слабые растут сильнее, сильные не упираются в потолок.
      const share = student.experimental ? 0.55 + growth : between(random, 0.1, 0.25);
      // На входном контроле ниже 70 баллов — только отстающие.
      const [min, max] = plan.kind === 'ENTRY' ? (lagging ? [40, 69] : [70, 100]) : [40, 100];
      const score = clamp(
        Math.round(base + plan.progress * share * (100 - base) + noise(random, 4)),
        min,
        max,
      );
      rows.push({
        workId: work.id,
        studentId: student.id,
        groupId: student.groupId,
        score,
        updatedById: teacherId,
        createdAt: recordedAt,
        updatedAt: recordedAt,
      });
    }
    await this.prisma.controlResult.createMany({ data: rows });
    for (const groupId of [ctx.groups.experimental, ctx.groups.control]) {
      const own = rows.filter((row) => row.groupId === groupId);
      this.audit(ctx, 'control_results.saved', 'control_work', work.id, teacherId, recordedAt, {
        groupId,
        scored: own.length,
        marked: 0,
      });
    }
  }

  // ── Оценки за семестры ──

  private async grades(ctx: Context, disciplines: Map<string, DisciplineInfo>): Promise<void> {
    const { random } = ctx;
    const authorId = ctx.adminId ?? ctx.state.curatorId;
    const offsets = new Map<string, number>();
    for (const semester of [1, 2]) {
      const period =
        (await this.prisma.academicPeriod.findUnique({
          where: { academicYear_semester: { academicYear: ACADEMIC_YEAR, semester } },
        })) ??
        (await this.prisma.academicPeriod.create({
          data: { academicYear: ACADEMIC_YEAR, semester, createdAt: at('2025-12-30', '10:00') },
        }));
      const recordedAt =
        semester === 1 ? at('2025-12-30', '11:00') : at(DEMO_PERIOD.researchTo, '11:00');
      const rows: Prisma.AcademicResultCreateManyInput[] = [];
      for (const student of ctx.students) {
        const theta = ctx.state.dispositions[student.id]!.INTRINSIC;
        for (const discipline of disciplines.values()) {
          const key = `${student.id}:${discipline.id}`;
          if (!offsets.has(key)) offsets.set(key, noise(random, 7));
          let score = 66 + 24 * theta + offsets.get(key)!;
          if (semester === 2) {
            score += student.experimental
              ? 10 * (ctx.state.growth[student.id] ?? 0.2) +
                (TRAJECTORY_DISCIPLINES.includes(discipline.name)
                  ? between(random, 3, 8)
                  : between(random, 1, 5))
              : between(random, 1, 4);
          }
          rows.push({
            studentId: student.id,
            disciplineId: discipline.id,
            groupId: student.groupId,
            periodId: period.id,
            source: 'SEMESTER_IMPORT',
            score: clamp(Math.round(score), 40, 100),
            maxScore: 100,
            recordedAt,
            recordedById: authorId,
            createdAt: recordedAt,
          });
        }
      }
      const gradeImport = await this.prisma.gradeImport.create({
        data: {
          fileName: `Успеваемость ${EXPERIMENTAL_GROUP} и ${CONTROL_GROUP}, ${semester} семестр 2025-2026.xlsx`,
          contentHash: randomBytes(32).toString('hex'),
          rowCount: rows.length,
          createdById: authorId,
          createdAt: recordedAt,
        },
      });
      await this.prisma.academicResult.createMany({
        data: rows.map((row) => ({ ...row, importId: gradeImport.id })),
      });
      this.audit(ctx, 'grades.imported', 'grade_import', gradeImport.id, authorId, recordedAt, {
        rows: rows.length,
        semester,
      });
    }
  }

  // ── Завершение ──

  private async finish(ctx: Context, stage: DemoStage): Promise<void> {
    const { random } = ctx;
    if (stage === DemoStage.PRIMARY) {
      // Нужда в дополнительном сопровождении (FR-060) — у студентов с самой низкой мотивацией.
      const weakest = [...ctx.students]
        .sort(
          (a, b) =>
            ctx.state.dispositions[a.id]!.INTRINSIC - ctx.state.dispositions[b.id]!.INTRINSIC,
        )
        .slice(0, 3);
      for (const student of weakest) {
        await this.prisma.student.update({
          where: { id: student.id },
          data: { supportStatus: student.experimental ? 'ADDITIONAL_SUPPORT' : 'NEEDS_ATTENTION' },
        });
      }
    }
    const lastDay =
      stage === DemoStage.PRIMARY ? DEMO_PERIOD.trajectoriesEnd : DEMO_PERIOD.researchTo;
    for (const student of ctx.students) {
      if (!student.userId) continue;
      await this.prisma.user.update({
        where: { id: student.userId },
        data: { lastLoginAt: workTime(addDays(lastDay, -intBetween(random, 0, 6)), random) },
      });
    }
    // Уведомления к сегодняшнему дню прочитаны: активность закончилась весной.
    await this.prisma.notification.createMany({
      data: ctx.notifications.map((item) => ({
        ...item,
        readAt:
          item.readAt ??
          new Date((item.createdAt as Date).getTime() + between(random, 0.5, 30) * 3600000),
      })),
    });
    await this.prisma.auditLog.createMany({ data: ctx.audit });
    ctx.state.stage = stage;
    await this.prisma.systemSetting.upsert({
      where: { key: DEMO_STATE_KEY },
      create: { key: DEMO_STATE_KEY, value: ctx.state as unknown as Prisma.InputJsonValue },
      update: { value: ctx.state as unknown as Prisma.InputJsonValue },
    });
  }

  // ── Вспомогательное ──

  /** Изменения копии в обход триггеров неизменяемости (только для переноса дат). */
  private async withoutTriggers(fn: (tx: Tx) => Promise<void>): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      await fn(tx);
    });
  }

  private audit(
    ctx: Context,
    action: string,
    entityType: string,
    entityId: string,
    actorId: string | null,
    createdAt: Date,
    after?: Prisma.InputJsonValue,
    before?: Prisma.InputJsonValue,
    reason?: string | null,
  ): void {
    ctx.audit.push({
      actorId,
      action,
      entityType,
      entityId,
      after: after ?? Prisma.DbNull,
      before: before ?? Prisma.DbNull,
      reason: reason ?? null,
      createdAt,
    });
  }

  private notify(
    ctx: Context,
    recipient: { userId: string | null },
    type: string,
    title: string,
    body: string | null,
    link: string,
    createdAt: Date,
  ): void {
    if (!recipient.userId) return;
    ctx.notifications.push({ userId: recipient.userId, type, title, body, link, createdAt });
  }
}

/** Сложность заданий этапа по уровню профиля: выбирает преподаватель, профиль не ограничивает. */
function stageDifficulties(level: MotivationLevel | null, stage: number): DifficultyLevel[] {
  switch (level) {
    case 'HIGH':
      return ['ADVANCED', 'INTERMEDIATE'];
    case 'LOW':
      return stage < 2 ? ['BASIC'] : ['BASIC', 'INTERMEDIATE'];
    default:
      return ['INTERMEDIATE', stage % 2 === 0 ? 'BASIC' : 'ADVANCED'];
  }
}

/** Пользователь для чтения маршрута при снимке версии: преподаватель с полным доступом. */
function systemUser(teacherId: string): CurrentUser {
  return {
    id: teacherId,
    login: 'demo',
    lastName: '',
    firstName: '',
    middleName: null,
    roles: [RoleCode.TEACHER],
    permissions: [Permission.GROUPS_MANAGE],
    mustChangePassword: false,
  };
}
