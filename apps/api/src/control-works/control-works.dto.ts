import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CONTROL_CRITERIA_MAX,
  CONTROL_KINDS,
  CONTROL_MARKS,
  CONTROL_SCORE_MAX,
  CONTROL_SCORE_MIN,
  CONTROL_TOPIC_MAX,
  type ControlKind,
  type ControlMark,
} from '@iot/shared';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { OptionalText, OptionalUuid, RequiredTitle } from '../common/dto.js';
import { PersonRefDto } from '../disciplines/disciplines.dto.js';
import { DescriptiveStatsResponseDto } from '../analytics/analytics.dto.js';

const SCORE_MESSAGE = `Балл — число от ${CONTROL_SCORE_MIN} до ${CONTROL_SCORE_MAX}`;

// ── Запросы ──

export class ControlWorkListQueryDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @OptionalUuid('Некорректная группа')
  groupId?: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @OptionalUuid('Некорректная дисциплина')
  disciplineId?: string | null;

  @ApiPropertyOptional({ enum: CONTROL_KINDS })
  @ValidateIf((_object, value) => value !== undefined && value !== null && value !== '')
  @IsIn(CONTROL_KINDS, { message: 'Неизвестный вид контроля' })
  kind?: ControlKind | null;
}

export class ControlWorkGroupInputDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('7', { message: 'Выберите группу' })
  groupId: string;

  @ApiProperty({ format: 'date', description: 'Дата проведения в группе, YYYY-MM-DD' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Укажите дату проведения' })
  date: string;
}

export class ControlWorkInputDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('7', { message: 'Выберите дисциплину' })
  disciplineId: string;

  @ApiProperty({ description: 'Тема работы', maxLength: CONTROL_TOPIC_MAX })
  @RequiredTitle('Укажите тему', CONTROL_TOPIC_MAX)
  topic: string;

  @ApiProperty({ enum: CONTROL_KINDS })
  @IsIn(CONTROL_KINDS, { message: 'Выберите вид контроля' })
  kind: ControlKind;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Критерии оценивания (рубрика) текстом',
  })
  @OptionalText(CONTROL_CRITERIA_MAX)
  criteria?: string | null;

  @ApiProperty({
    type: [ControlWorkGroupInputDto],
    description: 'Группы, в которых проводится работа: одно задание и рубрика для всех',
  })
  @IsArray({ message: 'Выберите хотя бы одну группу' })
  @ArrayMinSize(1, { message: 'Выберите хотя бы одну группу' })
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ControlWorkGroupInputDto)
  groups: ControlWorkGroupInputDto[];
}

export class ControlResultInputDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('7', { message: 'Неизвестный студент' })
  studentId: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    minimum: CONTROL_SCORE_MIN,
    maximum: CONTROL_SCORE_MAX,
    description: 'Балл 0–100 (до 0,1); null — балла нет',
  })
  @ValidateIf((_object, value) => value !== null)
  @IsNumber({ maxDecimalPlaces: 1 }, { message: SCORE_MESSAGE })
  @Min(CONTROL_SCORE_MIN, { message: SCORE_MESSAGE })
  @Max(CONTROL_SCORE_MAX, { message: SCORE_MESSAGE })
  score: number | null;

  @ApiProperty({
    enum: CONTROL_MARKS,
    nullable: true,
    description: 'Отметка вместо балла; null — отметки нет',
  })
  @ValidateIf((_object, value) => value !== null)
  @IsIn(CONTROL_MARKS, { message: 'Неизвестная отметка' })
  mark: ControlMark | null;
}

export class ControlResultsInputDto {
  @ApiProperty({
    type: [ControlResultInputDto],
    description:
      'Ведомость группы целиком. Студент без балла и отметки или не переданный — «нет данных».',
  })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ControlResultInputDto)
  entries: ControlResultInputDto[];
}

// ── Ответы ──

class NamedRefDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
}

class ControlWorkGroupResponseDto {
  @ApiProperty({ type: NamedRefDto }) group: NamedRefDto;
  @ApiProperty({ format: 'date' }) date: string;
  @ApiProperty({ description: 'Студентов с баллом' }) scored: number;
  @ApiProperty({ type: Number, nullable: true, description: 'Средний балл; null — нет баллов' })
  mean: number | null;
}

export class ControlWorkResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ type: NamedRefDto }) discipline: NamedRefDto;
  @ApiProperty() topic: string;
  @ApiProperty({ enum: CONTROL_KINDS }) kind: ControlKind;
  @ApiProperty({ type: String, nullable: true }) criteria: string | null;
  @ApiProperty({ type: [ControlWorkGroupResponseDto] }) groups: ControlWorkGroupResponseDto[];
  @ApiProperty({ type: PersonRefDto, nullable: true }) author: PersonRefDto | null;
  @ApiProperty() createdAt: string;
  @ApiProperty({ description: 'Можно менять работу и вносить результаты во всех её группах' })
  canEdit: boolean;
}

export class ControlWorkListResponseDto {
  @ApiProperty({ type: [ControlWorkResponseDto] }) items: ControlWorkResponseDto[];
}

class ControlMarksResponseDto {
  @ApiProperty() ABSENT: number;
  @ApiProperty() NOT_SUBMITTED: number;
  @ApiProperty() EXEMPT: number;
}

class ControlWorkGroupStatsResponseDto {
  @ApiProperty({ type: NamedRefDto }) group: NamedRefDto;
  @ApiProperty({ format: 'date' }) date: string;
  @ApiProperty({
    type: DescriptiveStatsResponseDto,
    description: 'Статистики баллов; missing — студенты без балла (отметка или нет данных)',
  })
  stats: DescriptiveStatsResponseDto;
  @ApiProperty({ type: ControlMarksResponseDto }) marks: ControlMarksResponseDto;
  @ApiProperty({ description: 'Студентов без балла и без отметки' }) noData: number;
}

export class ControlWorkDetailResponseDto {
  @ApiProperty({ type: ControlWorkResponseDto }) work: ControlWorkResponseDto;
  @ApiProperty({ type: [ControlWorkGroupStatsResponseDto] })
  groups: ControlWorkGroupStatsResponseDto[];
}

class ControlSheetRowResponseDto {
  @ApiProperty({ type: PersonRefDto }) student: PersonRefDto;
  @ApiProperty({ type: Number, nullable: true }) score: number | null;
  @ApiProperty({ enum: CONTROL_MARKS, nullable: true }) mark: ControlMark | null;
}

export class ControlSheetResponseDto {
  @ApiProperty({ type: ControlWorkResponseDto }) work: ControlWorkResponseDto;
  @ApiProperty({ type: NamedRefDto }) group: NamedRefDto;
  @ApiProperty({ format: 'date' }) date: string;
  @ApiProperty({ type: [ControlSheetRowResponseDto] }) rows: ControlSheetRowResponseDto[];
  @ApiProperty() canEdit: boolean;
}

class ControlImportResolvedDto {
  @ApiProperty({ type: PersonRefDto }) student: PersonRefDto;
  @ApiProperty({ type: Number, nullable: true }) score: number | null;
  @ApiProperty({ enum: CONTROL_MARKS, nullable: true }) mark: ControlMark | null;
}

class ControlImportRowResponseDto {
  @ApiProperty() line: number;
  @ApiProperty() studentName: string;
  @ApiProperty() result: string;
  @ApiProperty({ type: ControlImportResolvedDto, nullable: true })
  resolved: ControlImportResolvedDto | null;
  @ApiProperty({ type: [String] }) errors: string[];
}

export class ControlImportPreviewResponseDto {
  @ApiProperty({ type: [ControlImportRowResponseDto] }) rows: ControlImportRowResponseDto[];
  @ApiProperty() validCount: number;
  @ApiProperty() invalidCount: number;
  @ApiProperty({ type: [String] }) fileErrors: string[];
}

class PairDto {
  @ApiProperty() groupId: string;
  @ApiProperty() disciplineId: string;
}

export class ControlOptionsResponseDto {
  @ApiProperty({ type: [NamedRefDto] }) groups: NamedRefDto[];
  @ApiProperty({ type: [NamedRefDto] }) disciplines: NamedRefDto[];
  @ApiProperty({ type: [PairDto], nullable: true, description: 'null — любые пары' })
  pairs: PairDto[] | null;
}

class StudentControlWorkRefDto {
  @ApiProperty() id: string;
  @ApiProperty() topic: string;
  @ApiProperty({ enum: CONTROL_KINDS }) kind: ControlKind;
  @ApiProperty({ type: NamedRefDto }) discipline: NamedRefDto;
}

class StudentControlResultResponseDto {
  @ApiProperty({ type: StudentControlWorkRefDto }) work: StudentControlWorkRefDto;
  @ApiProperty({ format: 'date' }) date: string;
  @ApiProperty({ type: Number, nullable: true }) score: number | null;
  @ApiProperty({ enum: CONTROL_MARKS, nullable: true }) mark: ControlMark | null;
}

class StudentControlProgressResponseDto {
  @ApiProperty({ type: NamedRefDto }) discipline: NamedRefDto;
  @ApiProperty({ type: Number, nullable: true, description: 'Средний балл входного контроля' })
  entry: number | null;
  @ApiProperty({ type: Number, nullable: true, description: 'Средний балл итогового контроля' })
  final: number | null;
  @ApiProperty({ type: Number, nullable: true, description: 'Итоговый − входной' })
  delta: number | null;
}

export class StudentControlResultsResponseDto {
  @ApiProperty({ type: [StudentControlResultResponseDto] })
  results: StudentControlResultResponseDto[];
  @ApiProperty({ type: [StudentControlProgressResponseDto] })
  progress: StudentControlProgressResponseDto[];
}
