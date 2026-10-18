import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CheckpointStatus,
  CONSULTATION_TEXT_MAX,
  CONSULTATION_TOPIC_MAX,
  ConsultationStatus,
  FEEDBACK_TEXT_MAX,
  FeedbackKind,
  REFLECTION_TEXT_MAX,
  SELF_ASSESSMENT_MAX,
  SELF_ASSESSMENT_MIN,
  STUDENT_FEEDBACK_KINDS,
  TEACHER_FEEDBACK_KINDS,
  TrajectoryStatus,
  Visibility,
} from '@iot/shared';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { emptyToNull, OptionalText, OptionalUuid, RequiredTitle } from '../common/dto.js';
import { PersonRefDto } from '../disciplines/disciplines.dto.js';

function OptionalDate(message: string, strict = true) {
  return function (target: object, property: string) {
    IsOptional()(target, property);
    Transform(emptyToNull)(target, property);
    IsISO8601({ strict }, { message })(target, property);
  };
}

const VISIBILITY_VALUES = Object.values(Visibility);

// ── Запросы: преподаватель ──

export class FeedbackListQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Группа студента (контекст шапки)' })
  @OptionalUuid('Некорректная группа')
  groupId?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Дисциплина: записи по ИОТ этой дисциплины и записи без привязки к ИОТ',
  })
  @OptionalUuid('Некорректная дисциплина')
  disciplineId?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @OptionalUuid('Некорректный студент')
  studentId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', description: 'Назначение задания (FR-064)' })
  @OptionalUuid('Некорректное задание')
  trajectoryAssignmentId?: string | null;

  @ApiPropertyOptional({
    enum: ['student', 'teacher'],
    description: 'student — обращения студентов, teacher — сообщения преподавателей',
  })
  @IsOptional()
  @IsIn(['student', 'teacher'], { message: 'Некорректный источник' })
  source?: 'student' | 'teacher';

  @ApiPropertyOptional({ description: 'true — только нерассмотренные обращения' })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsIn([true, false], { message: 'Ожидается true или false' })
  open?: boolean;
}

export class CreateFeedbackDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('7', { message: 'Выберите студента' })
  studentId: string;

  @ApiProperty({ enum: TEACHER_FEEDBACK_KINDS })
  @IsIn(TEACHER_FEEDBACK_KINDS, { message: 'Выберите вид сообщения' })
  kind: FeedbackKind;

  @ApiProperty({
    enum: VISIBILITY_VALUES,
    description: 'INTERNAL — внутренняя педагогическая заметка, студенту не показывается (FR-068)',
  })
  @IsIn(VISIBILITY_VALUES, { message: 'Выберите видимость' })
  visibility: Visibility;

  @ApiProperty({ maxLength: FEEDBACK_TEXT_MAX })
  @RequiredTitle('Напишите текст сообщения', FEEDBACK_TEXT_MAX)
  body: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'ИОТ студента (FR-064)' })
  @OptionalUuid('Некорректная ИОТ')
  trajectoryId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', description: 'Этап ИОТ (FR-064)' })
  @OptionalUuid('Некорректный этап')
  stageId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', description: 'Назначение задания (FR-064)' })
  @OptionalUuid('Некорректное задание')
  trajectoryAssignmentId?: string | null;

  @ApiPropertyOptional({
    format: 'date',
    description: 'Срок краткосрочной цели или ответа на запрос самооценки',
  })
  @OptionalDate('Некорректная дата')
  dueDate?: string | null;
}

export class FeedbackReplyInputDto {
  @ApiProperty({ maxLength: FEEDBACK_TEXT_MAX })
  @RequiredTitle('Напишите ответ', FEEDBACK_TEXT_MAX)
  body: string;

  @ApiPropertyOptional({
    enum: VISIBILITY_VALUES,
    description: 'Ответ в ветке внутренней заметки всегда внутренний',
  })
  @IsOptional()
  @IsIn(VISIBILITY_VALUES, { message: 'Выберите видимость' })
  visibility?: Visibility;
}

export class ConsultationListQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @OptionalUuid('Некорректная группа')
  groupId?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @OptionalUuid('Некорректная дисциплина')
  disciplineId?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @OptionalUuid('Некорректный студент')
  studentId?: string | null;

  @ApiPropertyOptional({ enum: Object.values(ConsultationStatus) })
  @IsOptional()
  @IsIn(Object.values(ConsultationStatus), { message: 'Некорректный статус' })
  status?: ConsultationStatus;
}

export class CreateConsultationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('7', { message: 'Выберите студента' })
  studentId: string;

  @ApiProperty({ maxLength: CONSULTATION_TOPIC_MAX })
  @RequiredTitle('Укажите тему консультации', CONSULTATION_TOPIC_MAX)
  topic: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601({}, { message: 'Укажите дату и время консультации' })
  scheduledAt: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @OptionalUuid('Некорректная ИОТ')
  trajectoryId?: string | null;
}

export class ScheduleConsultationDto {
  @ApiProperty({ format: 'date-time' })
  @IsISO8601({}, { message: 'Укажите дату и время консультации' })
  scheduledAt: string;
}

export class HoldConsultationDto {
  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Когда проведена; по умолчанию — сейчас',
  })
  @OptionalDate('Некорректная дата проведения', false)
  heldAt?: string | null;

  @ApiPropertyOptional({ description: 'Итог, видимый студенту', maxLength: CONSULTATION_TEXT_MAX })
  @OptionalText(CONSULTATION_TEXT_MAX)
  summary?: string | null;

  @ApiPropertyOptional({
    description: 'Внутренняя заметка — студенту не выдаётся (FR-068)',
    maxLength: CONSULTATION_TEXT_MAX,
  })
  @OptionalText(CONSULTATION_TEXT_MAX)
  internalNote?: string | null;
}

// ── Запросы: студент ──

export class CabinetFeedbackInputDto {
  @ApiProperty({ enum: STUDENT_FEEDBACK_KINDS })
  @IsIn(STUDENT_FEEDBACK_KINDS, { message: 'Выберите вид обращения' })
  kind: FeedbackKind;

  @ApiProperty({ maxLength: FEEDBACK_TEXT_MAX })
  @RequiredTitle('Напишите текст обращения', FEEDBACK_TEXT_MAX)
  body: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @OptionalUuid('Некорректная ИОТ')
  trajectoryId?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @OptionalUuid('Некорректный этап')
  stageId?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @OptionalUuid('Некорректное задание')
  trajectoryAssignmentId?: string | null;
}

export class CabinetReplyInputDto {
  @ApiProperty({ maxLength: FEEDBACK_TEXT_MAX })
  @RequiredTitle('Напишите ответ', FEEDBACK_TEXT_MAX)
  body: string;
}

export class CabinetConsultationInputDto {
  @ApiProperty({ maxLength: CONSULTATION_TOPIC_MAX })
  @RequiredTitle('Укажите, что хотите обсудить', CONSULTATION_TOPIC_MAX)
  topic: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @OptionalUuid('Некорректная ИОТ')
  trajectoryId?: string | null;
}

export class ReflectionInputDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Контрольная точка (FR-066)' })
  @OptionalUuid('Некорректная контрольная точка')
  checkpointId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', description: 'Запрос самооценки, на который это ответ' })
  @OptionalUuid('Некорректный запрос')
  requestId?: string | null;

  @ApiPropertyOptional({ minimum: SELF_ASSESSMENT_MIN, maximum: SELF_ASSESSMENT_MAX })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @Type(() => Number)
  @IsInt({ message: 'Выберите оценку' })
  @Min(SELF_ASSESSMENT_MIN, { message: `От ${SELF_ASSESSMENT_MIN} до ${SELF_ASSESSMENT_MAX}` })
  @Max(SELF_ASSESSMENT_MAX, { message: `От ${SELF_ASSESSMENT_MIN} до ${SELF_ASSESSMENT_MAX}` })
  selfAssessment?: number | null;

  @ApiPropertyOptional({ description: 'Что получилось', maxLength: REFLECTION_TEXT_MAX })
  @OptionalText(REFLECTION_TEXT_MAX)
  achievements?: string | null;

  @ApiPropertyOptional({ description: 'Что было трудно', maxLength: REFLECTION_TEXT_MAX })
  @OptionalText(REFLECTION_TEXT_MAX)
  difficulties?: string | null;

  @ApiPropertyOptional({ description: 'Что буду делать дальше', maxLength: REFLECTION_TEXT_MAX })
  @OptionalText(REFLECTION_TEXT_MAX)
  nextSteps?: string | null;
}

// ── Ответы ──

class FeedbackStudentRefResponseDto extends PersonRefDto {
  @ApiProperty({ nullable: true, type: String }) groupName: string | null;
}

class FeedbackTrajectoryRefResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() disciplineName: string;
}

class FeedbackStageRefResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty() sortOrder: number;
}

class FeedbackAssignmentRefResponseDto {
  @ApiProperty({ description: 'Назначение задания (trajectory_assignments.id)' }) id: string;
  @ApiProperty() title: string;
}

class CheckpointRefResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
}

class FeedbackReplyResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() body: string;
  @ApiProperty({ enum: VISIBILITY_VALUES }) visibility: Visibility;
  @ApiProperty({ type: PersonRefDto }) author: PersonRefDto;
  @ApiProperty() fromStudent: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}

export class FeedbackResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: Object.values(FeedbackKind) }) kind: FeedbackKind;
  @ApiProperty({ enum: VISIBILITY_VALUES }) visibility: Visibility;
  @ApiProperty() body: string;
  @ApiProperty({ nullable: true, type: String, format: 'date' }) dueDate: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) resolvedAt: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ type: FeedbackStudentRefResponseDto }) student: FeedbackStudentRefResponseDto;
  @ApiProperty({ type: PersonRefDto }) author: PersonRefDto;
  @ApiProperty() fromStudent: boolean;
  @ApiProperty({ type: FeedbackTrajectoryRefResponseDto, nullable: true })
  trajectory: FeedbackTrajectoryRefResponseDto | null;
  @ApiProperty({ type: FeedbackStageRefResponseDto, nullable: true })
  stage: FeedbackStageRefResponseDto | null;
  @ApiProperty({ type: FeedbackAssignmentRefResponseDto, nullable: true })
  assignment: FeedbackAssignmentRefResponseDto | null;
  @ApiProperty({ type: [FeedbackReplyResponseDto] }) replies: FeedbackReplyResponseDto[];
}

class CabinetConsultationResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: Object.values(ConsultationStatus) }) status: ConsultationStatus;
  @ApiProperty() topic: string;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) scheduledAt: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) heldAt: string | null;
  @ApiProperty({ nullable: true, type: String }) summary: string | null;
  @ApiProperty({ type: PersonRefDto, nullable: true }) teacher: PersonRefDto | null;
  @ApiProperty() requestedByStudent: boolean;
  @ApiProperty({ type: FeedbackStudentRefResponseDto }) student: FeedbackStudentRefResponseDto;
  @ApiProperty({ type: FeedbackTrajectoryRefResponseDto, nullable: true })
  trajectory: FeedbackTrajectoryRefResponseDto | null;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}

export class ConsultationResponseDto extends CabinetConsultationResponseDto {
  @ApiProperty({ nullable: true, type: String, description: 'Только для сотрудников (FR-068)' })
  internalNote: string | null;
}

export class ReflectionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ type: FeedbackTrajectoryRefResponseDto, nullable: true })
  trajectory: FeedbackTrajectoryRefResponseDto | null;
  @ApiProperty({ type: FeedbackStageRefResponseDto, nullable: true })
  stage: FeedbackStageRefResponseDto | null;
  @ApiProperty({ type: CheckpointRefResponseDto, nullable: true })
  checkpoint: CheckpointRefResponseDto | null;
  @ApiProperty({ nullable: true, type: Number }) selfAssessment: number | null;
  @ApiProperty({ nullable: true, type: String }) achievements: string | null;
  @ApiProperty({ nullable: true, type: String }) difficulties: string | null;
  @ApiProperty({ nullable: true, type: String }) nextSteps: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ type: FeedbackStudentRefResponseDto }) student: FeedbackStudentRefResponseDto;
}

class PendingReflectionResponseDto {
  @ApiProperty() checkpointId: string;
  @ApiProperty() title: string;
  @ApiProperty({ nullable: true, type: String, format: 'date' }) dueDate: string | null;
  @ApiProperty({ enum: Object.values(CheckpointStatus) }) status: CheckpointStatus;
  @ApiProperty({ type: FeedbackStageRefResponseDto }) stage: FeedbackStageRefResponseDto;
  @ApiProperty({ type: FeedbackTrajectoryRefResponseDto })
  trajectory: FeedbackTrajectoryRefResponseDto;
}

class CabinetFeedbackTrajectoryResponseDto extends FeedbackTrajectoryRefResponseDto {
  @ApiProperty({ enum: Object.values(TrajectoryStatus) }) status: TrajectoryStatus;
  @ApiProperty({ type: [FeedbackStageRefResponseDto] }) stages: FeedbackStageRefResponseDto[];
}

export class StudentSupportResponseDto {
  @ApiProperty({ type: [FeedbackResponseDto] }) feedback: FeedbackResponseDto[];
  @ApiProperty({ type: [ConsultationResponseDto] }) consultations: ConsultationResponseDto[];
  @ApiProperty({ type: [ReflectionResponseDto] }) reflections: ReflectionResponseDto[];
  @ApiProperty({ type: [CabinetFeedbackTrajectoryResponseDto] })
  trajectories: CabinetFeedbackTrajectoryResponseDto[];
}

export class CabinetFeedbackResponseDto {
  @ApiProperty({ type: [FeedbackResponseDto], description: 'Только записи, видимые студенту' })
  feedback: FeedbackResponseDto[];
  @ApiProperty({ type: [CabinetConsultationResponseDto] })
  consultations: CabinetConsultationResponseDto[];
  @ApiProperty({ type: [ReflectionResponseDto] }) reflections: ReflectionResponseDto[];
  @ApiProperty({ type: [PendingReflectionResponseDto] })
  pendingReflections: PendingReflectionResponseDto[];
  @ApiProperty({ type: [CabinetFeedbackTrajectoryResponseDto] })
  trajectories: CabinetFeedbackTrajectoryResponseDto[];
}

export { CabinetConsultationResponseDto };
