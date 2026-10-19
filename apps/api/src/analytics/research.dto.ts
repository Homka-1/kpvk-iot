import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DiagnosticExportFormat,
  MeasurementType,
  RESEARCH_DESCRIPTION_MAX,
  RESEARCH_TITLE_MAX,
  ResearchDataset,
  ResearchGroup,
  ResearchProjectStatus,
} from '@iot/shared';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { emptyToNull, OptionalText, RequiredTitle } from '../common/dto.js';
import { DescriptiveStatsResponseDto } from './analytics.dto.js';

function OptionalDate(message: string) {
  return function (target: object, property: string) {
    IsOptional()(target, property);
    Transform(emptyToNull)(target, property);
    IsISO8601({ strict: true }, { message })(target, property);
  };
}

/** Список в адресе: `a,b` или повторяющийся параметр. */
const toList = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined;
  const items = Array.isArray(value) ? value : String(value).split(',');
  return items.map((item) => String(item).trim()).filter(Boolean);
};

// ── Запросы ──

export class ResearchProjectInputDto {
  @ApiProperty({ maxLength: RESEARCH_TITLE_MAX })
  @RequiredTitle('Укажите название исследования', RESEARCH_TITLE_MAX)
  title: string;

  @ApiPropertyOptional({ nullable: true, maxLength: RESEARCH_DESCRIPTION_MAX })
  @OptionalText(RESEARCH_DESCRIPTION_MAX)
  description?: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'date' })
  @OptionalDate('Некорректная дата начала')
  startsOn?: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'date' })
  @OptionalDate('Некорректная дата окончания')
  endsOn?: string | null;
}

export class ResearchStatusDto {
  @ApiProperty({ enum: Object.values(ResearchProjectStatus) })
  @IsIn(Object.values(ResearchProjectStatus), { message: 'Неизвестный статус исследования' })
  status: ResearchProjectStatus;
}

export class AddParticipantsDto {
  @ApiProperty({ format: 'uuid', description: 'Учебная группа: включаются все её студенты' })
  @IsUUID('7', { message: 'Выберите учебную группу' })
  groupId: string;

  @ApiProperty({ enum: Object.values(ResearchGroup) })
  @IsIn(Object.values(ResearchGroup), { message: 'Выберите группу исследования' })
  group: ResearchGroup;
}

export class CreateMeasurementDto {
  @ApiProperty({ format: 'uuid', description: 'Опубликованная версия методики' })
  @IsUUID('7', { message: 'Выберите версию методики' })
  versionId: string;

  @ApiProperty({ enum: Object.values(MeasurementType) })
  @IsIn(Object.values(MeasurementType), { message: 'Выберите тип замера' })
  measurementType: MeasurementType;

  @ApiProperty({ maxLength: RESEARCH_TITLE_MAX })
  @RequiredTitle('Укажите название замера', RESEARCH_TITLE_MAX)
  title: string;

  @ApiPropertyOptional({ nullable: true, format: 'date', description: 'Начало периода замера' })
  @OptionalDate('Некорректная дата начала')
  startsOn?: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'date', description: 'Конец периода замера' })
  @OptionalDate('Некорректная дата окончания')
  endsOn?: string | null;
}

export class ResearchDataQueryDto {
  @ApiPropertyOptional({
    type: [String],
    description: 'Замеры (id через запятую); по умолчанию — все замеры исследования',
  })
  @IsOptional()
  @Transform(toList)
  @ArrayMaxSize(50)
  @IsUUID('7', { each: true, message: 'Неизвестный замер' })
  measurementIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Шкалы (ключи «методика:код» через запятую); по умолчанию — все шкалы замеров',
  })
  @IsOptional()
  @Transform(toList)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  scaleKeys?: string[];
}

export class ResearchExportQueryDto extends ResearchDataQueryDto {
  @ApiProperty({ enum: Object.values(DiagnosticExportFormat) })
  @IsIn(Object.values(DiagnosticExportFormat), { message: 'Формат файла: csv или xlsx' })
  format: DiagnosticExportFormat;

  @ApiProperty({
    enum: Object.values(ResearchDataset),
    description: 'raw — исходные данные по участникам, aggregate — сводные показатели',
  })
  @IsIn(Object.values(ResearchDataset), { message: 'Набор данных: raw или aggregate' })
  dataset: ResearchDataset;
}

// ── Ответы ──

class ResearchGroupCountsResponseDto {
  @ApiProperty() EXPERIMENTAL: number;
  @ApiProperty() CONTROL: number;
}

export class ResearchProjectResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty({ nullable: true, type: String }) description: string | null;
  @ApiProperty({ enum: Object.values(ResearchProjectStatus) }) status: ResearchProjectStatus;
  @ApiProperty({ nullable: true, type: String, format: 'date' }) startsOn: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date' }) endsOn: string | null;
  @ApiProperty({ type: ResearchGroupCountsResponseDto, description: 'Включённые участники' })
  participants: ResearchGroupCountsResponseDto;
  @ApiProperty() measurements: number;
  @ApiProperty() createdAt: string;
  @ApiProperty() updatedAt: string;
}

class VersionLabelResponseDto {
  @ApiProperty() questionnaireId: string;
  @ApiProperty() versionId: string;
  @ApiProperty() versionNumber: number;
  @ApiProperty() title: string;
  @ApiProperty() isDemo: boolean;
}

export class ResearchMeasurementResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty({ enum: Object.values(MeasurementType) }) measurementType: MeasurementType;
  @ApiProperty({ type: VersionLabelResponseDto }) questionnaire: VersionLabelResponseDto;
  @ApiProperty({ nullable: true, type: String, format: 'date' }) startsOn: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date' }) endsOn: string | null;
  @ApiProperty() createdAt: string;
}

export class ResearchProjectDetailResponseDto extends ResearchProjectResponseDto {
  @ApiProperty({ type: [ResearchMeasurementResponseDto] })
  measurementList: ResearchMeasurementResponseDto[];
  @ApiProperty({ description: 'Можно менять участников, замеры и паспорт' }) editable: boolean;
}

export class ResearchParticipantResponseDto {
  @ApiProperty({ description: 'Код участника исследования' }) code: string;
  @ApiProperty() id: string;
  @ApiProperty({ enum: Object.values(ResearchGroup) }) group: ResearchGroup;
  @ApiProperty({ nullable: true, type: String }) academicGroup: string | null;
  @ApiProperty() includedAt: string;
  @ApiProperty({ nullable: true, type: String }) excludedAt: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Только с разрешением research.personal_data.read; иначе null',
  })
  fullName: string | null;
}

export class ResearchCandidateGroupResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() course: number;
  @ApiProperty() specialty: string;
  @ApiProperty({ description: 'Студентов в группе (без архивных)' }) students: number;
}

export class ResearchAddParticipantsResponseDto {
  @ApiProperty() added: number;
  @ApiProperty({ description: 'Уже участвовали и пропущены' }) skipped: number;
}

class ResearchScaleResponseDto {
  @ApiProperty() key: string;
  @ApiProperty() questionnaireId: string;
  @ApiProperty() questionnaireTitle: string;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
}

class ResearchObservationsResponseDto {
  @ApiProperty({ enum: Object.values(ResearchGroup) }) group: ResearchGroup;
  @ApiProperty() participants: number;
  @ApiProperty() complete: number;
  @ApiProperty() incomplete: number;
}

class ResearchStatsRowResponseDto {
  @ApiProperty() measurementId: string;
  @ApiProperty() scaleKey: string;
  @ApiProperty({ enum: Object.values(ResearchGroup) }) group: ResearchGroup;
  @ApiProperty({ type: DescriptiveStatsResponseDto }) stats: DescriptiveStatsResponseDto;
}

class ResearchChangeRowResponseDto {
  @ApiProperty() scaleKey: string;
  @ApiProperty({ enum: Object.values(ResearchGroup) }) group: ResearchGroup;
  @ApiProperty({ type: DescriptiveStatsResponseDto }) stats: DescriptiveStatsResponseDto;
}

class ResearchChangeResponseDto {
  @ApiProperty() questionnaireId: string;
  @ApiProperty() fromMeasurementId: string;
  @ApiProperty() toMeasurementId: string;
  @ApiProperty() comparable: boolean;
  @ApiProperty({ nullable: true, type: String }) reason: string | null;
  @ApiProperty({ type: [ResearchChangeRowResponseDto] }) rows: ResearchChangeRowResponseDto[];
}

class ResearchParticipantRowResponseDto {
  @ApiProperty() code: string;
  @ApiProperty({ enum: Object.values(ResearchGroup) }) group: ResearchGroup;
  @ApiProperty({
    description:
      'По id замера: { completedAt, versionNumber, scores: { ключ шкалы: балл | null } } или null',
  })
  values: Record<string, unknown>;
  @ApiProperty() complete: boolean;
}

export class ResearchDataResponseDto {
  @ApiProperty({ type: [ResearchMeasurementResponseDto] })
  measurements: ResearchMeasurementResponseDto[];
  @ApiProperty({ type: [ResearchScaleResponseDto] }) scales: ResearchScaleResponseDto[];
  @ApiProperty({ type: [ResearchObservationsResponseDto] })
  observations: ResearchObservationsResponseDto[];
  @ApiProperty({ type: [ResearchStatsRowResponseDto] }) stats: ResearchStatsRowResponseDto[];
  @ApiProperty({ type: [ResearchChangeResponseDto] }) changes: ResearchChangeResponseDto[];
  @ApiProperty() excludedParticipants: number;
  @ApiProperty({ type: [ResearchParticipantRowResponseDto] })
  rows: ResearchParticipantRowResponseDto[];
}
