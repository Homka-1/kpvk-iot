import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AssignmentStatus,
  DashboardPeriod,
  type DashboardActivityKind,
  type DashboardUpcomingKind,
  StageStatus,
} from '@iot/shared';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import { emptyToNull, OptionalUuid } from '../common/dto.js';

// ── Запрос ──

export class DashboardQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Группа из шапки (FR-004)' })
  @OptionalUuid('Неизвестная группа')
  groupId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', description: 'Дисциплина из шапки (FR-004)' })
  @OptionalUuid('Неизвестная дисциплина')
  disciplineId?: string | null;

  @ApiPropertyOptional({
    enum: Object.values(DashboardPeriod),
    default: DashboardPeriod.ACADEMIC_YEAR,
    description: 'Период наблюдения (FR-004): ограничивает маршруты, задания и активность',
  })
  @IsOptional()
  @Transform(emptyToNull)
  @IsIn([...Object.values(DashboardPeriod), null], { message: 'Неизвестный период' })
  period?: DashboardPeriod | null;
}

// ── Ответ ──

const NULLABLE_COUNT = { nullable: true, type: Number, description: 'Нет данных — null' };

class DashboardCardsResponseDto {
  @ApiProperty(NULLABLE_COUNT) students: number | null;
  @ApiProperty(NULLABLE_COUNT) activeTrajectories: number | null;
  @ApiProperty(NULLABLE_COUNT) averageProgress: number | null;
  @ApiProperty(NULLABLE_COUNT) toReview: number | null;
  @ApiProperty(NULLABLE_COUNT) overdueAssignments: number | null;
  @ApiProperty(NULLABLE_COUNT) needsAttention: number | null;
}

class StageCountsResponseDto {
  @ApiProperty() NOT_STARTED: number;
  @ApiProperty() IN_PROGRESS: number;
  @ApiProperty() COMPLETED: number;
}

class DashboardStageBarResponseDto {
  @ApiProperty({ description: 'Номер этапа в маршруте, с 1' }) position: number;
  @ApiProperty({
    type: StageCountsResponseDto,
    description: `Маршруты по статусу этапа: ${Object.values(StageStatus).join(', ')}`,
  })
  counts: StageCountsResponseDto;
}

class DashboardStudentRefDto {
  @ApiProperty() id: string;
  @ApiProperty() fullName: string;
}

class DashboardRecentAssignmentResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty({ enum: Object.values(AssignmentStatus) }) status: AssignmentStatus;
  @ApiProperty() assignedAt: string;
  @ApiProperty({ nullable: true, type: String }) dueAt: string | null;
  @ApiProperty({ type: DashboardStudentRefDto }) student: DashboardStudentRefDto;
  @ApiProperty() discipline: string;
}

const ACTIVITY_KINDS: DashboardActivityKind[] = [
  'SUBMISSION',
  'DIAGNOSTIC',
  'QUESTION',
  'DIFFICULTY_REPORT',
  'CONSULTATION_REQUEST',
  'REFLECTION',
];

class DashboardActivityResponseDto {
  @ApiProperty({ enum: ACTIVITY_KINDS }) kind: DashboardActivityKind;
  @ApiProperty() at: string;
  @ApiProperty({ type: DashboardStudentRefDto }) student: DashboardStudentRefDto;
  @ApiProperty({ nullable: true, type: String }) title: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'Назначение для перехода к проверке' })
  reviewId: string | null;
  @ApiProperty({ description: 'Обращение ещё не рассмотрено' }) open: boolean;
}

const UPCOMING_KINDS: DashboardUpcomingKind[] = ['CHECKPOINT', 'CONSULTATION'];

class DashboardUpcomingResponseDto {
  @ApiProperty({ enum: UPCOMING_KINDS }) kind: DashboardUpcomingKind;
  @ApiProperty() id: string;
  @ApiProperty({ description: 'Дата YYYY-MM-DD (контрольная точка) или момент ISO (консультация)' })
  date: string;
  @ApiProperty() title: string;
  @ApiProperty({ nullable: true, type: String }) stageTitle: string | null;
  @ApiProperty({ nullable: true, type: String }) trajectoryId: string | null;
  @ApiProperty({ type: DashboardStudentRefDto }) student: DashboardStudentRefDto;
  @ApiProperty({ nullable: true, type: String }) discipline: string | null;
}

class DashboardPeriodResponseDto {
  @ApiProperty({ nullable: true, type: String, format: 'date' }) from: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date' }) to: string | null;
}

class ProfileDistributionResponseDto {
  @ApiProperty() total: number;
  @ApiProperty() HIGH: number;
  @ApiProperty() MEDIUM: number;
  @ApiProperty() LOW: number;
  @ApiProperty() PROPOSED: number;
  @ApiProperty() NEEDS_MORE_DIAGNOSTICS: number;
  @ApiProperty() NONE: number;
}

export class DashboardResponseDto {
  @ApiProperty({ type: DashboardPeriodResponseDto }) period: DashboardPeriodResponseDto;
  @ApiProperty({ type: DashboardCardsResponseDto }) cards: DashboardCardsResponseDto;
  @ApiProperty({ type: [DashboardStageBarResponseDto] }) stages: DashboardStageBarResponseDto[];
  @ApiProperty({ type: ProfileDistributionResponseDto }) profiles: ProfileDistributionResponseDto;
  @ApiProperty({ type: [DashboardRecentAssignmentResponseDto] })
  recentAssignments: DashboardRecentAssignmentResponseDto[];
  @ApiProperty({ type: [DashboardActivityResponseDto] }) activity: DashboardActivityResponseDto[];
  @ApiProperty({ type: [DashboardUpcomingResponseDto] }) upcoming: DashboardUpcomingResponseDto[];
}
