import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CheckpointStatus,
  MeasurementType,
  StageStatus,
  SUPPORT_REASON_MAX,
  SupportStatus,
  TrajectoryStatus,
} from '@iot/shared';
import { Transform } from 'class-transformer';
import { IsIn, IsISO8601, IsOptional } from 'class-validator';
import { emptyToNull, OptionalText, OptionalUuid, RequiredTitle } from '../common/dto.js';
import { GroupRefDto } from '../groups/groups.dto.js';
import { VersionSummaryResponseDto } from '../trajectories/trajectories.dto.js';

function OptionalDate(message: string) {
  return function (target: object, property: string) {
    IsOptional()(target, property);
    Transform(emptyToNull)(target, property);
    IsISO8601({ strict: true }, { message })(target, property);
  };
}

// ── Запросы ──

export class MonitoringPeriodQueryDto {
  @ApiPropertyOptional({ format: 'date', description: 'Начало периода (включительно)' })
  @OptionalDate('Некорректная дата начала периода')
  from?: string | null;

  @ApiPropertyOptional({ format: 'date', description: 'Конец периода (включительно)' })
  @OptionalDate('Некорректная дата окончания периода')
  to?: string | null;
}

export class MonitoringQueryDto extends MonitoringPeriodQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Группа студента (контекст шапки)' })
  @OptionalUuid('Некорректная группа')
  groupId?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @OptionalUuid('Некорректная дисциплина')
  disciplineId?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @OptionalUuid('Некорректный студент')
  studentId?: string | null;

  @ApiPropertyOptional({ description: 'Поиск студента по Ф. И. О. и коду участника' })
  @OptionalText(200)
  q?: string | null;
}

export class SupportStatusInputDto {
  @ApiProperty({ enum: Object.values(SupportStatus) })
  @IsIn(Object.values(SupportStatus), { message: 'Выберите статус сопровождения' })
  supportStatus: SupportStatus;

  @ApiProperty({ description: 'Основание отметки — сохраняется в журнале аудита' })
  @RequiredTitle('Укажите основание', SUPPORT_REASON_MAX)
  reason: string;
}

// ── Ответы ──

class ProgressResponseDto {
  @ApiProperty() total: number;
  @ApiProperty() completed: number;
  @ApiProperty() submitted: number;
  @ApiProperty() returned: number;
  @ApiProperty() inProgress: number;
  @ApiProperty() notStarted: number;
  @ApiProperty() overdue: number;
  @ApiProperty({ nullable: true, type: Number, description: 'Нет заданий — null' })
  percent: number | null;
}

class MonitoringStudentResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() fullName: string;
  @ApiProperty() participantCode: string;
  @ApiProperty({ type: GroupRefDto, nullable: true }) group: GroupRefDto | null;
  @ApiProperty({ enum: Object.values(SupportStatus) }) supportStatus: SupportStatus;
}

class RefResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
}

class StagesCountDto {
  @ApiProperty() total: number;
  @ApiProperty() completed: number;
}

class CheckpointsCountDto {
  @ApiProperty() total: number;
  @ApiProperty() passed: number;
  @ApiProperty() missed: number;
}

class ActivityDto {
  @ApiProperty({ description: 'Отправленные ответы за период' }) submissions: number;
  @ApiProperty({ nullable: true, type: String }) lastSubmissionAt: string | null;
}

class DiagnosticsSummaryDto {
  @ApiProperty({ description: 'Завершённые диагностики за период' }) completed: number;
  @ApiProperty({ nullable: true, type: String }) lastCompletedAt: string | null;
  @ApiProperty({ enum: Object.values(MeasurementType), nullable: true })
  lastMeasurementType: MeasurementType | null;
}

export class MonitoringRowResponseDto {
  @ApiProperty() trajectoryId: string;
  @ApiProperty({ enum: Object.values(TrajectoryStatus) }) status: TrajectoryStatus;
  @ApiProperty() version: number;
  @ApiProperty({ type: MonitoringStudentResponseDto }) student: MonitoringStudentResponseDto;
  @ApiProperty({ type: RefResponseDto }) discipline: RefResponseDto;
  @ApiProperty({ type: ProgressResponseDto }) progress: ProgressResponseDto;
  @ApiProperty({ type: StagesCountDto }) stages: StagesCountDto;
  @ApiProperty({ type: CheckpointsCountDto }) checkpoints: CheckpointsCountDto;
  @ApiProperty({ nullable: true, type: Number, description: 'Средний результат за период, %' })
  averageScore: number | null;
  @ApiProperty() scoredCount: number;
  @ApiProperty({ type: ActivityDto, description: 'Учебная активность (FR-062)' })
  activity: ActivityDto;
  @ApiProperty() helpRequests: number;
  @ApiProperty() corrections: number;
  @ApiProperty({ type: DiagnosticsSummaryDto, description: 'Диагностика — отдельно (FR-062)' })
  diagnostics: DiagnosticsSummaryDto;
}

class WarningStudentDto {
  @ApiProperty() id: string;
  @ApiProperty() fullName: string;
}

export class MonitoringWarningResponseDto {
  @ApiProperty({ enum: ['OVERDUE_ASSIGNMENT', 'MISSED_CHECKPOINT'] })
  kind: 'OVERDUE_ASSIGNMENT' | 'MISSED_CHECKPOINT';
  @ApiProperty() trajectoryId: string;
  @ApiProperty({ type: WarningStudentDto }) student: WarningStudentDto;
  @ApiProperty() discipline: string;
  @ApiProperty({ nullable: true, type: String }) stageTitle: string | null;
  @ApiProperty() title: string;
  @ApiProperty() dueAt: string;
}

class DynamicsPointDto {
  @ApiProperty({ format: 'date' }) weekStart: string;
  @ApiProperty() completedAssignments: number;
  @ApiProperty() submissions: number;
  @ApiProperty({ nullable: true, type: Number }) averageScore: number | null;
}

class SummaryDto {
  @ApiProperty() trajectories: number;
  @ApiProperty({ nullable: true, type: Number }) averageProgress: number | null;
  @ApiProperty() overdueAssignments: number;
  @ApiProperty() missedCheckpoints: number;
  @ApiProperty() needsSupport: number;
  @ApiProperty() needsCorrection: number;
}

class PeriodDto {
  @ApiProperty({ nullable: true, type: String, format: 'date' }) from: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date' }) to: string | null;
}

export class MonitoringResponseDto {
  @ApiProperty({ type: PeriodDto }) period: PeriodDto;
  @ApiProperty({ type: SummaryDto }) summary: SummaryDto;
  @ApiProperty({ type: [MonitoringRowResponseDto] }) rows: MonitoringRowResponseDto[];
  @ApiProperty({ type: [MonitoringWarningResponseDto] }) warnings: MonitoringWarningResponseDto[];
  @ApiProperty({ type: [DynamicsPointDto] }) dynamics: DynamicsPointDto[];
  @ApiProperty({ description: 'Показаны не все маршруты — сузьте фильтр' }) truncated: boolean;
}

class StageCheckpointDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty({ nullable: true, type: String }) description: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date' }) dueDate: string | null;
  @ApiProperty({ enum: Object.values(CheckpointStatus) }) status: CheckpointStatus;
  @ApiProperty({ description: 'Пропущена: дата прошла, а точка не пройдена' }) missed: boolean;
}

class MonitoringStageResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty({ enum: Object.values(StageStatus) }) status: StageStatus;
  @ApiProperty({ nullable: true, type: String, format: 'date' }) startDate: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date' }) endDate: string | null;
  @ApiProperty({ type: ProgressResponseDto }) progress: ProgressResponseDto;
  @ApiProperty({ type: [StageCheckpointDto] }) checkpoints: StageCheckpointDto[];
}

class ResultPointDto {
  @ApiProperty() recordedAt: string;
  @ApiProperty({ nullable: true, type: String }) title: string | null;
  @ApiProperty() score: number;
  @ApiProperty() maxScore: number;
  @ApiProperty() percent: number;
}

export class MonitoringDetailResponseDto {
  @ApiProperty({ type: PeriodDto }) period: PeriodDto;
  @ApiProperty({ type: MonitoringRowResponseDto }) row: MonitoringRowResponseDto;
  @ApiProperty({ type: [MonitoringStageResponseDto] }) stages: MonitoringStageResponseDto[];
  @ApiProperty({ type: [MonitoringWarningResponseDto] }) warnings: MonitoringWarningResponseDto[];
  @ApiProperty({ type: [ResultPointDto] }) results: ResultPointDto[];
  @ApiProperty({ type: [DynamicsPointDto] }) dynamics: DynamicsPointDto[];
  @ApiProperty({ type: [VersionSummaryResponseDto] }) versions: VersionSummaryResponseDto[];
}

export class SupportStatusResponseDto {
  @ApiProperty() studentId: string;
  @ApiProperty({ enum: Object.values(SupportStatus) }) supportStatus: SupportStatus;
}
