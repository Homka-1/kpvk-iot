import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AssignmentStatus,
  CheckpointStatus,
  DifficultyLevel,
  MaterialKind,
  MotivationLevel,
  STAGE_ASSIGNMENTS_MAX,
  STAGE_CHECKPOINTS_MAX,
  STAGE_MATERIALS_MAX,
  StageStatus,
  TRAJECTORY_REASON_MAX,
  TRAJECTORY_STAGES_MAX,
  TRAJECTORY_TEXT_MAX,
  TRAJECTORY_TITLE_MAX,
  TrajectoryStatus,
} from '@iot/shared';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { emptyToNull, OptionalText, OptionalUuid, RequiredTitle } from '../common/dto.js';
import { PersonRefDto, RefDto } from '../disciplines/disciplines.dto.js';
import { GroupRefDto } from '../groups/groups.dto.js';

const STATUSES = Object.values(TrajectoryStatus);

/** Необязательная дата `YYYY-MM-DD`. */
function OptionalDate(message: string) {
  return function (target: object, property: string) {
    IsOptional()(target, property);
    Transform(emptyToNull)(target, property);
    IsISO8601({ strict: true }, { message })(target, property);
  };
}

// ── Запросы ──

export class TrajectoryListQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @OptionalUuid('Некорректный студент')
  studentId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', description: 'Группа студента (контекст шапки)' })
  @OptionalUuid('Некорректная группа')
  groupId?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @OptionalUuid('Некорректная дисциплина')
  disciplineId?: string | null;

  @ApiPropertyOptional({
    enum: STATUSES,
    description: 'Статус; без него показываются все, кроме архивных',
  })
  @IsOptional()
  @Transform(emptyToNull)
  @IsIn(STATUSES, { message: 'Неизвестный статус ИОТ' })
  status?: TrajectoryStatus | null;

  @ApiPropertyOptional({ description: 'Поиск по Ф. И. О. и коду участника' })
  @OptionalText(200)
  q?: string | null;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 25;
}

export class CreateTrajectoryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('7', { message: 'Выберите студента' })
  studentId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('7', { message: 'Выберите дисциплину' })
  disciplineId: string;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    format: 'uuid',
    description: 'Шаблон ИОТ; пусто — маршрут с нуля (FR-034)',
  })
  @OptionalUuid('Некорректный шаблон')
  templateId?: string | null;
}

export class CheckpointInputDto {
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    format: 'uuid',
    description: 'id существующей точки',
  })
  @OptionalUuid('Некорректная контрольная точка')
  id?: string | null;

  @ApiProperty({ maxLength: TRAJECTORY_TITLE_MAX })
  @RequiredTitle('Укажите название контрольной точки', TRAJECTORY_TITLE_MAX)
  title: string;

  @ApiPropertyOptional({ nullable: true, type: String, maxLength: TRAJECTORY_TEXT_MAX })
  @OptionalText(TRAJECTORY_TEXT_MAX)
  description?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date' })
  @OptionalDate('Укажите дату контрольной точки')
  dueDate?: string | null;
}

export class StageAssignmentInputDto {
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    format: 'uuid',
    description: 'id существующего назначения этапа',
  })
  @OptionalUuid('Некорректное назначение')
  id?: string | null;

  @ApiProperty({ format: 'uuid', description: 'Задание библиотеки той же дисциплины' })
  @IsUUID('7', { message: 'Выберите задание' })
  assignmentId: string;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    format: 'date-time',
    description: 'Срок сдачи',
  })
  @IsOptional()
  @Transform(emptyToNull)
  @IsISO8601({}, { message: 'Укажите срок задания' })
  dueAt?: string | null;
}

export class StageInputDto {
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    format: 'uuid',
    description: 'id существующего этапа',
  })
  @OptionalUuid('Некорректный этап')
  id?: string | null;

  @ApiProperty({ maxLength: TRAJECTORY_TITLE_MAX })
  @RequiredTitle('Укажите название этапа', TRAJECTORY_TITLE_MAX)
  title: string;

  @ApiPropertyOptional({ nullable: true, type: String, maxLength: TRAJECTORY_TEXT_MAX })
  @OptionalText(TRAJECTORY_TEXT_MAX)
  goal?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, maxLength: TRAJECTORY_TEXT_MAX })
  @OptionalText(TRAJECTORY_TEXT_MAX)
  description?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, maxLength: TRAJECTORY_TEXT_MAX })
  @OptionalText(TRAJECTORY_TEXT_MAX)
  plannedResults?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date' })
  @OptionalDate('Укажите дату начала этапа')
  startDate?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date' })
  @OptionalDate('Укажите дату окончания этапа')
  endDate?: string | null;

  @ApiProperty({ type: [CheckpointInputDto] })
  @IsArray()
  @ArrayMaxSize(STAGE_CHECKPOINTS_MAX, {
    message: `Не более ${STAGE_CHECKPOINTS_MAX} контрольных точек на этап`,
  })
  @ValidateNested({ each: true })
  @Type(() => CheckpointInputDto)
  checkpoints: CheckpointInputDto[];

  @ApiProperty({ type: [String], format: 'uuid', description: 'Материалы этапа (FR-037)' })
  @IsArray()
  @ArrayMaxSize(STAGE_MATERIALS_MAX, {
    message: `Не более ${STAGE_MATERIALS_MAX} материалов на этап`,
  })
  @ArrayUnique({ message: 'Материал добавлен дважды' })
  @IsUUID('7', { each: true, message: 'Некорректный материал' })
  materialIds: string[];

  @ApiProperty({ type: [StageAssignmentInputDto], description: 'Задания этапа' })
  @IsArray()
  @ArrayMaxSize(STAGE_ASSIGNMENTS_MAX, {
    message: `Не более ${STAGE_ASSIGNMENTS_MAX} заданий на этап`,
  })
  @ValidateNested({ each: true })
  @Type(() => StageAssignmentInputDto)
  assignments: StageAssignmentInputDto[];
}

export class RevisionTokenDto {
  @ApiProperty({
    format: 'date-time',
    description: 'Метка `updatedAt` из последнего ответа: защищает от затирания чужих изменений',
  })
  @IsISO8601({}, { message: 'Обновите страницу: нет метки редакции' })
  updatedAt: string;
}

export class TrajectoryContentDto extends RevisionTokenDto {
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Образовательные цели' })
  @OptionalText(TRAJECTORY_TEXT_MAX)
  goals?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @OptionalText(TRAJECTORY_TEXT_MAX)
  plannedResults?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Способы и формы сопровождения',
  })
  @OptionalText(TRAJECTORY_TEXT_MAX)
  supportMethods?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date' })
  @OptionalDate('Укажите дату начала')
  startDate?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date' })
  @OptionalDate('Укажите планируемую дату завершения')
  plannedEndDate?: string | null;

  @ApiProperty({ type: [StageInputDto] })
  @IsArray()
  @ArrayMaxSize(TRAJECTORY_STAGES_MAX, { message: `Не более ${TRAJECTORY_STAGES_MAX} этапов` })
  @ValidateNested({ each: true })
  @Type(() => StageInputDto)
  stages: StageInputDto[];
}

export class TrajectoryReasonDto extends RevisionTokenDto {
  @ApiProperty({ description: 'Причина (сохраняется в журнале аудита)' })
  @RequiredTitle('Укажите причину', TRAJECTORY_REASON_MAX)
  reason: string;
}

// ── Ответы ──

class StudentRefResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() fullName: string;
  @ApiProperty() participantCode: string;
  @ApiProperty({ type: GroupRefDto, nullable: true }) group: GroupRefDto | null;
}

class ProfileRefResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: Object.values(MotivationLevel) }) level: MotivationLevel;
  @ApiProperty() decidedAt: string;
}

class TemplateStageResponseDto {
  @ApiProperty() title: string;
  @ApiProperty({ nullable: true, type: String }) goal: string | null;
  @ApiProperty({ nullable: true, type: String }) description: string | null;
  @ApiProperty({ nullable: true, type: String }) plannedResults: string | null;
  @ApiProperty({ nullable: true, type: Number }) durationDays: number | null;
}

class TemplateResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty({ nullable: true, type: String }) description: string | null;
  @ApiProperty({ enum: Object.values(MotivationLevel), nullable: true })
  motivationLevel: MotivationLevel | null;
  @ApiProperty() isStandard: boolean;
  @ApiProperty({ type: [TemplateStageResponseDto] }) stages: TemplateStageResponseDto[];
}

class OptionDisciplineDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ nullable: true, type: String, description: 'Действующая ИОТ по дисциплине' })
  currentTrajectoryId: string | null;
}

export class TrajectoryOptionsResponseDto {
  @ApiProperty({ type: StudentRefResponseDto }) student: StudentRefResponseDto;
  @ApiProperty({ type: ProfileRefResponseDto, nullable: true })
  profile: ProfileRefResponseDto | null;
  @ApiProperty({ type: [OptionDisciplineDto] }) disciplines: OptionDisciplineDto[];
  @ApiProperty({ type: [TemplateResponseDto] }) templates: TemplateResponseDto[];
  @ApiProperty({ nullable: true, type: String, description: 'Шаблон по профилю (FR-035)' })
  suggestedTemplateId: string | null;
  @ApiProperty({ nullable: true, type: String }) blockedReason: string | null;
}

class StageMaterialResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty({ enum: Object.values(MaterialKind) }) kind: MaterialKind;
  @ApiProperty() archived: boolean;
}

class StageAssignmentLibraryDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty() typeName: string;
  @ApiProperty({ enum: Object.values(DifficultyLevel) }) difficulty: DifficultyLevel;
  @ApiProperty() archived: boolean;
}

class StageAssignmentResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ type: StageAssignmentLibraryDto }) assignment: StageAssignmentLibraryDto;
  @ApiProperty({ nullable: true, type: String }) dueAt: string | null;
  @ApiProperty({ enum: Object.values(AssignmentStatus) }) status: AssignmentStatus;
}

class CheckpointResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty({ nullable: true, type: String }) description: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date' }) dueDate: string | null;
  @ApiProperty({ enum: Object.values(CheckpointStatus) }) status: CheckpointStatus;
}

class StageResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() sortOrder: number;
  @ApiProperty() title: string;
  @ApiProperty({ nullable: true, type: String }) goal: string | null;
  @ApiProperty({ nullable: true, type: String }) description: string | null;
  @ApiProperty({ nullable: true, type: String }) plannedResults: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date' }) startDate: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date' }) endDate: string | null;
  @ApiProperty({ enum: Object.values(StageStatus) }) status: StageStatus;
  @ApiProperty({ type: [CheckpointResponseDto] }) checkpoints: CheckpointResponseDto[];
  @ApiProperty({ type: [StageMaterialResponseDto] }) materials: StageMaterialResponseDto[];
  @ApiProperty({ type: [StageAssignmentResponseDto] }) assignments: StageAssignmentResponseDto[];
}

class VersionSummaryResponseDto {
  @ApiProperty() versionNumber: number;
  @ApiProperty({ enum: STATUSES }) status: TrajectoryStatus;
  @ApiProperty({ nullable: true, type: String }) reason: string | null;
  @ApiProperty({ type: PersonRefDto, nullable: true }) createdBy: PersonRefDto | null;
  @ApiProperty() createdAt: string;
}

export class TrajectoryResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: STATUSES }) status: TrajectoryStatus;
  @ApiProperty({ description: 'Номер зафиксированной версии; 0 — ещё не утверждалась' })
  version: number;
  @ApiProperty({ type: StudentRefResponseDto }) student: StudentRefResponseDto;
  @ApiProperty({ type: RefDto }) discipline: RefDto;
  @ApiProperty({ type: PersonRefDto, nullable: true }) teacher: PersonRefDto | null;
  @ApiProperty({ type: RefDto, nullable: true, description: 'id и название шаблона' })
  template: { id: string; title: string } | null;
  @ApiProperty({ type: ProfileRefResponseDto, nullable: true })
  motivationProfile: ProfileRefResponseDto | null;
  @ApiProperty({ nullable: true, type: String }) goals: string | null;
  @ApiProperty({ nullable: true, type: String }) plannedResults: string | null;
  @ApiProperty({ nullable: true, type: String }) supportMethods: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date' }) startDate: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date' }) plannedEndDate: string | null;
  @ApiProperty({ nullable: true, type: String }) currentStageId: string | null;
  @ApiProperty({ type: PersonRefDto, nullable: true }) approvedBy: PersonRefDto | null;
  @ApiProperty({ nullable: true, type: String }) approvedAt: string | null;
  @ApiProperty({ nullable: true, type: String }) archivedAt: string | null;
  @ApiProperty() createdAt: string;
  @ApiProperty({ description: 'Метка редакции для сохранения и утверждения' }) updatedAt: string;
  @ApiProperty({ type: [StageResponseDto] }) stages: StageResponseDto[];
  @ApiProperty({ type: [VersionSummaryResponseDto] }) versions: VersionSummaryResponseDto[];
}

class TrajectorySummaryResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: STATUSES }) status: TrajectoryStatus;
  @ApiProperty() version: number;
  @ApiProperty({ type: StudentRefResponseDto }) student: StudentRefResponseDto;
  @ApiProperty({ type: RefDto }) discipline: RefDto;
  @ApiProperty({ type: PersonRefDto, nullable: true }) teacher: PersonRefDto | null;
  @ApiProperty({ nullable: true, type: String, format: 'date' }) startDate: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date' }) plannedEndDate: string | null;
  @ApiProperty() stageCount: number;
  @ApiProperty() updatedAt: string;
}

export class TrajectoryPageResponseDto {
  @ApiProperty({ type: [TrajectorySummaryResponseDto] }) items: TrajectorySummaryResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() pageSize: number;
}
