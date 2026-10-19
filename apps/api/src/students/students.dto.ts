import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  LOGIN_PATTERN,
  MotivationLevel,
  MotivationProfileStatus,
  PARTICIPANT_CODE_HINT,
  PARTICIPANT_CODE_PATTERN,
  PROFILE_FILTER_VALUES,
  type ProfileFilterValue,
  STUDENT_IMPORT_MAX_ROWS,
  SupportStatus,
  TrajectoryStatus,
} from '@iot/shared';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { emptyToNull, ReasonDto, trim } from '../common/dto.js';
import { GroupRefDto } from '../groups/groups.dto.js';
import { RefDto } from '../disciplines/disciplines.dto.js';

const LOGIN_HINT = 'Логин: 3–64 символа, латинские буквы, цифры, точка, дефис, подчёркивание';

const upperOrNull = ({ value }: { value: unknown }) => {
  const result = emptyToNull({ value });
  return typeof result === 'string' ? result.toUpperCase() : result;
};
const lowerOrNull = ({ value }: { value: unknown }) => {
  const result = emptyToNull({ value });
  return typeof result === 'string' ? result.toLowerCase() : result;
};
const optionalBoolean = ({ value }: { value: unknown }) => {
  if (value === undefined || value === '') return undefined;
  return value === true || value === 'true' || value === '1';
};

export class StudentListQueryDto {
  @ApiPropertyOptional({ description: 'Поиск по фамилии, имени, коду участника и группе (FR-007)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('7', { message: 'Неизвестная группа' })
  groupId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Студенты групп, где ведётся дисциплина' })
  @IsOptional()
  @IsUUID('7', { message: 'Неизвестная дисциплина' })
  disciplineId?: string;

  @ApiPropertyOptional({
    enum: PROFILE_FILTER_VALUES,
    description:
      'Текущий мотивационный профиль (FR-008): утверждённый уровень, PROPOSED — ждёт решения преподавателя',
  })
  @IsOptional()
  @IsIn(PROFILE_FILTER_VALUES, { message: 'Неизвестное значение профиля' })
  profile?: ProfileFilterValue;

  @ApiPropertyOptional({
    enum: Object.values(TrajectoryStatus),
    description: 'Статус ИОТ (FR-008)',
  })
  @IsOptional()
  @IsIn(Object.values(TrajectoryStatus), { message: 'Неизвестный статус ИОТ' })
  trajectoryStatus?: TrajectoryStatus;

  @ApiPropertyOptional({ description: 'Есть нерешённые сообщения о затруднениях (FR-008)' })
  @IsOptional()
  @Transform(optionalBoolean)
  @IsBoolean()
  hasDifficulties?: boolean;

  @ApiPropertyOptional({
    description:
      'Требуют внимания (FR-003, главная панель): отметка о сопровождении или нерассмотренное сообщение о затруднении',
  })
  @IsOptional()
  @Transform(optionalBoolean)
  @IsBoolean()
  needsAttention?: boolean;

  @ApiPropertyOptional({
    description: 'Показать архив вместо действующих студентов',
    default: false,
  })
  @IsOptional()
  @Transform(optionalBoolean)
  @IsBoolean()
  archived = false;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

export class StudentNameDto {
  @ApiProperty({ example: 'Петров' })
  @Transform(trim)
  @IsString({ message: 'Укажите фамилию' })
  @IsNotEmpty({ message: 'Укажите фамилию' })
  @MaxLength(100, { message: 'Не более 100 символов' })
  lastName: string;

  @ApiProperty({ example: 'Иван' })
  @Transform(trim)
  @IsString({ message: 'Укажите имя' })
  @IsNotEmpty({ message: 'Укажите имя' })
  @MaxLength(100, { message: 'Не более 100 символов' })
  firstName: string;

  @ApiPropertyOptional({ nullable: true, type: String, example: 'Сергеевич' })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(100, { message: 'Не более 100 символов' })
  middleName?: string | null;
}

class StudentAccountFieldsDto extends StudentNameDto {
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    example: 'P-0142',
    description: 'Код участника; если не указан, формируется автоматически',
  })
  @IsOptional()
  @Transform(upperOrNull)
  @Matches(PARTICIPANT_CODE_PATTERN, { message: PARTICIPANT_CODE_HINT })
  participantCode?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Логин; если не указан, совпадает с кодом участника в нижнем регистре',
  })
  @IsOptional()
  @Transform(lowerOrNull)
  @Matches(LOGIN_PATTERN, { message: LOGIN_HINT })
  login?: string | null;
}

export class CreateStudentDto extends StudentAccountFieldsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('7', { message: 'Выберите группу' })
  groupId: string;
}

export class UpdateStudentDto extends StudentNameDto {}

export class TransferStudentDto extends ReasonDto {
  @ApiProperty({ format: 'uuid', description: 'Новая группа' })
  @IsUUID('7', { message: 'Выберите группу' })
  groupId: string;
}

/** Строка импорта, подтверждённая после предпросмотра. Поля проверяются сервисом с понятными ошибками. */
export class ImportRowInputDto {
  @ApiProperty({ description: 'Номер строки в исходном файле' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  line: number;

  @ApiProperty() @IsString() @MaxLength(200) lastName: string;
  @ApiProperty() @IsString() @MaxLength(200) firstName: string;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  middleName?: string | null;
  @ApiProperty() @IsString() @MaxLength(200) groupName: string;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  participantCode?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  login?: string | null;
}

export class ImportCommitDto {
  @ApiProperty({ type: [ImportRowInputDto] })
  @IsArray({ message: 'Нет строк для импорта' })
  @ArrayMinSize(1, { message: 'Нет строк для импорта' })
  @ArrayMaxSize(STUDENT_IMPORT_MAX_ROWS, {
    message: `Не более ${STUDENT_IMPORT_MAX_ROWS} строк за один импорт`,
  })
  @ValidateNested({ each: true })
  @Type(() => ImportRowInputDto)
  rows: ImportRowInputDto[];
}

// ── Ответы ──

class StudentProfileRefDto {
  @ApiProperty({ enum: Object.values(MotivationProfileStatus) }) status: MotivationProfileStatus;
  @ApiProperty({
    enum: Object.values(MotivationLevel),
    nullable: true,
    description: 'Уровень, утверждённый преподавателем',
  })
  level: MotivationLevel | null;
  @ApiProperty({
    enum: Object.values(MotivationLevel),
    nullable: true,
    description: 'Уровень, предложенный системой',
  })
  proposedLevel: MotivationLevel | null;
}

class StudentTrajectoryRefDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: Object.values(TrajectoryStatus) }) status: TrajectoryStatus;
  @ApiProperty() disciplineName: string;
  @ApiProperty({ nullable: true, type: Number }) progress: number | null;
}

export class StudentSummaryResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() participantCode: string;
  @ApiProperty() lastName: string;
  @ApiProperty() firstName: string;
  @ApiProperty({ nullable: true, type: String }) middleName: string | null;
  @ApiProperty({ nullable: true, type: String }) login: string | null;
  @ApiProperty({ nullable: true, type: GroupRefDto }) group: GroupRefDto | null;
  @ApiProperty({ enum: Object.values(SupportStatus) }) supportStatus: SupportStatus;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) archivedAt: string | null;
  @ApiProperty({ nullable: true, type: StudentProfileRefDto, description: 'null — нет данных' })
  motivationProfile: StudentProfileRefDto | null;
  @ApiProperty({ nullable: true, type: StudentTrajectoryRefDto, description: 'null — нет ИОТ' })
  currentTrajectory: StudentTrajectoryRefDto | null;
  @ApiProperty({ nullable: true, type: Number, description: 'null — нет данных' })
  averageScore: number | null;
  @ApiProperty({ nullable: true, type: Number, description: 'null — нет данных' })
  completedAssignments: number | null;
  @ApiProperty({
    nullable: true,
    type: String,
    format: 'date-time',
    description: 'null — нет данных',
  })
  lastActivityAt: string | null;
}

export class StudentPageResponseDto {
  @ApiProperty({ type: [StudentSummaryResponseDto] }) items: StudentSummaryResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() pageSize: number;
}

class EnrollmentResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ type: RefDto }) group: RefDto;
  @ApiProperty({ format: 'date-time' }) startsAt: string;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) endsAt: string | null;
  @ApiProperty({ nullable: true, type: String }) reason: string | null;
}

export class StudentDetailsResponseDto extends StudentSummaryResponseDto {
  @ApiProperty({ nullable: true, type: String }) archiveReason: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ type: [EnrollmentResponseDto], description: 'История групп (FR-010)' })
  enrollments: EnrollmentResponseDto[];
}

export class StudentCreatedResponseDto {
  @ApiProperty({ type: StudentDetailsResponseDto }) student: StudentDetailsResponseDto;
  @ApiProperty() login: string;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Временный пароль, показывается один раз; при повторной отправке — null',
  })
  temporaryPassword: string | null;
}

class ImportRowResponseDto {
  @ApiProperty() line: number;
  @ApiProperty() lastName: string;
  @ApiProperty() firstName: string;
  @ApiProperty({ nullable: true, type: String }) middleName: string | null;
  @ApiProperty() groupName: string;
  @ApiProperty({ nullable: true, type: String }) participantCode: string | null;
  @ApiProperty({ nullable: true, type: String }) login: string | null;
  @ApiProperty({ type: [String], description: 'Пустой список — строка готова к импорту' })
  errors: string[];
}

export class ImportPreviewResponseDto {
  @ApiProperty({ type: [ImportRowResponseDto] }) rows: ImportRowResponseDto[];
  @ApiProperty() validCount: number;
  @ApiProperty() invalidCount: number;
  @ApiProperty({ type: [String] }) fileErrors: string[];
}

export class ImportResultResponseDto {
  @ApiProperty({ type: [StudentCreatedResponseDto] }) created: StudentCreatedResponseDto[];
  @ApiProperty({ description: 'Повторная отправка: новых записей не создано' }) replayed: boolean;
}

export class StudentPasswordResponseDto {
  @ApiProperty() login: string;
  @ApiProperty({ description: 'Временный пароль; показывается один раз' })
  temporaryPassword: string;
}
