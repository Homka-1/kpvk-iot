import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  type AnswerValue,
  ASSIGNMENT_MAX_DAYS,
  AssignmentState,
  CORRECTION_REASON_MAX,
  DiagnosticRevisionKind,
  DiagnosticSessionStatus,
  DiagnosticSource,
  MeasurementType,
  QuestionType,
} from '@iot/shared';
import { Transform } from 'class-transformer';
import {
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { emptyToNull, trim } from '../common/dto.js';
import { PersonRefDto, RefDto } from '../disciplines/disciplines.dto.js';
import { GroupRefDto } from '../groups/groups.dto.js';

const ANSWERS_DESCRIPTION =
  'Ответы по id вопроса: id варианта (один вариант), список id вариантов (несколько вариантов), число (шкала Лайкерта, числовой ответ) или строка (короткий текст). null или отсутствие — пропуск.';

const answersProperty = {
  type: 'object',
  additionalProperties: true,
  description: ANSWERS_DESCRIPTION,
} as const;

// ── Запросы ──

export class CreateAssignmentDto {
  @ApiProperty({ format: 'uuid', description: 'Методика: назначается её действующая версия' })
  @IsUUID('7', { message: 'Выберите методику' })
  questionnaireId: string;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    format: 'uuid',
    description: 'Группа (FR-018). Указывается либо группа, либо студент',
  })
  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID('7', { message: 'Неизвестная группа' })
  groupId?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    format: 'uuid',
    description: 'Студент (FR-018). Указывается либо группа, либо студент',
  })
  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID('7', { message: 'Неизвестный студент' })
  studentId?: string | null;

  @ApiProperty({ format: 'date-time', description: 'Начало периода прохождения (FR-019)' })
  @IsISO8601({ strict: true }, { message: 'Укажите дату начала' })
  startsAt: string;

  @ApiProperty({
    format: 'date-time',
    description: `Конец периода (не включительно), позже начала и текущего момента; период не длиннее ${ASSIGNMENT_MAX_DAYS} дней`,
  })
  @IsISO8601({ strict: true }, { message: 'Укажите дату окончания' })
  endsAt: string;
}

export class AnswersDto {
  @ApiProperty(answersProperty)
  @IsObject({ message: 'Передайте ответы' })
  answers: Record<string, AnswerValue>;
}

export class PaperEntryDto extends AnswersDto {
  @ApiProperty({ format: 'date-time', description: 'Когда заполнен бумажный бланк (FR-022)' })
  @IsISO8601({ strict: true }, { message: 'Укажите дату заполнения бланка' })
  completedAt: string;
}

export class CorrectionDto extends AnswersDto {
  @ApiProperty({
    minLength: 5,
    maxLength: CORRECTION_REASON_MAX,
    description: 'Причина исправления ошибочного ввода (FR-013); сохраняется в журнале аудита',
  })
  @Transform(trim)
  @IsString({ message: 'Укажите причину исправления' })
  @MinLength(5, { message: 'Опишите причину исправления (не короче 5 символов)' })
  @MaxLength(CORRECTION_REASON_MAX, { message: `Не более ${CORRECTION_REASON_MAX} символов` })
  reason: string;
}

// ── Ответы ──

class FormOptionResponseDto {
  @ApiProperty() key: string;
  @ApiProperty() text: string;
}

class FormQuestionResponseDto {
  @ApiProperty({ description: 'id вопроса' }) key: string;
  @ApiProperty() text: string;
  @ApiProperty({ enum: Object.values(QuestionType) }) type: QuestionType;
  @ApiProperty() isRequired: boolean;
  @ApiProperty({ nullable: true, type: Number }) minValue: number | null;
  @ApiProperty({ nullable: true, type: Number }) maxValue: number | null;
  @ApiProperty({ nullable: true, type: String }) minLabel: string | null;
  @ApiProperty({ nullable: true, type: String }) maxLabel: string | null;
  @ApiProperty({ type: [FormOptionResponseDto], description: 'Варианты без значений и ключей' })
  options: FormOptionResponseDto[];
}

export class DiagnosticFormResponseDto {
  @ApiProperty() title: string;
  @ApiProperty({ nullable: true, type: String }) instruction: string | null;
  @ApiProperty() allowDraft: boolean;
  @ApiProperty({ type: [FormQuestionResponseDto] }) questions: FormQuestionResponseDto[];
}

class StudentRefResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() fullName: string;
  @ApiProperty() participantCode: string;
}

class SessionStudentResponseDto extends StudentRefResponseDto {
  @ApiProperty({ nullable: true, type: RefDto }) group: RefDto | null;
}

class VersionLabelResponseDto {
  @ApiProperty() questionnaireId: string;
  @ApiProperty() versionId: string;
  @ApiProperty() versionNumber: number;
  @ApiProperty() title: string;
  @ApiProperty() isDemo: boolean;
}

class TargetResponseDto {
  @ApiProperty({ enum: ['group', 'student'] }) kind: 'group' | 'student';
  @ApiPropertyOptional({ type: GroupRefDto }) group?: GroupRefDto;
  @ApiPropertyOptional({ type: StudentRefResponseDto }) student?: StudentRefResponseDto;
}

class SessionCountsResponseDto {
  @ApiProperty() total: number;
  @ApiProperty() ASSIGNED: number;
  @ApiProperty() IN_PROGRESS: number;
  @ApiProperty() COMPLETED: number;
  @ApiProperty() EXPIRED: number;
  @ApiProperty() CANCELLED: number;
}

export class DiagnosticAssignmentResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ type: VersionLabelResponseDto }) questionnaire: VersionLabelResponseDto;
  @ApiProperty({ type: TargetResponseDto }) target: TargetResponseDto;
  @ApiProperty({ enum: Object.values(MeasurementType) }) measurementType: MeasurementType;
  @ApiProperty({ format: 'date-time' }) startsAt: string;
  @ApiProperty({ format: 'date-time', description: 'Конец периода, не включительно' })
  endsAt: string;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) cancelledAt: string | null;
  @ApiProperty({ enum: Object.values(AssignmentState) }) state: AssignmentState;
  @ApiProperty({ type: PersonRefDto }) assignedBy: PersonRefDto;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({
    type: SessionCountsResponseDto,
    description: 'Прохождения по статусам (только доступные пользователю студенты)',
  })
  counts: SessionCountsResponseDto;
}

class SessionRowResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ type: SessionStudentResponseDto }) student: SessionStudentResponseDto;
  @ApiProperty({ enum: Object.values(DiagnosticSessionStatus) }) status: DiagnosticSessionStatus;
  @ApiProperty({ enum: Object.values(DiagnosticSource) }) source: DiagnosticSource;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) startedAt: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) completedAt: string | null;
  @ApiProperty({ nullable: true, type: Number, description: 'Время прохождения, секунд' })
  durationSeconds: number | null;
}

export class DiagnosticAssignmentDetailResponseDto extends DiagnosticAssignmentResponseDto {
  @ApiProperty({ type: [SessionRowResponseDto] }) sessions: SessionRowResponseDto[];
}

class LevelResponseDto {
  @ApiProperty() code: string;
  @ApiProperty() label: string;
}

class ScaleResultResponseDto {
  @ApiProperty() scaleId: string;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty({ nullable: true, type: Number, description: 'null — нет данных, не ноль' })
  rawScore: number | null;
  @ApiProperty() missingAnswers: number;
  @ApiProperty({ nullable: true, type: LevelResponseDto }) level: LevelResponseDto | null;
}

export class StudentDiagnosticResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ type: VersionLabelResponseDto }) questionnaire: VersionLabelResponseDto;
  @ApiProperty({ enum: Object.values(MeasurementType) }) measurementType: MeasurementType;
  @ApiProperty({ enum: Object.values(DiagnosticSessionStatus) }) status: DiagnosticSessionStatus;
  @ApiProperty({ enum: Object.values(DiagnosticSource) }) source: DiagnosticSource;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) startsAt: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) endsAt: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) startedAt: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) completedAt: string | null;
  @ApiProperty({ nullable: true, type: Number }) durationSeconds: number | null;
  @ApiProperty({ description: 'Действующая ревизия результатов; 0 — результатов нет' })
  revision: number;
  @ApiProperty({ type: [ScaleResultResponseDto] }) scores: ScaleResultResponseDto[];
}

class RevisionResponseDto {
  @ApiProperty() revision: number;
  @ApiProperty({ enum: Object.values(DiagnosticRevisionKind) }) kind: DiagnosticRevisionKind;
  @ApiProperty({ nullable: true, type: String }) reason: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ nullable: true, type: PersonRefDto }) createdBy: PersonRefDto | null;
  @ApiProperty(answersProperty) answers: Record<string, AnswerValue>;
  @ApiProperty({ type: [ScaleResultResponseDto] }) scores: ScaleResultResponseDto[];
}

export class DiagnosticAnswersResponseDto {
  @ApiProperty() sessionId: string;
  @ApiProperty({ type: StudentRefResponseDto }) student: StudentRefResponseDto;
  @ApiProperty({ type: DiagnosticFormResponseDto }) form: DiagnosticFormResponseDto;
  @ApiProperty({ type: [RevisionResponseDto], description: 'От новой ревизии к первой' })
  revisions: RevisionResponseDto[];
}

class CabinetResultResponseDto {
  @ApiProperty() scale: string;
  @ApiProperty() text: string;
}

export class CabinetDiagnosticResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty() isDemo: boolean;
  @ApiProperty({ enum: Object.values(DiagnosticSessionStatus) }) status: DiagnosticSessionStatus;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) startsAt: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) endsAt: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) completedAt: string | null;
  @ApiProperty({
    type: [CabinetResultResponseDto],
    description: 'Понятная студенту интерпретация (FR-016); баллы и служебные уровни не передаются',
  })
  results: CabinetResultResponseDto[];
}

export class CabinetDiagnosticSessionResponseDto extends CabinetDiagnosticResponseDto {
  @ApiProperty({ type: DiagnosticFormResponseDto }) form: DiagnosticFormResponseDto;
  @ApiProperty({ ...answersProperty, nullable: true }) draft: Record<string, AnswerValue> | null;
}

export class DraftSavedResponseDto {
  @ApiProperty({ format: 'date-time' }) savedAt: string;
}
