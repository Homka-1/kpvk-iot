import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ASSIGNMENT_ATTACHMENTS_MAX,
  ASSIGNMENT_CRITERIA_MAX,
  ASSIGNMENT_SCORE_MAX,
  DifficultyLevel,
  MaterialKind,
  SubmissionFormat,
} from '@iot/shared';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  emptyToNull,
  OptionalText,
  OptionalUrl,
  OptionalUuid,
  RequiredTitle,
} from '../common/dto.js';
import { PersonRefDto, RefDto } from '../disciplines/disciplines.dto.js';
import { queryBoolean } from '../groups/groups.dto.js';

const MATERIAL_KINDS = Object.values(MaterialKind);
const DIFFICULTY_LEVELS = Object.values(DifficultyLevel);
const SUBMISSION_FORMATS = Object.values(SubmissionFormat);

// ── Файлы ──

export class FileResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() originalName: string;
  @ApiProperty({ description: 'Тип по содержимому файла, а не по заголовку запроса' })
  mimeType: string;
  @ApiProperty() sizeBytes: number;
}

// ── Материалы ──

export class MaterialListQueryDto {
  @ApiPropertyOptional({ description: 'Поиск по названию, описанию и теме' })
  @OptionalText(200)
  q?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @OptionalUuid('Некорректная дисциплина')
  disciplineId?: string | null;

  @ApiPropertyOptional({ description: 'Тема (часть названия темы)' })
  @OptionalText(200)
  topic?: string | null;

  @ApiPropertyOptional({ enum: MATERIAL_KINDS })
  @IsOptional()
  @Transform(emptyToNull)
  @IsIn(MATERIAL_KINDS, { message: 'Некорректный вид материала' })
  kind?: MaterialKind | null;

  @ApiPropertyOptional({ description: 'Показать и архивные', default: false })
  @IsOptional()
  @Transform(queryBoolean)
  @IsBoolean()
  includeArchived = false;
}

export class MaterialInputDto {
  @ApiProperty({ maxLength: 300 })
  @RequiredTitle('Укажите название материала')
  title: string;

  @ApiPropertyOptional({ nullable: true, type: String, maxLength: 2000 })
  @OptionalText(2000)
  description?: string | null;

  @ApiProperty({ enum: MATERIAL_KINDS, description: 'Файл, ссылка или текст' })
  @IsIn(MATERIAL_KINDS, { message: 'Выберите вид материала' })
  kind: MaterialKind;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    format: 'uuid',
    description: 'Для вида «Файл»: id файла из `POST /files`',
  })
  @OptionalUuid('Загрузите файл')
  fileId?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, description: 'Для вида «Ссылка»' })
  @OptionalUrl()
  url?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    maxLength: 20000,
    description: 'Для вида «Текст»: простой текст, разметка не исполняется',
  })
  @OptionalText(20000)
  body?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    format: 'uuid',
    description: 'Без дисциплины — общий материал',
  })
  @OptionalUuid('Некорректная дисциплина')
  disciplineId?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, maxLength: 200 })
  @OptionalText(200)
  topic?: string | null;
}

export class MaterialResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty({ nullable: true, type: String }) description: string | null;
  @ApiProperty({ enum: MATERIAL_KINDS }) kind: MaterialKind;
  @ApiProperty({ nullable: true, type: FileResponseDto }) file: FileResponseDto | null;
  @ApiProperty({ nullable: true, type: String }) url: string | null;
  @ApiProperty({ nullable: true, type: String }) body: string | null;
  @ApiProperty({ nullable: true, type: RefDto }) discipline: RefDto | null;
  @ApiProperty({ nullable: true, type: String }) topic: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) archivedAt: string | null;
  @ApiProperty({ nullable: true, type: PersonRefDto }) createdBy: PersonRefDto | null;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ format: 'date-time' }) updatedAt: string;
}

// ── Типы заданий ──

export class AssignmentTypeInputDto {
  @ApiProperty({ maxLength: 100, example: 'Эссе' })
  @RequiredTitle('Укажите название типа', 100)
  name: string;
}

export class AssignmentTypeResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty({ description: 'Стандартный тип из п. 4.7 ТЗ' }) isSystem: boolean;
}

// ── Задания библиотеки ──

export class CriterionInputDto {
  @ApiProperty({ maxLength: 300 })
  @RequiredTitle('Укажите название критерия')
  title: string;

  @ApiPropertyOptional({ nullable: true, type: String, maxLength: 1000 })
  @OptionalText(1000)
  description?: string | null;

  @ApiProperty({
    description: `Максимальный балл по критерию; сумма по критериям задания — ${ASSIGNMENT_SCORE_MAX}`,
    minimum: 0.001,
    maximum: ASSIGNMENT_SCORE_MAX,
  })
  @IsNumber(
    { maxDecimalPlaces: 3, allowNaN: false, allowInfinity: false },
    { message: 'Укажите максимальный балл' },
  )
  @Min(0.001, { message: 'Балл должен быть больше нуля' })
  @Max(ASSIGNMENT_SCORE_MAX, { message: `Не более ${ASSIGNMENT_SCORE_MAX} баллов` })
  maxScore: number;
}

export class AttachmentInputDto {
  @ApiPropertyOptional({ nullable: true, type: String, maxLength: 300 })
  @OptionalText(300)
  title?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    format: 'uuid',
    description: 'id файла из `POST /files`; указывается либо файл, либо ссылка',
  })
  @OptionalUuid('Некорректный файл')
  fileId?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @OptionalUrl()
  url?: string | null;
}

export class LibraryAssignmentListQueryDto {
  @ApiPropertyOptional({ description: 'Поиск по названию, цели и теме' })
  @OptionalText(200)
  q?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @OptionalUuid('Некорректная дисциплина')
  disciplineId?: string | null;

  @ApiPropertyOptional({ description: 'Тема (часть названия темы)' })
  @OptionalText(200)
  topic?: string | null;

  @ApiPropertyOptional({ enum: DIFFICULTY_LEVELS })
  @IsOptional()
  @Transform(emptyToNull)
  @IsIn(DIFFICULTY_LEVELS, { message: 'Некорректный уровень сложности' })
  difficulty?: DifficultyLevel | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @OptionalUuid('Некорректный тип задания')
  typeId?: string | null;

  @ApiPropertyOptional({ description: 'Показать и архивные', default: false })
  @IsOptional()
  @Transform(queryBoolean)
  @IsBoolean()
  includeArchived = false;
}

export class LibraryAssignmentInputDto {
  @ApiProperty({ maxLength: 300 })
  @RequiredTitle('Укажите название задания')
  title: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('7', { message: 'Выберите дисциплину' })
  disciplineId: string;

  @ApiPropertyOptional({ nullable: true, type: String, maxLength: 200 })
  @OptionalText(200)
  topic?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    maxLength: 2000,
    description: 'Образовательная цель',
  })
  @OptionalText(2000)
  goal?: string | null;

  @ApiProperty({
    enum: DIFFICULTY_LEVELS,
    description: 'Уровень сложности. Мотивационный профиль его не ограничивает (FR-033)',
  })
  @IsIn(DIFFICULTY_LEVELS, { message: 'Выберите уровень сложности' })
  difficulty: DifficultyLevel;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('7', { message: 'Выберите тип задания' })
  typeId: string;

  @ApiPropertyOptional({ nullable: true, type: String, maxLength: 20000 })
  @OptionalText(20000)
  instruction?: string | null;

  @ApiProperty({ enum: SUBMISSION_FORMATS, isArray: true, description: 'Формат сдачи' })
  @IsArray({ message: 'Выберите хотя бы один формат сдачи' })
  @ArrayMinSize(1, { message: 'Выберите хотя бы один формат сдачи' })
  @ArrayUnique({ message: 'Форматы сдачи повторяются' })
  @IsIn(SUBMISSION_FORMATS, { each: true, message: 'Некорректный формат сдачи' })
  submissionFormats: SubmissionFormat[];

  @ApiProperty({ type: [CriterionInputDto], description: 'Критерии оценивания (в порядке вывода)' })
  @IsArray({ message: 'Ожидается список критериев' })
  @ArrayMaxSize(ASSIGNMENT_CRITERIA_MAX, {
    message: `Не более ${ASSIGNMENT_CRITERIA_MAX} критериев`,
  })
  @ValidateNested({ each: true })
  @Type(() => CriterionInputDto)
  criteria: CriterionInputDto[];

  @ApiProperty({ type: [AttachmentInputDto], description: 'Файлы и ссылки (FR-049)' })
  @IsArray({ message: 'Ожидается список вложений' })
  @ArrayMaxSize(ASSIGNMENT_ATTACHMENTS_MAX, {
    message: `Не более ${ASSIGNMENT_ATTACHMENTS_MAX} вложений`,
  })
  @ValidateNested({ each: true })
  @Type(() => AttachmentInputDto)
  attachments: AttachmentInputDto[];
}

export class CriterionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty({ nullable: true, type: String }) description: string | null;
  @ApiProperty() maxScore: number;
}

export class AttachmentResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ nullable: true, type: String }) title: string | null;
  @ApiProperty({ nullable: true, type: FileResponseDto }) file: FileResponseDto | null;
  @ApiProperty({ nullable: true, type: String }) url: string | null;
}

export class LibraryAssignmentResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty({ type: RefDto }) discipline: RefDto;
  @ApiProperty({ nullable: true, type: String }) topic: string | null;
  @ApiProperty({ nullable: true, type: String }) goal: string | null;
  @ApiProperty({ enum: DIFFICULTY_LEVELS }) difficulty: DifficultyLevel;
  @ApiProperty({ type: AssignmentTypeResponseDto }) type: AssignmentTypeResponseDto;
  @ApiProperty({ nullable: true, type: String }) instruction: string | null;
  @ApiProperty({ enum: SUBMISSION_FORMATS, isArray: true }) submissionFormats: SubmissionFormat[];
  @ApiProperty({ nullable: true, type: Number, description: 'Сумма баллов критериев' })
  maxScore: number | null;
  @ApiProperty({ type: [CriterionResponseDto] }) criteria: CriterionResponseDto[];
  @ApiProperty({ type: [AttachmentResponseDto] }) attachments: AttachmentResponseDto[];
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) archivedAt: string | null;
  @ApiProperty({ nullable: true, type: PersonRefDto }) createdBy: PersonRefDto | null;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ format: 'date-time' }) updatedAt: string;
}
