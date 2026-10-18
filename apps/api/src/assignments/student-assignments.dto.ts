import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ASSIGN_STUDENTS_MAX,
  ASSIGN_TASKS_MAX,
  AssignmentStatus,
  CHOICE_TITLE_MAX,
  DifficultyLevel,
  SubmissionFormat,
} from '@iot/shared';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { emptyToNull, OptionalUuid, RequiredTitle } from '../common/dto.js';
import { PersonRefDto, RefDto } from '../disciplines/disciplines.dto.js';
import { AttachmentResponseDto, CriterionResponseDto } from '../library/library.dto.js';

// ── Запросы ──

export class ChoiceInputDto {
  @ApiProperty({ description: 'Название набора: что выбирает студент' })
  @RequiredTitle('Укажите название набора', CHOICE_TITLE_MAX)
  title: string;

  @ApiProperty({ minimum: 1, description: 'Сколько заданий выбрать; меньше, чем предложено' })
  @Type(() => Number)
  @IsInt({ message: 'Укажите, сколько заданий выбрать' })
  @Min(1, { message: 'Нужно выбрать хотя бы одно задание' })
  @Max(ASSIGN_TASKS_MAX - 1, { message: 'Слишком много заданий для выбора' })
  requiredCount: number;
}

export class AssignTasksDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: `Задания библиотеки одной дисциплины (не больше ${ASSIGN_TASKS_MAX})`,
  })
  @IsArray({ message: 'Выберите задания' })
  @ArrayMinSize(1, { message: 'Выберите задание' })
  @ArrayMaxSize(ASSIGN_TASKS_MAX, { message: `Не больше ${ASSIGN_TASKS_MAX} заданий за раз` })
  @IsUUID('7', { each: true, message: 'Неизвестное задание' })
  assignmentIds: string[];

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Студенты (один или несколько). Указываются либо студенты, либо группа',
  })
  @IsOptional()
  @IsArray({ message: 'Выберите студентов' })
  @ArrayMaxSize(ASSIGN_STUDENTS_MAX, {
    message: `Не больше ${ASSIGN_STUDENTS_MAX} студентов за раз`,
  })
  @IsUUID('7', { each: true, message: 'Неизвестный студент' })
  studentIds?: string[] | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    format: 'uuid',
    description: 'Группа: задание получают все её студенты, кроме архивных',
  })
  @OptionalUuid('Неизвестная группа')
  groupId?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    format: 'date-time',
    description: 'Срок сдачи (FR-053); обычно конец выбранного дня по местному времени',
  })
  @IsOptional()
  @Transform(emptyToNull)
  @IsISO8601({ strict: true }, { message: 'Некорректный срок' })
  dueAt?: string | null;

  @ApiPropertyOptional({
    type: ChoiceInputDto,
    nullable: true,
    description:
      'Выбор из равнозначных заданий (FR-054): студент выбирает `requiredCount` из предложенных. Без набора назначаются все задания',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ChoiceInputDto)
  choice?: ChoiceInputDto | null;
}

export class StudentAssignmentsQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('7', { message: 'Некорректный студент' })
  studentId: string;
}

export class ChooseAssignmentsDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'Выбранные варианты набора (id назначений); ровно столько, сколько требуется',
  })
  @IsArray({ message: 'Выберите задание' })
  @ArrayMinSize(1, { message: 'Выберите задание' })
  @ArrayMaxSize(ASSIGN_TASKS_MAX, { message: 'Слишком много заданий' })
  @IsUUID('7', { each: true, message: 'Неизвестное задание' })
  optionIds: string[];
}

// ── Ответы ──

class AssignmentRefResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty() typeName: string;
  @ApiProperty({ enum: Object.values(DifficultyLevel) }) difficulty: DifficultyLevel;
  @ApiProperty({ nullable: true, type: String }) topic: string | null;
}

class StageRefResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty() sortOrder: number;
}

class TrajectoryRefResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ type: StageRefResponseDto, nullable: true }) stage: StageRefResponseDto | null;
}

class ChoiceGroupRefResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty() requiredCount: number;
  @ApiProperty({ nullable: true, type: String }) chosenAt: string | null;
}

export class StudentAssignmentResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: Object.values(AssignmentStatus) }) status: AssignmentStatus;
  @ApiProperty({ nullable: true, type: String }) dueAt: string | null;
  @ApiProperty() assignedAt: string;
  @ApiProperty({ type: AssignmentRefResponseDto }) assignment: AssignmentRefResponseDto;
  @ApiProperty({ type: RefDto }) discipline: RefDto;
  @ApiProperty({
    type: TrajectoryRefResponseDto,
    nullable: true,
    description: 'Этап ИОТ; null — задание назначено вне маршрута',
  })
  trajectory: TrajectoryRefResponseDto | null;
  @ApiProperty({ type: ChoiceGroupRefResponseDto, nullable: true })
  choiceGroup: ChoiceGroupRefResponseDto | null;
  @ApiProperty({ type: PersonRefDto, nullable: true }) assignedBy: PersonRefDto | null;
}

export class CabinetAssignmentDetailResponseDto extends StudentAssignmentResponseDto {
  @ApiProperty({ nullable: true, type: String }) goal: string | null;
  @ApiProperty({ nullable: true, type: String }) instruction: string | null;
  @ApiProperty({ enum: Object.values(SubmissionFormat), isArray: true })
  submissionFormats: SubmissionFormat[];
  @ApiProperty({ nullable: true, type: Number }) maxScore: number | null;
  @ApiProperty({ type: [CriterionResponseDto] }) criteria: CriterionResponseDto[];
  @ApiProperty({ type: [AttachmentResponseDto] }) attachments: AttachmentResponseDto[];
}

class AssignmentChoiceResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty() requiredCount: number;
  @ApiProperty({ type: RefDto }) discipline: RefDto;
  @ApiProperty({ type: [StudentAssignmentResponseDto] }) options: StudentAssignmentResponseDto[];
}

export class CabinetAssignmentsResponseDto {
  @ApiProperty({ type: [AssignmentChoiceResponseDto], description: 'Наборы на выбор (FR-054)' })
  choices: AssignmentChoiceResponseDto[];
  @ApiProperty({ type: [StudentAssignmentResponseDto] }) items: StudentAssignmentResponseDto[];
}

class StudentRefResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() fullName: string;
}

class SkippedStudentResponseDto {
  @ApiProperty({ type: StudentRefResponseDto }) student: StudentRefResponseDto;
  @ApiProperty() reason: string;
}

export class AssignTasksResultResponseDto {
  @ApiProperty({ type: [StudentRefResponseDto] }) assigned: StudentRefResponseDto[];
  @ApiProperty({ type: [SkippedStudentResponseDto] }) skipped: SkippedStudentResponseDto[];
}
