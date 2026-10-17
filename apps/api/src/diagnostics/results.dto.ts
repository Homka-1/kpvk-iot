import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  COMPARABILITY_NOTE_MAX,
  DiagnosticExportFormat,
  DiagnosticSource,
  MeasurementType,
  QuestionnaireVersionStatus,
} from '@iot/shared';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { emptyToNull } from '../common/dto.js';
import { PersonRefDto } from '../disciplines/disciplines.dto.js';
import { ScaleResultResponseDto } from './sessions.dto.js';

// ── Запросы ──

export class ApproveComparabilityDto {
  @ApiProperty({ format: 'uuid', description: 'Первая версия методики (опубликованная ранее)' })
  @IsUUID('7', { message: 'Выберите версию' })
  versionAId: string;

  @ApiProperty({ format: 'uuid', description: 'Вторая версия той же методики' })
  @IsUUID('7', { message: 'Выберите версию' })
  versionBId: string;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    maxLength: COMPARABILITY_NOTE_MAX,
    description: 'Обоснование сопоставимости (например, ключи шкал не менялись)',
  })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString({ message: 'Обоснование — текст' })
  @MaxLength(COMPARABILITY_NOTE_MAX, { message: `Не более ${COMPARABILITY_NOTE_MAX} символов` })
  note?: string | null;
}

export class ExportResultsQueryDto {
  @ApiProperty({ format: 'uuid', description: 'Методика' })
  @IsUUID('7', { message: 'Выберите методику' })
  questionnaireId: string;

  @ApiProperty({ enum: Object.values(DiagnosticExportFormat), description: 'Формат файла' })
  @IsIn(Object.values(DiagnosticExportFormat), { message: 'Выберите формат: CSV или XLSX' })
  format: DiagnosticExportFormat;

  @ApiPropertyOptional({
    enum: Object.values(MeasurementType),
    description: 'Только замеры этого типа; не указан — все замеры',
  })
  @IsOptional()
  @Transform(emptyToNull)
  @IsIn(Object.values(MeasurementType), { message: 'Неизвестный тип замера' })
  measurementType?: MeasurementType | null;
}

// ── Ответы ──

class ComparisonMeasurementResponseDto {
  @ApiProperty() sessionId: string;
  @ApiProperty({ enum: Object.values(MeasurementType) }) measurementType: MeasurementType;
  @ApiProperty({ enum: Object.values(DiagnosticSource) }) source: DiagnosticSource;
  @ApiProperty() versionId: string;
  @ApiProperty() versionNumber: number;
  @ApiProperty({ format: 'date-time' }) completedAt: string;
  @ApiProperty({
    type: 'object',
    additionalProperties: { $ref: '#/components/schemas/ScaleResultResponseDto', nullable: true },
    description: 'Результат по коду шкалы; null — шкалы нет в этой версии методики',
  })
  values: Record<string, ScaleResultResponseDto | null>;
}

class ExcludedMeasurementResponseDto {
  @ApiProperty() sessionId: string;
  @ApiProperty({ enum: Object.values(MeasurementType) }) measurementType: MeasurementType;
  @ApiProperty() versionNumber: number;
  @ApiProperty({ format: 'date-time' }) completedAt: string;
  @ApiProperty({ description: 'Почему замер не входит в сравнение' }) reason: string;
}

class ScaleRefResponseDto {
  @ApiProperty() code: string;
  @ApiProperty() name: string;
}

export class DiagnosticComparisonResponseDto {
  @ApiProperty() questionnaireId: string;
  @ApiProperty() title: string;
  @ApiProperty() isDemo: boolean;
  @ApiProperty({ type: [ScaleRefResponseDto], description: 'Шкалы базового замера' })
  scales: ScaleRefResponseDto[];
  @ApiProperty({
    type: [ComparisonMeasurementResponseDto],
    description: 'От ранних к поздним; первый — базовый (первичный) замер',
  })
  measurements: ComparisonMeasurementResponseDto[];
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number', nullable: true },
    description:
      'Изменение по коду шкалы: последний замер минус базовый; null — нет данных (не ноль)',
  })
  changes: Record<string, number | null>;
  @ApiProperty({
    type: [ExcludedMeasurementResponseDto],
    description: 'Замеры по версиям, несопоставимым с версией базового замера',
  })
  excluded: ExcludedMeasurementResponseDto[];
}

class VersionNumberRefDto {
  @ApiProperty() id: string;
  @ApiProperty() versionNumber: number;
}

class ComparabilityResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ type: VersionNumberRefDto, description: 'Более ранняя версия' })
  versionA: VersionNumberRefDto;
  @ApiProperty({ type: VersionNumberRefDto, description: 'Более поздняя версия' })
  versionB: VersionNumberRefDto;
  @ApiProperty({ nullable: true, type: String }) note: string | null;
  @ApiProperty({ format: 'date-time' }) approvedAt: string;
  @ApiProperty({ nullable: true, type: PersonRefDto }) approvedBy: PersonRefDto | null;
}

class ComparabilityVersionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() versionNumber: number;
  @ApiProperty() title: string;
  @ApiProperty({ enum: Object.values(QuestionnaireVersionStatus) })
  status: QuestionnaireVersionStatus;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) publishedAt: string | null;
}

export class ComparabilityQuestionnaireResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty() isDemo: boolean;
  @ApiProperty({
    type: [ComparabilityVersionResponseDto],
    description: 'Опубликованные ранее версии, от новой к старой',
  })
  versions: ComparabilityVersionResponseDto[];
  @ApiProperty({ type: [ComparabilityResponseDto] }) comparabilities: ComparabilityResponseDto[];
}
