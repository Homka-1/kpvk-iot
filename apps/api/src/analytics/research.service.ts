import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type AcademicPeriodDto,
  academicPeriodDto,
  buildResearchAggregateTable,
  buildResearchData,
  buildResearchOutcomes,
  buildResearchRawTable,
  buildResearchWideTable,
  comparabilityKey,
  compareAcademicPeriods,
  type CurrentUser,
  dateRangeSet,
  dateRangesOverlap,
  type ExportTable,
  formatFullName,
  type MeasurementType,
  Permission,
  RESEARCH_EDITABLE_STATUSES,
  RESEARCH_PROJECT_STATUS_LABELS,
  RESEARCH_STATUS_TRANSITIONS,
  type ResearchAddParticipantsResultDto,
  type ResearchCandidateGroupDto,
  researchCode,
  type ResearchDataDto,
  ResearchDataset,
  type ResearchDateRange,
  type ResearchGroup,
  type ResearchMeasurementDto,
  type ResearchOutcomesDto,
  type ResearchOutcomesInput,
  type ResearchParticipantDto,
  type ResearchProjectDetailDto,
  type ResearchProjectDto,
  type ResearchProjectStatus,
  TrajectoryStatus,
} from '@iot/shared';
import { randomInt } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import { hasPermission } from '../auth/decorators.js';
import { IdempotencyService } from '../common/idempotency.service.js';
import { type ExportFile, exportFile } from '../common/spreadsheet.js';
import {
  scoreInclude,
  toScaleResults,
  toVersionLabel,
  versionLabelSelect,
} from '../diagnostics/sessions.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  AddParticipantsDto,
  CreateMeasurementDto,
  ResearchDataQueryDto,
  ResearchExportQueryDto,
  ResearchProjectInputDto,
} from './research.dto.js';

/** ИОТ в работе: студенту с таким маршрутом нельзя попасть в контрольную группу (огр. 4). */
const ROUTES_IN_WORK: TrajectoryStatus[] = [
  TrajectoryStatus.DRAFT,
  TrajectoryStatus.PENDING_APPROVAL,
  TrajectoryStatus.ACTIVE,
  TrajectoryStatus.NEEDS_CORRECTION,
];

const projectInclude = {
  participants: { where: { excludedAt: null }, select: { group: true } },
  _count: { select: { measurements: true } },
} satisfies Prisma.ResearchProjectInclude;

type ProjectRow = Prisma.ResearchProjectGetPayload<{ include: typeof projectInclude }>;

const measurementInclude = {
  version: { select: versionLabelSelect },
} satisfies Prisma.ResearchMeasurementInclude;

type MeasurementRow = Prisma.ResearchMeasurementGetPayload<{ include: typeof measurementInclude }>;

const isoDate = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);
const toDate = (value: string | null | undefined) => (value ? new Date(value) : null);
/** Период для журнала аудита: `[с, по]`. */
const rangeJson = (range: ResearchDateRange | null) => (range ? [range.from, range.to] : null);

function toProjectDto(row: ProjectRow): ResearchProjectDto {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status as ResearchProjectStatus,
    startsOn: isoDate(row.startsAt),
    endsOn: isoDate(row.endsAt),
    participants: {
      EXPERIMENTAL: row.participants.filter((item) => item.group === 'EXPERIMENTAL').length,
      CONTROL: row.participants.filter((item) => item.group === 'CONTROL').length,
    },
    measurements: row._count.measurements,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toMeasurementDto(row: MeasurementRow): ResearchMeasurementDto {
  return {
    id: row.id,
    title: row.title,
    measurementType: row.measurementType as MeasurementType,
    questionnaire: toVersionLabel(row.version),
    startsOn: isoDate(row.startsAt),
    endsOn: isoDate(row.endsAt),
    createdAt: row.createdAt.toISOString(),
  };
}

/** Наборы обезличенной выгрузки (FR-071, FR-075): построение таблицы, имя файла и листа. */
const EXPORT_DATASETS: Record<
  ResearchDataset,
  { build: (data: ResearchDataDto) => ExportTable; fileName: string; sheet: string }
> = {
  raw: { build: buildResearchRawTable, fileName: 'research-raw', sheet: 'Исходные данные' },
  aggregate: {
    build: buildResearchAggregateTable,
    fileName: 'research-aggregate',
    sheet: 'Сводные показатели',
  },
  wide: { build: buildResearchWideTable, fileName: 'research-wide', sheet: 'До и после' },
};

/** Перемешивание Фишера — Йетса: порядок кодов не повторяет алфавитный список группы. */
function shuffled<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = randomInt(index + 1);
    [result[index], result[other]] = [result[other]!, result[index]!];
  }
  return result;
}

/**
 * Исследовательский режим (п. 2.4, 4.10; UC-07; FR-069–FR-075; огр. 4). Исследователь создаёт
 * исследование, включает студентов учебных групп в экспериментальную или контрольную группу
 * (каждый получает код участника), фиксирует замеры — версию методики, тип и период — и получает
 * описательные статистики, сравнение групп и обезличенную выгрузку. ФИО участников видны только
 * с отдельным разрешением; в выгрузку не попадают никогда. Изменения и выгрузки пишутся в аудит.
 */
@Injectable()
export class ResearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async list(): Promise<ResearchProjectDto[]> {
    const rows = await this.prisma.researchProject.findMany({
      include: projectInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toProjectDto);
  }

  async get(id: string): Promise<ResearchProjectDetailDto> {
    const row = await this.prisma.researchProject.findUnique({
      where: { id },
      include: {
        ...projectInclude,
        measurements: { include: measurementInclude, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!row) throw new NotFoundException('Исследование не найдено');
    return {
      ...toProjectDto(row),
      measurementList: row.measurements.map(toMeasurementDto),
      editable: RESEARCH_EDITABLE_STATUSES.includes(row.status as ResearchProjectStatus),
    };
  }

  async create(
    user: CurrentUser,
    dto: ResearchProjectInputDto,
    key: string,
  ): Promise<ResearchProjectDetailDto> {
    const { response } = await this.idempotency.run(
      user.id,
      `research.create:${key}`,
      dto,
      async () => {
        const created = await this.prisma.$transaction(async (tx) => {
          const row = await tx.researchProject.create({
            data: {
              title: dto.title,
              description: dto.description ?? null,
              startsAt: toDate(dto.startsOn),
              endsAt: toDate(dto.endsOn),
              createdById: user.id,
            },
          });
          await this.audit.log(
            {
              action: 'research_project.created',
              entityType: 'research_project',
              entityId: row.id,
              after: {
                title: row.title,
                startsOn: dto.startsOn ?? null,
                endsOn: dto.endsOn ?? null,
              },
            },
            tx,
          );
          return row;
        });
        return this.get(created.id);
      },
    );
    return response;
  }

  async update(id: string, dto: ResearchProjectInputDto): Promise<ResearchProjectDetailDto> {
    const current = await this.editableProject(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.researchProject.update({
        where: { id },
        data: {
          title: dto.title,
          description: dto.description ?? null,
          startsAt: toDate(dto.startsOn),
          endsAt: toDate(dto.endsOn),
        },
      });
      await this.audit.log(
        {
          action: 'research_project.updated',
          entityType: 'research_project',
          entityId: id,
          before: {
            title: current.title,
            startsOn: isoDate(current.startsAt),
            endsOn: isoDate(current.endsAt),
          },
          after: { title: dto.title, startsOn: dto.startsOn ?? null, endsOn: dto.endsOn ?? null },
        },
        tx,
      );
    });
    return this.get(id);
  }

  async changeStatus(id: string, status: ResearchProjectStatus): Promise<ResearchProjectDetailDto> {
    const current = await this.findProject(id);
    const from = current.status as ResearchProjectStatus;
    if (!RESEARCH_STATUS_TRANSITIONS[from].includes(status)) {
      throw new ConflictException(
        `Исследование в статусе «${RESEARCH_PROJECT_STATUS_LABELS[from]}» нельзя перевести в статус «${RESEARCH_PROJECT_STATUS_LABELS[status]}»`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      const moved = await tx.researchProject.updateMany({
        where: { id, status: from },
        data: { status },
      });
      if (moved.count === 0) {
        throw new ConflictException('Статус исследования изменился. Обновите страницу');
      }
      await this.audit.log(
        {
          action: 'research_project.status_changed',
          entityType: 'research_project',
          entityId: id,
          before: { status: from },
          after: { status },
        },
        tx,
      );
    });
    return this.get(id);
  }

  // ── Участники ──

  /** Учебные группы, из которых можно включить студентов: только названия и численность. */
  async candidateGroups(): Promise<ResearchCandidateGroupDto[]> {
    const rows = await this.prisma.group.findMany({
      where: { archivedAt: null },
      select: {
        id: true,
        name: true,
        course: true,
        specialty: true,
        _count: { select: { currentStudents: { where: { archivedAt: null } } } },
      },
      orderBy: { name: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      course: row.course,
      specialty: row.specialty,
      students: row._count.currentStudents,
    }));
  }

  /** Участники исследования: коды и группы; ФИО — только с разрешением на ПДн (п. 2.4). */
  async participants(user: CurrentUser, id: string): Promise<ResearchParticipantDto[]> {
    await this.findProject(id);
    const personal = hasPermission(user, Permission.RESEARCH_PERSONAL_DATA_READ);
    const rows = await this.prisma.researchParticipant.findMany({
      where: { projectId: id },
      select: {
        id: true,
        code: true,
        group: true,
        includedAt: true,
        excludedAt: true,
        student: {
          select: {
            currentGroup: { select: { name: true } },
            ...(personal ? { lastName: true, firstName: true, middleName: true } : {}),
          },
        },
      },
      orderBy: { code: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      group: row.group as ResearchGroup,
      academicGroup: row.student.currentGroup?.name ?? null,
      includedAt: row.includedAt.toISOString(),
      excludedAt: row.excludedAt?.toISOString() ?? null,
      fullName: personal
        ? formatFullName(
            row.student as { lastName: string; firstName: string; middleName: string | null },
          )
        : null,
    }));
  }

  /**
   * Включение студентов учебной группы в ЭГ или КГ. Уже участвующие пропускаются (повторная
   * отправка не создаёт дублей, NFR-006). Студент с ИОТ в работе не включается в контрольную
   * группу: контрольная группа не получает ИОТ (огр. 4).
   */
  async addParticipants(
    id: string,
    dto: AddParticipantsDto,
  ): Promise<ResearchAddParticipantsResultDto> {
    await this.editableProject(id);
    const group = await this.prisma.group.findFirst({
      where: { id: dto.groupId, archivedAt: null },
      select: { id: true, name: true },
    });
    if (!group) {
      throw new BadRequestException({
        message: 'Учебная группа не найдена',
        fields: { groupId: 'Выберите учебную группу' },
      });
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const students = await tx.student.findMany({
          where: { currentGroupId: group.id, archivedAt: null },
          select: {
            id: true,
            participantCode: true,
            researchParticipants: { where: { projectId: id }, select: { id: true } },
            trajectories: { where: { status: { in: ROUTES_IN_WORK } }, select: { id: true } },
          },
        });
        if (students.length === 0) {
          throw new BadRequestException({
            message: 'В группе нет студентов',
            fields: { groupId: 'В выбранной группе нет студентов' },
          });
        }
        const fresh = students.filter((student) => student.researchParticipants.length === 0);
        if (dto.group === 'CONTROL') {
          const withRoutes = fresh.filter((student) => student.trajectories.length > 0);
          if (withRoutes.length > 0) {
            throw new ConflictException(
              `Контрольная группа не получает ИОТ: у студентов с кодами ${withRoutes
                .map((student) => student.participantCode)
                .join(
                  ', ',
                )} есть маршрут в работе. Включите их в экспериментальную группу или завершите маршруты`,
            );
          }
        }
        const existing = await tx.researchParticipant.count({ where: { projectId: id } });
        const order = shuffled(fresh);
        if (order.length > 0) {
          await tx.researchParticipant.createMany({
            data: order.map((student, index) => ({
              projectId: id,
              studentId: student.id,
              code: researchCode(existing + index + 1),
              group: dto.group,
            })),
          });
          await this.audit.log(
            {
              action: 'research_participants.added',
              entityType: 'research_project',
              entityId: id,
              after: { groupId: group.id, group: dto.group, count: order.length },
            },
            tx,
          );
        }
        return { added: order.length, skipped: students.length - order.length };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Состав участников изменился одновременно. Повторите действие');
      }
      throw error;
    }
  }

  /** Исключение участника: запись и код сохраняются, в расчёты он больше не входит. */
  async excludeParticipant(
    user: CurrentUser,
    id: string,
    participantId: string,
    reason: string,
  ): Promise<ResearchParticipantDto> {
    await this.editableProject(id);
    const participant = await this.prisma.researchParticipant.findFirst({
      where: { id: participantId, projectId: id },
      select: { id: true, code: true, group: true, excludedAt: true },
    });
    if (!participant) throw new NotFoundException('Участник не найден');
    if (participant.excludedAt) throw new ConflictException('Участник уже исключён');
    await this.prisma.$transaction(async (tx) => {
      await tx.researchParticipant.update({
        where: { id: participantId },
        data: { excludedAt: new Date() },
      });
      await this.audit.log(
        {
          action: 'research_participant.excluded',
          entityType: 'research_participant',
          entityId: participantId,
          before: { code: participant.code, group: participant.group },
          reason,
        },
        tx,
      );
    });
    return (await this.participants(user, id)).find((item) => item.id === participantId)!;
  }

  // ── Замеры ──

  /** Фиксация замера: версия методики, тип и период (FR-072). Версия — только опубликованная. */
  async addMeasurement(
    user: CurrentUser,
    id: string,
    dto: CreateMeasurementDto,
    key: string,
  ): Promise<ResearchProjectDetailDto> {
    const { response } = await this.idempotency.run(
      user.id,
      `research.measurement:${id}:${key}`,
      dto,
      async () => {
        await this.editableProject(id);
        const version = await this.prisma.questionnaireVersion.findFirst({
          where: { id: dto.versionId, status: { in: ['PUBLISHED', 'RETIRED'] } },
          select: { id: true, versionNumber: true, questionnaireId: true },
        });
        if (!version) {
          throw new BadRequestException({
            message: 'Замер фиксируется по опубликованной версии методики',
            fields: { versionId: 'Выберите опубликованную версию методики' },
          });
        }
        await this.prisma.$transaction(async (tx) => {
          const row = await tx.researchMeasurement.create({
            data: {
              projectId: id,
              versionId: version.id,
              measurementType: dto.measurementType,
              title: dto.title,
              startsAt: toDate(dto.startsOn),
              endsAt: toDate(dto.endsOn),
            },
          });
          await this.audit.log(
            {
              action: 'research_measurement.created',
              entityType: 'research_measurement',
              entityId: row.id,
              after: {
                projectId: id,
                questionnaireId: version.questionnaireId,
                versionNumber: version.versionNumber,
                measurementType: dto.measurementType,
                startsOn: dto.startsOn ?? null,
                endsOn: dto.endsOn ?? null,
              },
            },
            tx,
          );
        });
        return this.get(id);
      },
    );
    return response;
  }

  // ── Данные и выгрузка (UC-07) ──

  async data(id: string, query: ResearchDataQueryDto): Promise<ResearchDataDto> {
    const project = await this.findProject(id);
    const measurements = await this.prisma.researchMeasurement.findMany({
      where: {
        projectId: id,
        ...(query.measurementIds?.length ? { id: { in: query.measurementIds } } : {}),
      },
      include: measurementInclude,
    });
    const versionIds = [...new Set(measurements.map((row) => row.versionId))];
    const [participants, scales, pairs] = await Promise.all([
      this.prisma.researchParticipant.findMany({
        where: { projectId: id },
        select: { studentId: true, code: true, group: true, excludedAt: true },
      }),
      this.prisma.questionnaireScale.findMany({
        where: { versionId: { in: versionIds } },
        select: { versionId: true, code: true, name: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.versionComparability.findMany({
        where: { versionAId: { in: versionIds }, versionBId: { in: versionIds } },
        select: { versionAId: true, versionBId: true },
      }),
    ]);
    const sessions = await this.prisma.diagnosticSession.findMany({
      where: {
        status: 'COMPLETED',
        versionId: { in: versionIds },
        studentId: { in: participants.map((item) => item.studentId) },
      },
      select: {
        studentId: true,
        versionId: true,
        measurementType: true,
        completedAt: true,
        currentRevision: true,
        scores: { include: scoreInclude },
      },
    });
    const versionScales = new Map<string, { code: string; name: string }[]>();
    for (const scale of scales) {
      const list = versionScales.get(scale.versionId) ?? [];
      list.push({ code: scale.code, name: scale.name });
      versionScales.set(scale.versionId, list);
    }
    const included = participants.map((item) => ({
      studentId: item.studentId,
      code: item.code,
      group: item.group as ResearchGroup,
      excluded: item.excludedAt !== null,
    }));
    const diagnostics = buildResearchData({
      participants: included,
      measurements: measurements.map(toMeasurementDto),
      versionScales,
      sessions: sessions.map((session) => ({
        studentId: session.studentId,
        versionId: session.versionId,
        measurementType: session.measurementType as MeasurementType,
        completedAt: session.completedAt!.toISOString(),
        scores: toScaleResults(session.scores, session.currentRevision),
      })),
      approved: new Set(pairs.map((pair) => comparabilityKey(pair.versionAId, pair.versionBId))),
      scaleKeys: query.scaleKeys ?? undefined,
    });
    return { ...diagnostics, outcomes: await this.outcomes(project, included, query) };
  }

  /**
   * Успеваемость и наблюдения участников «до» и «после» (этап 27). Семестры и периоды выбирает
   * исследователь; если не выбраны — два последних семестра с оценками участников и периоды
   * относительно дат исследования: «до» — по день накануне начала, «после» — с начала до окончания.
   */
  private async outcomes(
    project: { startsAt: Date | null; endsAt: Date | null },
    participants: ResearchOutcomesInput['participants'],
    query: ResearchDataQueryDto,
  ): Promise<ResearchOutcomesDto> {
    const studentIds = participants.map((item) => item.studentId);
    const periods = (
      await this.prisma.academicPeriod.findMany({
        where: {
          academicResults: { some: { source: 'SEMESTER_IMPORT', studentId: { in: studentIds } } },
        },
      })
    )
      .sort((a, b) => compareAcademicPeriods(b, a))
      .map(academicPeriodDto);

    const choosePeriods = query.gradesBeforePeriodId || query.gradesAfterPeriodId;
    const [gradesBefore, gradesAfter] = choosePeriods
      ? await Promise.all([
          this.academicPeriod(query.gradesBeforePeriodId, 'gradesBeforePeriodId'),
          this.academicPeriod(query.gradesAfterPeriodId, 'gradesAfterPeriodId'),
        ])
      : [periods[1] ?? null, periods[0] ?? null];
    if (gradesBefore && gradesAfter && gradesBefore.id === gradesAfter.id) {
      throw new BadRequestException({
        message: 'Выберите разные семестры «до» и «после»',
        fields: { gradesAfterPeriodId: 'Семестр «после» совпадает с семестром «до»' },
      });
    }

    const [observationsBefore, observationsAfter] = this.observationPeriods(project, query);
    const ranges = [observationsBefore, observationsAfter].filter(dateRangeSet);
    const gradePeriodIds = [gradesBefore?.id, gradesAfter?.id].filter((item) => item !== undefined);
    const [grades, ratings, criteria] = await Promise.all([
      gradePeriodIds.length
        ? this.prisma.academicResult.findMany({
            where: {
              source: 'SEMESTER_IMPORT',
              studentId: { in: studentIds },
              periodId: { in: gradePeriodIds },
            },
            select: { studentId: true, periodId: true, disciplineId: true, score: true },
          })
        : [],
      ranges.length
        ? this.prisma.lessonRating.findMany({
            where: {
              score: { not: null },
              entry: {
                absent: false,
                studentId: { in: studentIds },
                OR: ranges.map((range) => ({
                  lesson: {
                    date: {
                      ...(range.from ? { gte: new Date(range.from) } : {}),
                      ...(range.to ? { lte: new Date(range.to) } : {}),
                    },
                  },
                })),
              },
            },
            select: {
              criterionId: true,
              score: true,
              entry: { select: { studentId: true, lesson: { select: { date: true } } } },
            },
          })
        : [],
      this.prisma.observationCriterion.findMany({
        select: { id: true, name: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
    ]);

    return buildResearchOutcomes({
      participants,
      periods,
      gradesBefore,
      gradesAfter,
      grades: grades.map((grade) => ({
        studentId: grade.studentId,
        periodId: grade.periodId!,
        disciplineId: grade.disciplineId,
        score: Number(grade.score),
      })),
      observationsBefore,
      observationsAfter,
      criteria,
      ratings: ratings.map((rating) => ({
        studentId: rating.entry.studentId,
        date: isoDate(rating.entry.lesson.date)!,
        criterionId: rating.criterionId,
        score: rating.score!,
      })),
    });
  }

  private async academicPeriod(
    id: string | null | undefined,
    field: string,
  ): Promise<AcademicPeriodDto | null> {
    if (!id) return null;
    const row = await this.prisma.academicPeriod.findUnique({ where: { id } });
    if (!row) {
      throw new BadRequestException({
        message: 'Семестр не найден',
        fields: { [field]: 'Выберите семестр из списка' },
      });
    }
    return academicPeriodDto(row);
  }

  private observationPeriods(
    project: { startsAt: Date | null; endsAt: Date | null },
    query: ResearchDataQueryDto,
  ): [ResearchDateRange | null, ResearchDateRange | null] {
    const chosen = [
      query.observationsBeforeFrom,
      query.observationsBeforeTo,
      query.observationsAfterFrom,
      query.observationsAfterTo,
    ].some(Boolean);
    if (!chosen) {
      const startsOn = isoDate(project.startsAt);
      if (!startsOn) return [null, null];
      const dayBefore = isoDate(new Date(project.startsAt!.getTime() - 24 * 60 * 60 * 1000));
      return [
        { from: null, to: dayBefore },
        { from: startsOn, to: isoDate(project.endsAt) },
      ];
    }
    const before = {
      from: query.observationsBeforeFrom ?? null,
      to: query.observationsBeforeTo ?? null,
    };
    const after = {
      from: query.observationsAfterFrom ?? null,
      to: query.observationsAfterTo ?? null,
    };
    for (const [range, field] of [
      [before, 'observationsBeforeTo'],
      [after, 'observationsAfterTo'],
    ] as const) {
      if (range.from && range.to && range.from > range.to) {
        throw new BadRequestException({
          message: 'Дата окончания периода раньше даты начала',
          fields: { [field]: 'Дата окончания раньше даты начала' },
        });
      }
    }
    if (dateRangeSet(before) && dateRangeSet(after) && dateRangesOverlap(before, after)) {
      throw new BadRequestException({
        message: 'Периоды наблюдений «до» и «после» пересекаются',
        fields: { observationsAfterFrom: 'Период «после» должен начинаться после периода «до»' },
      });
    }
    return [dateRangeSet(before) ? before : null, dateRangeSet(after) ? after : null];
  }

  /** Обезличенная выгрузка (FR-071, FR-075): коды участников вместо ФИО; пишется в аудит. */
  async export(id: string, query: ResearchExportQueryDto): Promise<ExportFile> {
    const data = await this.data(id, query);
    const { build, fileName, sheet } = EXPORT_DATASETS[query.dataset];
    const table = build(data);
    const file = await exportFile(table, query.format, fileName, sheet);
    const { outcomes } = data;
    await this.audit.log({
      action: 'research_data.exported',
      entityType: 'research_project',
      entityId: id,
      after: {
        format: query.format,
        dataset: query.dataset,
        measurements: data.measurements.map((item) => item.id),
        scales: data.scales.map((item) => item.key),
        ...(query.dataset === ResearchDataset.RAW
          ? {}
          : {
              gradesBefore: outcomes.gradesBefore?.id ?? null,
              gradesAfter: outcomes.gradesAfter?.id ?? null,
              observationsBefore: rangeJson(outcomes.observationsBefore),
              observationsAfter: rangeJson(outcomes.observationsAfter),
            }),
        rowCount: table.rows.length,
      },
    });
    return file;
  }

  // ── Вспомогательное ──

  private async findProject(id: string) {
    const row = await this.prisma.researchProject.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Исследование не найдено');
    return row;
  }

  private async editableProject(id: string) {
    const row = await this.findProject(id);
    const status = row.status as ResearchProjectStatus;
    if (!RESEARCH_EDITABLE_STATUSES.includes(status)) {
      throw new ConflictException(
        `Исследование в статусе «${RESEARCH_PROJECT_STATUS_LABELS[status]}»: участники, замеры и паспорт не меняются`,
      );
    }
    return row;
  }
}
