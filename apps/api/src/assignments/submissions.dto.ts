import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ASSESSMENT_COMMENT_MAX,
  AssessmentDecision,
  SUBMISSION_FILES_MAX,
  SUBMISSION_TEXT_MAX,
} from '@iot/shared';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { OptionalText, OptionalUrl, OptionalUuid } from '../common/dto.js';
import { PersonRefDto } from '../disciplines/disciplines.dto.js';
import { GroupRefDto } from '../groups/groups.dto.js';
import { FileResponseDto } from '../library/library.dto.js';
import {
  CabinetAssignmentDetailResponseDto,
  StudentAssignmentResponseDto,
} from './student-assignments.dto.js';

const DECISIONS = Object.values(AssessmentDecision);

// ── Запросы ──

export class SubmitAssignmentDto {
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Ответ текстом' })
  @OptionalText(SUBMISSION_TEXT_MAX)
  text?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Ссылка на работу (http/https)',
  })
  @OptionalUrl()
  url?: string | null;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: `Файлы, загруженные студентом через POST /cabinet/files (не больше ${SUBMISSION_FILES_MAX})`,
  })
  @IsOptional()
  @IsArray({ message: 'Ожидается список файлов' })
  @ArrayMaxSize(SUBMISSION_FILES_MAX, { message: `Не больше ${SUBMISSION_FILES_MAX} файлов` })
  @IsUUID('7', { each: true, message: 'Файл не найден. Загрузите его заново' })
  fileIds?: string[] | null;
}

export class CriterionScoreInputDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('7', { message: 'Неизвестный критерий' })
  criterionId: string;

  @ApiProperty({ minimum: 0, description: 'Балл от 0 до максимума критерия' })
  @Type(() => Number)
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 3 },
    { message: 'Балл — число, не более трёх знаков после запятой' },
  )
  score: number;

  @ApiPropertyOptional({ nullable: true, type: String, description: 'Пояснение по критерию' })
  @OptionalText(ASSESSMENT_COMMENT_MAX)
  comment?: string | null;
}

export class AssessAssignmentDto {
  @ApiProperty({ format: 'uuid', description: 'Проверяемая попытка — последняя отправленная' })
  @IsUUID('7', { message: 'Попытка не найдена' })
  submissionId: string;

  @ApiProperty({ enum: DECISIONS, description: 'Принять или вернуть на доработку (FR-051)' })
  @IsIn(DECISIONS, { message: 'Выберите решение' })
  decision: AssessmentDecision;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Комментарий для студента; обязателен при возврате на доработку',
  })
  @OptionalText(ASSESSMENT_COMMENT_MAX)
  comment?: string | null;

  @ApiPropertyOptional({
    type: [CriterionScoreInputDto],
    description:
      'Баллы по каждому критерию задания — при принятии задания с критериями (FR-052). При возврате не передаются',
  })
  @IsOptional()
  @IsArray({ message: 'Ожидается список оценок' })
  @ArrayMaxSize(50, { message: 'Слишком много оценок' })
  @ValidateNested({ each: true })
  @Type(() => CriterionScoreInputDto)
  criterionScores?: CriterionScoreInputDto[] | null;
}

export class ReviewQueueQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @OptionalUuid('Неизвестная дисциплина')
  disciplineId?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @OptionalUuid('Неизвестная группа')
  groupId?: string | null;
}

// ── Ответы ──

class CriterionScoreResponseDto {
  @ApiProperty() criterionId: string;
  @ApiProperty() title: string;
  @ApiProperty() maxScore: number;
  @ApiProperty() score: number;
  @ApiProperty({ nullable: true, type: String }) comment: string | null;
}

class AssessmentResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: DECISIONS }) decision: AssessmentDecision;
  @ApiProperty({ nullable: true, type: Number, description: 'Сумма баллов по критериям' })
  score: number | null;
  @ApiProperty({ nullable: true, type: Number }) maxScore: number | null;
  @ApiProperty({ nullable: true, type: String, description: 'Комментарий для студента' })
  comment: string | null;
  @ApiProperty({ type: [CriterionScoreResponseDto] }) criterionScores: CriterionScoreResponseDto[];
  @ApiProperty({ type: PersonRefDto, nullable: true }) assessor: PersonRefDto | null;
  @ApiProperty() createdAt: string;
}

class SubmissionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() attemptNumber: number;
  @ApiProperty({ nullable: true, type: String }) text: string | null;
  @ApiProperty({ nullable: true, type: String }) url: string | null;
  @ApiProperty({ type: [FileResponseDto] }) files: FileResponseDto[];
  @ApiProperty() submittedAt: string;
  @ApiProperty({ description: 'Отправлено после срока (FR-053)' }) late: boolean;
  @ApiProperty({ type: AssessmentResponseDto, nullable: true })
  assessment: AssessmentResponseDto | null;
}

export class AssignmentWorkResponseDto extends CabinetAssignmentDetailResponseDto {
  @ApiProperty({ nullable: true, type: String }) completedAt: string | null;
  @ApiProperty({ type: [SubmissionResponseDto], description: 'Попытки сдачи (FR-051)' })
  submissions: SubmissionResponseDto[];
}

class ReviewStudentResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() fullName: string;
  @ApiProperty({ type: GroupRefDto, nullable: true }) group: GroupRefDto | null;
}

export class AssignmentReviewResponseDto extends AssignmentWorkResponseDto {
  @ApiProperty({ type: ReviewStudentResponseDto }) student: ReviewStudentResponseDto;
}

export class ReviewQueueItemResponseDto extends StudentAssignmentResponseDto {
  @ApiProperty({ type: ReviewStudentResponseDto }) student: ReviewStudentResponseDto;
  @ApiProperty() attemptNumber: number;
  @ApiProperty() submittedAt: string;
  @ApiProperty() late: boolean;
}
