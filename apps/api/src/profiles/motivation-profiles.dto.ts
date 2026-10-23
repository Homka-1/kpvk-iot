import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  MeasurementType,
  MethodologyLevelMethod,
  MotivationLevel,
  MotivationProfileStatus,
  PROFILE_REASON_MAX,
  PROFILE_STUDENT_SUMMARY_MAX,
  STRATEGY_ITEM_MAX,
  ProfileRuleOutcome,
  ScaleMotivationRole,
  STRATEGY_ITEMS_MAX,
} from '@iot/shared';
import { emptyToNull } from '../common/dto.js';
import { PersonRefDto } from '../disciplines/disciplines.dto.js';
import { VersionLabelResponseDto } from '../diagnostics/sessions.dto.js';

const LEVELS = Object.values(MotivationLevel);
const levelProperty = (description: string) =>
  ApiProperty({ enum: LEVELS, nullable: true, description });

const trimEach = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? value.map((item) => (typeof item === 'string' ? item.trim() : item))
    : value;

// ── Запросы ──

export class ProfileDecisionDto {
  @ApiProperty({
    enum: LEVELS,
    description: 'Уровень профиля. Совпадает с предложенным — подтверждение, иначе корректировка',
  })
  @IsIn(LEVELS, { message: 'Выберите уровень' })
  level: MotivationLevel;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Причина корректировки (обязательна, если уровень отличается от предложенного)',
  })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString({ message: 'Укажите причину' })
  @MaxLength(PROFILE_REASON_MAX, { message: `Не более ${PROFILE_REASON_MAX} символов` })
  reason?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Понятная студенту интерпретация профиля (FR-016)',
  })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString({ message: 'Пояснение для студента — текст' })
  @MaxLength(PROFILE_STUDENT_SUMMARY_MAX, {
    message: `Не более ${PROFILE_STUDENT_SUMMARY_MAX} символов`,
  })
  studentSummary?: string | null;
}

export class DistributionQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Группа из рабочего контекста' })
  @IsOptional()
  @IsUUID('7', { message: 'Неизвестная группа' })
  groupId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Дисциплина из рабочего контекста' })
  @IsOptional()
  @IsUUID('7', { message: 'Неизвестная дисциплина' })
  disciplineId?: string;
}

const strategyItems = (level: string) => {
  const decorators = [
    ApiProperty({ type: [String], description: `Стратегии сопровождения: ${level}` }),
    Transform(trimEach),
    IsArray({ message: 'Нужен список пунктов' }),
    ArrayMinSize(1, { message: 'Нужен хотя бы один пункт' }),
    ArrayMaxSize(STRATEGY_ITEMS_MAX, { message: `Не более ${STRATEGY_ITEMS_MAX} пунктов` }),
    IsString({ each: true, message: 'Пункт — текст' }),
    IsNotEmpty({ each: true, message: 'Пустой пункт' }),
    MaxLength(STRATEGY_ITEM_MAX, {
      each: true,
      message: `Пункт — не более ${STRATEGY_ITEM_MAX} символов`,
    }),
  ];
  return (target: object, key: string) => decorators.forEach((decorate) => decorate(target, key));
};

export class MotivationStrategiesBodyDto {
  @strategyItems('высокий уровень') HIGH: string[];
  @strategyItems('средний уровень') MEDIUM: string[];
  @strategyItems('низкий уровень') LOW: string[];
}

// ── Ответы ──

class BasisItemResponseDto {
  @ApiProperty() sessionId: string;
  @ApiProperty({ type: VersionLabelResponseDto }) questionnaire: VersionLabelResponseDto;
  @ApiProperty({ enum: Object.values(MeasurementType) }) measurementType: MeasurementType;
  @ApiProperty({ format: 'date-time' }) completedAt: string;
  @ApiProperty() scaleCode: string;
  @ApiProperty() scaleName: string;
  @ApiProperty({ nullable: true, type: Number, description: 'null — нет данных (пропуски)' })
  rawScore: number | null;
  @ApiProperty({ nullable: true, type: String }) levelLabel: string | null;
  @ApiProperty({ nullable: true, type: String }) description: string | null;
  @ApiProperty({ nullable: true, type: String }) studentText: string | null;
  @levelProperty(
    'Вклад показателя в профиль по прежнему правилу (голосование шкал); null — не определяет профиль',
  )
  motivationLevel: MotivationLevel | null;
  @ApiPropertyOptional({
    enum: Object.values(ScaleMotivationRole),
    description: 'Роль шкалы в профиле (правило этапа 24); нет поля — прежнее правило',
  })
  motivationRole?: ScaleMotivationRole;
}

class MethodologyLevelResponseDto {
  @ApiProperty() sessionId: string;
  @ApiProperty({ type: VersionLabelResponseDto }) questionnaire: VersionLabelResponseDto;
  @ApiProperty({ enum: Object.values(MeasurementType) }) measurementType: MeasurementType;
  @ApiProperty({ format: 'date-time' }) completedAt: string;
  @ApiProperty({
    enum: Object.values(MethodologyLevelMethod),
    description:
      'INTRINSIC_MEAN — среднее внутренних шкал (≥ 4,0 высокий, 3,0–3,9 средний, < 3,0 низкий); INTRINSIC_PERCENT — процент от максимума внутренних шкал (≥ 67 % высокий, 34–66 % средний, < 34 % низкий)',
  })
  method: MethodologyLevelMethod;
  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Среднее (до 0,1) или процент (целый) внутренних шкал; null — нет данных',
  })
  intrinsic: number | null;
  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'То же для внешних шкал; null — внешних шкал нет или нет данных',
  })
  extrinsic: number | null;
  @levelProperty('Уровень методики; null — не определён') level: MotivationLevel | null;
  @ApiProperty({ description: 'Внешняя мотивация выше внутренней — предупреждение преподавателю' })
  extrinsicPrevails: boolean;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Почему уровень методики не определён',
  })
  reason: string | null;
}

class LevelCountsResponseDto {
  @ApiProperty() HIGH: number;
  @ApiProperty() MEDIUM: number;
  @ApiProperty() LOW: number;
}

class BasisResponseDto {
  @ApiPropertyOptional({
    enum: ['SCALE_VOTES', 'METHODOLOGIES'],
    description:
      'SCALE_VOTES — прежнее правило (голосование шкал); METHODOLOGIES — уровни методик по внутренним шкалам и их сведение. Нет поля — профиль сформирован до этапа 24 (прежнее правило).',
  })
  rule?: 'SCALE_VOTES' | 'METHODOLOGIES';
  @ApiProperty() minScales: number;
  @ApiProperty({ type: [BasisItemResponseDto] }) items: BasisItemResponseDto[];
  @ApiProperty({ type: LevelCountsResponseDto }) counts: LevelCountsResponseDto;
  @ApiProperty({ nullable: true, type: String, description: 'Почему уровень не предложен' })
  reason: string | null;
  @ApiPropertyOptional({ type: [MethodologyLevelResponseDto] })
  methodologies?: MethodologyLevelResponseDto[];
  @ApiPropertyOptional({
    enum: Object.values(ProfileRuleOutcome),
    description:
      'Итог сведения: совпали; разница в одну ступень (более низкий); высокий и низкий (требуется дополнительная диагностика); одна методика (недостаточно данных); нет данных',
  })
  outcome?: ProfileRuleOutcome;
  @ApiPropertyOptional({ description: 'Как получен итог (FR-028)' }) explanation?: string;
}

export class MotivationProfileResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() studentId: string;
  @ApiProperty({ enum: Object.values(MotivationProfileStatus) }) status: MotivationProfileStatus;
  @levelProperty('Предложен системой; null — данных недостаточно')
  proposedLevel: MotivationLevel | null;
  @levelProperty('Утверждён преподавателем; null — решения нет') level: MotivationLevel | null;
  @ApiProperty({ nullable: true, type: BasisResponseDto, description: 'Основания (FR-028)' })
  basis: BasisResponseDto | null;
  @ApiProperty({ nullable: true, type: String }) correctionReason: string | null;
  @ApiProperty({ nullable: true, type: String }) studentSummary: string | null;
  @ApiProperty({ nullable: true, type: PersonRefDto }) decidedBy: PersonRefDto | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) decidedAt: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}

class ProfileHistoryResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() profileId: string;
  @ApiProperty({ enum: Object.values(MotivationProfileStatus) }) status: MotivationProfileStatus;
  @levelProperty('Уровень до изменения') fromLevel: MotivationLevel | null;
  @levelProperty('Уровень после изменения') toLevel: MotivationLevel | null;
  @ApiProperty({ nullable: true, type: String }) reason: string | null;
  @ApiProperty({ nullable: true, type: PersonRefDto }) changedBy: PersonRefDto | null;
  @ApiProperty({ format: 'date-time' }) at: string;
}

export class StudentMotivationResponseDto {
  @ApiProperty({ nullable: true, type: MotivationProfileResponseDto })
  current: MotivationProfileResponseDto | null;
  @ApiProperty({ nullable: true, type: MotivationProfileResponseDto })
  lastDecided: MotivationProfileResponseDto | null;
  @ApiProperty({ type: [ProfileHistoryResponseDto], description: 'История изменений (FR-032)' })
  history: ProfileHistoryResponseDto[];
}

export class ProfileDistributionResponseDto {
  @ApiProperty({ description: 'Действующие студенты в доступной области' }) total: number;
  @ApiProperty() HIGH: number;
  @ApiProperty() MEDIUM: number;
  @ApiProperty() LOW: number;
  @ApiProperty({ description: 'Предложен системой, ждёт решения' }) PROPOSED: number;
  @ApiProperty() NEEDS_MORE_DIAGNOSTICS: number;
  @ApiProperty({ description: 'Профиль не формировался' }) NONE: number;
}

export class MotivationStrategiesResponseDto {
  @ApiProperty({ type: [String] }) HIGH: string[];
  @ApiProperty({ type: [String] }) MEDIUM: string[];
  @ApiProperty({ type: [String] }) LOW: string[];
}
