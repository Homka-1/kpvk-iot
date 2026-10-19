import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MeasurementType, TrajectoryStatus } from '@iot/shared';
import { OptionalUuid } from '../common/dto.js';
import { DashboardQueryDto } from '../dashboard/dashboard.dto.js';
import { GroupRefDto } from '../groups/groups.dto.js';

// ── Запрос ──

export class AnalyticsQueryDto extends DashboardQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Версия методики для динамики мотивации; по умолчанию — первая из версий с прохождениями',
  })
  @OptionalUuid('Неизвестная версия методики')
  versionId?: string | null;
}

// ── Ответ ──

const NULLABLE_NUMBER = { nullable: true, type: Number, description: 'Нет значений — null' };

export class DescriptiveStatsResponseDto {
  @ApiProperty({ description: 'Наблюдений со значением' }) n: number;
  @ApiProperty({ description: 'Наблюдений без значения: в расчёт не входят (FR-073, FR-074)' })
  missing: number;
  @ApiProperty(NULLABLE_NUMBER) mean: number | null;
  @ApiProperty(NULLABLE_NUMBER) median: number | null;
  @ApiProperty({ ...NULLABLE_NUMBER, description: 'Выборочное (n − 1); при n < 2 — null' })
  sd: number | null;
  @ApiProperty(NULLABLE_NUMBER) min: number | null;
  @ApiProperty({ ...NULLABLE_NUMBER, description: 'Нижний квартиль (линейная интерполяция)' })
  q1: number | null;
  @ApiProperty({ ...NULLABLE_NUMBER, description: 'Верхний квартиль (линейная интерполяция)' })
  q3: number | null;
  @ApiProperty(NULLABLE_NUMBER) max: number | null;
}

class GroupStatsResponseDto {
  @ApiProperty({ type: GroupRefDto }) group: GroupRefDto;
  @ApiProperty({ type: DescriptiveStatsResponseDto }) stats: DescriptiveStatsResponseDto;
}

class GroupComparisonResponseDto {
  @ApiProperty({ type: DescriptiveStatsResponseDto }) total: DescriptiveStatsResponseDto;
  @ApiProperty({ type: [GroupStatsResponseDto] }) groups: GroupStatsResponseDto[];
}

class TrajectoryAnalyticsResponseDto {
  @ApiProperty({
    description: `Маршруты по статусам (${Object.values(TrajectoryStatus).join(', ')})`,
    additionalProperties: { type: 'number' },
  })
  statuses: Record<string, number>;
  @ApiProperty({ type: GroupComparisonResponseDto, description: 'Прогресс по заданиям, %' })
  progress: GroupComparisonResponseDto;
  @ApiProperty({ type: GroupComparisonResponseDto, description: 'Завершённые этапы, %' })
  stagesCompleted: GroupComparisonResponseDto;
}

class AcademicAnalyticsResponseDto {
  @ApiProperty({ type: GroupComparisonResponseDto, description: 'Средний результат ИОТ, %' })
  averageScore: GroupComparisonResponseDto;
}

class DynamicsPointResponseDto {
  @ApiProperty({ format: 'date', description: 'Понедельник недели' }) weekStart: string;
  @ApiProperty() completedAssignments: number;
  @ApiProperty() submissions: number;
  @ApiProperty(NULLABLE_NUMBER) averageScore: number | null;
}

class ActivityAnalyticsResponseDto {
  @ApiProperty({ type: GroupComparisonResponseDto, description: 'Отправленные ответы на ИОТ' })
  submissions: GroupComparisonResponseDto;
  @ApiProperty({ type: GroupComparisonResponseDto, description: 'Обращения за помощью на ИОТ' })
  helpRequests: GroupComparisonResponseDto;
}

class DistributionResponseDto {
  @ApiProperty() total: number;
  @ApiProperty() HIGH: number;
  @ApiProperty() MEDIUM: number;
  @ApiProperty() LOW: number;
  @ApiProperty() PROPOSED: number;
  @ApiProperty() NEEDS_MORE_DIAGNOSTICS: number;
  @ApiProperty() NONE: number;
}

class GroupDistributionResponseDto {
  @ApiProperty({ type: GroupRefDto }) group: GroupRefDto;
  @ApiProperty({ type: DistributionResponseDto }) distribution: DistributionResponseDto;
}

class ProfilesAnalyticsResponseDto {
  @ApiProperty({ type: DistributionResponseDto }) total: DistributionResponseDto;
  @ApiProperty({ type: [GroupDistributionResponseDto] }) groups: GroupDistributionResponseDto[];
}

class AssignmentEffectivenessResponseDto {
  @ApiProperty() assignmentId: string;
  @ApiProperty() title: string;
  @ApiProperty() discipline: string;
  @ApiProperty() assigned: number;
  @ApiProperty() submitted: number;
  @ApiProperty() completed: number;
  @ApiProperty() returned: number;
  @ApiProperty({ type: DescriptiveStatsResponseDto, description: 'Результат принятых, %' })
  score: DescriptiveStatsResponseDto;
}

class QuestionnaireOptionResponseDto {
  @ApiProperty() versionId: string;
  @ApiProperty() questionnaireId: string;
  @ApiProperty() title: string;
  @ApiProperty() versionNumber: number;
  @ApiProperty() isDemo: boolean;
}

class SelectedQuestionnaireResponseDto extends QuestionnaireOptionResponseDto {
  @ApiProperty({ type: [Number], description: 'Утверждённые сопоставимые версии (FR-072)' })
  comparableVersions: number[];
}

class MeasurementStatsResponseDto {
  @ApiProperty({ enum: Object.values(MeasurementType) }) measurementType: MeasurementType;
  @ApiProperty({ type: DescriptiveStatsResponseDto }) stats: DescriptiveStatsResponseDto;
}

class MotivationScaleResponseDto {
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty({ type: [MeasurementStatsResponseDto] })
  measurements: MeasurementStatsResponseDto[];
  @ApiProperty({
    type: DescriptiveStatsResponseDto,
    nullable: true,
    description: 'Изменение «повторный − первичный»; повторных замеров нет — null',
  })
  change: DescriptiveStatsResponseDto | null;
}

class MotivationAnalyticsResponseDto {
  @ApiProperty({ type: [QuestionnaireOptionResponseDto] })
  options: QuestionnaireOptionResponseDto[];
  @ApiProperty({ type: SelectedQuestionnaireResponseDto, nullable: true })
  selected: SelectedQuestionnaireResponseDto | null;
  @ApiProperty() completed: number;
  @ApiProperty({ description: 'Незавершённые прохождения, исключённые из расчёта (FR-073)' })
  incomplete: number;
  @ApiProperty({ type: [MotivationScaleResponseDto] }) scales: MotivationScaleResponseDto[];
}

class PeriodResponseDto {
  @ApiProperty({ nullable: true, type: String, format: 'date' }) from: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date' }) to: string | null;
}

export class AnalyticsResponseDto {
  @ApiProperty({ type: PeriodResponseDto }) period: PeriodResponseDto;
  @ApiProperty({ type: TrajectoryAnalyticsResponseDto })
  trajectories: TrajectoryAnalyticsResponseDto;
  @ApiProperty({ type: AcademicAnalyticsResponseDto }) academic: AcademicAnalyticsResponseDto;
  @ApiProperty({ type: ActivityAnalyticsResponseDto }) activity: ActivityAnalyticsResponseDto;
  @ApiProperty({ type: [DynamicsPointResponseDto], description: 'Динамика по неделям (FR-059)' })
  dynamics: DynamicsPointResponseDto[];
  @ApiProperty({ type: ProfilesAnalyticsResponseDto }) profiles: ProfilesAnalyticsResponseDto;
  @ApiProperty({ type: [AssignmentEffectivenessResponseDto] })
  assignments: AssignmentEffectivenessResponseDto[];
  @ApiProperty({ type: MotivationAnalyticsResponseDto }) motivation: MotivationAnalyticsResponseDto;
  @ApiProperty() truncated: boolean;
}
