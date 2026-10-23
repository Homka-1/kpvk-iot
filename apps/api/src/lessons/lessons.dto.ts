import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  LESSON_IMPORT_MAX_ROWS,
  LESSON_SCORE_MAX,
  LESSON_SCORE_MIN,
  type LessonJournalStatus,
  type LessonScore,
  OBSERVATION_CRITERIA_MAX,
  OBSERVATION_CRITERION_NAME_MAX,
} from '@iot/shared';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { emptyToNull, OptionalUuid, RequiredTitle } from '../common/dto.js';
import { PersonRefDto } from '../disciplines/disciplines.dto.js';

const RATINGS_SCHEMA = {
  type: 'object',
  additionalProperties: { type: 'integer', nullable: true, minimum: 1, maximum: 5 },
  description:
    'Оценки по id критерия: 1–5 или null («Не наблюдалось»). Нет ключа — оценки нет («нет данных»).',
} as const;

function OptionalDate(message: string) {
  return function (target: object, property: string) {
    IsOptional()(target, property);
    Transform(emptyToNull)(target, property);
    IsISO8601({ strict: true }, { message })(target, property);
  };
}

// ── Запросы ──

export class LessonListQueryDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @OptionalUuid('Некорректная группа')
  groupId?: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @OptionalUuid('Некорректная дисциплина')
  disciplineId?: string | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    description: 'Начало периода (включительно)',
  })
  @OptionalDate('Некорректная дата начала периода')
  from?: string | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    description: 'Конец периода (включительно)',
  })
  @OptionalDate('Некорректная дата окончания периода')
  to?: string | null;
}

export class LessonInputDto {
  @ApiProperty({ format: 'date', description: 'Дата занятия, YYYY-MM-DD' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Укажите дату занятия' })
  date: string;

  @ApiProperty({ example: '08:30', description: 'Время начала, ЧЧ:ММ' })
  @Matches(/^\d{1,2}:\d{2}$/, { message: 'Укажите время в формате ЧЧ:ММ' })
  startTime: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('7', { message: 'Выберите группу' })
  groupId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('7', { message: 'Выберите дисциплину' })
  disciplineId: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Преподаватель занятия; преподаватель создаёт занятия только от своего имени',
  })
  @OptionalUuid('Выберите преподавателя')
  teacherId?: string | null;
}

export class LessonImportRowInputDto {
  @ApiProperty({ description: 'Номер строки в исходном файле' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  line: number;

  @ApiProperty() @IsString() @MaxLength(50) date: string;
  @ApiProperty() @IsString() @MaxLength(50) time: string;
  @ApiProperty() @IsString() @MaxLength(200) groupName: string;
  @ApiProperty() @IsString() @MaxLength(200) disciplineName: string;
  @ApiProperty() @IsString() @MaxLength(200) teacherName: string;
}

export class LessonImportCommitDto {
  @ApiProperty({ type: [LessonImportRowInputDto] })
  @IsArray({ message: 'Нет строк для импорта' })
  @ArrayMinSize(1, { message: 'Нет строк для импорта' })
  @ArrayMaxSize(LESSON_IMPORT_MAX_ROWS, {
    message: `Не более ${LESSON_IMPORT_MAX_ROWS} строк за один импорт`,
  })
  @ValidateNested({ each: true })
  @Type(() => LessonImportRowInputDto)
  rows: LessonImportRowInputDto[];
}

export class LessonRatingInputDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'Неизвестный критерий' })
  criterionId: string;

  @ApiProperty({
    type: 'integer',
    nullable: true,
    minimum: LESSON_SCORE_MIN,
    maximum: LESSON_SCORE_MAX,
    description: 'Оценка 1–5 или null — «Не наблюдалось»',
  })
  @ValidateIf((_object, value) => value !== null)
  @IsInt({ message: 'Оценка — целое число от 1 до 5' })
  @Min(LESSON_SCORE_MIN, { message: 'Оценка — целое число от 1 до 5' })
  @Max(LESSON_SCORE_MAX, { message: 'Оценка — целое число от 1 до 5' })
  score: LessonScore;
}

export class LessonJournalEntryInputDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('7', { message: 'Неизвестный студент' })
  studentId: string;

  @ApiProperty({ description: 'Отсутствовал на занятии: оценки не ставятся' })
  @IsBoolean()
  absent: boolean;

  @ApiProperty({ type: [LessonRatingInputDto] })
  @IsArray()
  @ArrayMaxSize(OBSERVATION_CRITERIA_MAX * 4)
  @ValidateNested({ each: true })
  @Type(() => LessonRatingInputDto)
  ratings: LessonRatingInputDto[];
}

export class LessonJournalInputDto {
  @ApiProperty({
    type: [LessonJournalEntryInputDto],
    description: 'Журнал целиком: студенты, которых нет в списке, считаются не отмеченными',
  })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => LessonJournalEntryInputDto)
  entries: LessonJournalEntryInputDto[];
}

export class ObservationCriterionInputDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Нет — новый критерий' })
  @IsOptional()
  @IsUUID('all', { message: 'Неизвестный критерий' })
  id?: string;

  @ApiProperty()
  @RequiredTitle('Укажите название критерия', OBSERVATION_CRITERION_NAME_MAX)
  name: string;

  @ApiProperty({ description: 'Архивный критерий не предлагается в новых журналах' })
  @IsBoolean()
  archived: boolean;
}

export class ObservationCriteriaInputDto {
  @ApiProperty({
    type: [ObservationCriterionInputDto],
    description: `Все критерии в порядке показа в журнале; действующих — от 1 до ${OBSERVATION_CRITERIA_MAX}`,
  })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ObservationCriterionInputDto)
  items: ObservationCriterionInputDto[];
}

// ── Ответы ──

class NamedRefDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
}

class LessonJournalSummaryDto {
  @ApiProperty({ enum: ['EMPTY', 'PARTIAL', 'COMPLETE'] }) status: LessonJournalStatus;
  @ApiProperty({ description: 'Отмечено студентов: отсутствие или все критерии' }) done: number;
  @ApiProperty({ description: 'Студентов в журнале' }) total: number;
}

export class LessonResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ format: 'date' }) date: string;
  @ApiProperty({ example: '08:30' }) startTime: string;
  @ApiProperty({ type: NamedRefDto }) group: NamedRefDto;
  @ApiProperty({ type: NamedRefDto }) discipline: NamedRefDto;
  @ApiProperty({ type: PersonRefDto }) teacher: PersonRefDto;
  @ApiProperty({ type: LessonJournalSummaryDto }) journal: LessonJournalSummaryDto;
  @ApiProperty() canObserve: boolean;
  @ApiProperty() canDelete: boolean;
}

export class LessonListResponseDto {
  @ApiProperty({ type: [LessonResponseDto] }) items: LessonResponseDto[];
  @ApiProperty({ description: 'Показаны последние занятия; сузьте период или группу' })
  truncated: boolean;
}

class PairDto {
  @ApiProperty() groupId: string;
  @ApiProperty() disciplineId: string;
}

export class LessonOptionsResponseDto {
  @ApiProperty({ type: [NamedRefDto] }) groups: NamedRefDto[];
  @ApiProperty({ type: [NamedRefDto] }) disciplines: NamedRefDto[];
  @ApiProperty({ type: [PersonRefDto] }) teachers: PersonRefDto[];
  @ApiProperty({ type: [PairDto], nullable: true, description: 'null — любые пары' })
  pairs: PairDto[] | null;
}

export class ObservationCriterionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() archived: boolean;
}

class LessonJournalStudentResponseDto {
  @ApiProperty({ type: PersonRefDto }) student: PersonRefDto;
  @ApiProperty({ nullable: true, type: Boolean, description: 'null — не отмечен' })
  absent: boolean | null;
  @ApiProperty(RATINGS_SCHEMA) ratings: Record<string, LessonScore>;
}

export class LessonJournalResponseDto {
  @ApiProperty({ type: LessonResponseDto }) lesson: LessonResponseDto;
  @ApiProperty({ type: [ObservationCriterionResponseDto] })
  criteria: ObservationCriterionResponseDto[];
  @ApiProperty({ type: [LessonJournalStudentResponseDto] })
  students: LessonJournalStudentResponseDto[];
}

class StudentLessonRecordResponseDto {
  @ApiProperty() lessonId: string;
  @ApiProperty({ format: 'date' }) date: string;
  @ApiProperty() startTime: string;
  @ApiProperty({ type: NamedRefDto }) discipline: NamedRefDto;
  @ApiProperty({ type: PersonRefDto }) teacher: PersonRefDto;
  @ApiProperty() absent: boolean;
  @ApiProperty(RATINGS_SCHEMA) ratings: Record<string, LessonScore>;
}

class CriterionSummaryResponseDto {
  @ApiProperty() criterionId: string;
  @ApiProperty({ nullable: true, type: Number, description: 'Средняя оценка; null — нет данных' })
  mean: number | null;
  @ApiProperty({ description: 'Число оценок 1–5' }) rated: number;
  @ApiProperty({ description: 'Отметок «Не наблюдалось»' }) notObserved: number;
}

export class StudentLessonJournalResponseDto {
  @ApiProperty({ type: [ObservationCriterionResponseDto] })
  criteria: ObservationCriterionResponseDto[];
  @ApiProperty({ type: [StudentLessonRecordResponseDto] })
  records: StudentLessonRecordResponseDto[];
  @ApiProperty({ type: [CriterionSummaryResponseDto] }) summary: CriterionSummaryResponseDto[];
  @ApiProperty({ description: 'Занятий, на которых студент отмечен' }) lessons: number;
  @ApiProperty() absences: number;
}

class LessonImportResolvedDto {
  @ApiProperty({ format: 'date' }) date: string;
  @ApiProperty() startTime: string;
  @ApiProperty({ type: NamedRefDto }) group: NamedRefDto;
  @ApiProperty({ type: NamedRefDto }) discipline: NamedRefDto;
  @ApiProperty({ type: PersonRefDto }) teacher: PersonRefDto;
}

class LessonImportRowResponseDto extends LessonImportRowInputDto {
  @ApiProperty({ type: LessonImportResolvedDto, nullable: true })
  resolved: LessonImportResolvedDto | null;
  @ApiProperty({ description: 'Занятие уже есть в расписании — строка будет пропущена' })
  duplicate: boolean;
  @ApiProperty({ type: [String] }) errors: string[];
}

export class LessonImportPreviewResponseDto {
  @ApiProperty({ type: [LessonImportRowResponseDto] }) rows: LessonImportRowResponseDto[];
  @ApiProperty() validCount: number;
  @ApiProperty() duplicateCount: number;
  @ApiProperty() invalidCount: number;
  @ApiProperty({ type: [String] }) fileErrors: string[];
}

export class LessonImportResultResponseDto {
  @ApiProperty() created: number;
  @ApiProperty({ description: 'Пропущено: занятия уже были в расписании' }) skipped: number;
  @ApiProperty({ description: 'Повторная отправка: импорт уже выполнен ранее' }) replayed: boolean;
}
