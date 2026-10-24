import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GRADE_IMPORT_MAX_ROWS } from '@iot/shared';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { OptionalUuid, RequiredTitle } from '../common/dto.js';
import { PersonRefDto } from '../disciplines/disciplines.dto.js';

// ── Запросы ──

export class GroupGradesQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('7', { message: 'Выберите группу' })
  groupId: string;

  @ApiProperty({ format: 'uuid', description: 'Семестр' })
  @IsUUID('7', { message: 'Выберите семестр' })
  periodId: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Семестр для сравнения' })
  @OptionalUuid('Некорректный семестр для сравнения')
  compareWith?: string | null;
}

export class GradeImportRowInputDto {
  @ApiProperty({ description: 'Номер строки в исходном файле' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  line: number;

  @ApiProperty() @IsString() @MaxLength(300) studentName: string;
  @ApiProperty() @IsString() @MaxLength(200) groupName: string;
  @ApiProperty() @IsString() @MaxLength(50) academicYear: string;
  @ApiProperty() @IsString() @MaxLength(50) semester: string;
  @ApiProperty() @IsString() @MaxLength(200) disciplineName: string;
  @ApiProperty() @IsString() @MaxLength(50) score: string;
}

export class GradeImportCommitDto {
  @ApiProperty({ description: 'Имя исходного файла — для списка загрузок' })
  @RequiredTitle('Не указано имя файла', 255)
  fileName: string;

  @ApiProperty({ type: [GradeImportRowInputDto] })
  @IsArray({ message: 'Нет строк для импорта' })
  @ArrayMinSize(1, { message: 'Нет строк для импорта' })
  @ArrayMaxSize(GRADE_IMPORT_MAX_ROWS, {
    message: `Не более ${GRADE_IMPORT_MAX_ROWS} строк за один импорт`,
  })
  @ValidateNested({ each: true })
  @Type(() => GradeImportRowInputDto)
  rows: GradeImportRowInputDto[];
}

// ── Ответы ──

class NamedRefDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
}

export class AcademicPeriodResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: '2025/2026' }) academicYear: string;
  @ApiProperty({ enum: [1, 2] }) semester: number;
  @ApiProperty({ example: '2025/2026, 1 семестр' }) label: string;
}

export class GradeOptionsResponseDto {
  @ApiProperty({ type: [AcademicPeriodResponseDto], description: 'Сначала последние' })
  periods: AcademicPeriodResponseDto[];
  @ApiProperty({ type: [NamedRefDto] }) groups: NamedRefDto[];
}

class StudentDisciplineGradesResponseDto {
  @ApiProperty({ type: NamedRefDto }) discipline: NamedRefDto;
  @ApiProperty({ type: [Number], description: 'Исходные оценки 0–100 в порядке загрузки' })
  scores: number[];
  @ApiProperty({ description: 'Средний балл по дисциплине, до 0,1' }) mean: number;
}

class StudentSemesterResponseDto {
  @ApiProperty({ type: AcademicPeriodResponseDto }) period: AcademicPeriodResponseDto;
  @ApiProperty({ type: [NamedRefDto] }) groups: NamedRefDto[];
  @ApiProperty({ type: [StudentDisciplineGradesResponseDto] })
  disciplines: StudentDisciplineGradesResponseDto[];
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Общий балл: среднее средних по дисциплинам; null — нет данных',
  })
  overall: number | null;
}

export class StudentGradesResponseDto {
  @ApiProperty({ type: [StudentSemesterResponseDto], description: 'Сначала последний семестр' })
  semesters: StudentSemesterResponseDto[];
}

class GroupGradesStudentResponseDto {
  @ApiProperty({ type: PersonRefDto }) student: PersonRefDto;
  @ApiProperty({ type: Number, nullable: true }) overall: number | null;
  @ApiProperty() disciplineCount: number;
  @ApiProperty({ type: Number, nullable: true }) compareOverall: number | null;
  @ApiProperty({ type: Number, nullable: true, description: 'Разность: выбранный − сравнения' })
  delta: number | null;
}

class GroupGradesDisciplineResponseDto {
  @ApiProperty({ type: NamedRefDto }) discipline: NamedRefDto;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Среднее средних студентов по дисциплине',
  })
  mean: number | null;
  @ApiProperty({ description: 'Студентов с оценками по дисциплине' }) students: number;
  @ApiProperty({ type: Number, nullable: true }) compareMean: number | null;
  @ApiProperty({ type: Number, nullable: true }) delta: number | null;
}

export class GroupGradesResponseDto {
  @ApiProperty({ type: NamedRefDto }) group: NamedRefDto;
  @ApiProperty({ type: AcademicPeriodResponseDto }) period: AcademicPeriodResponseDto;
  @ApiProperty({ type: AcademicPeriodResponseDto, nullable: true })
  comparePeriod: AcademicPeriodResponseDto | null;
  @ApiProperty({ type: Number, nullable: true }) overall: number | null;
  @ApiProperty({ type: Number, nullable: true }) compareOverall: number | null;
  @ApiProperty({ type: Number, nullable: true }) delta: number | null;
  @ApiProperty({ type: [GroupGradesDisciplineResponseDto] })
  disciplines: GroupGradesDisciplineResponseDto[];
  @ApiProperty({ type: [GroupGradesStudentResponseDto] })
  students: GroupGradesStudentResponseDto[];
}

class GradeImportPeriodDto {
  @ApiProperty() academicYear: string;
  @ApiProperty() semester: number;
  @ApiProperty() label: string;
}

class GradeImportResolvedDto {
  @ApiProperty({ type: PersonRefDto }) student: PersonRefDto;
  @ApiProperty({ type: NamedRefDto }) group: NamedRefDto;
  @ApiProperty({ type: GradeImportPeriodDto }) period: GradeImportPeriodDto;
  @ApiProperty({ type: NamedRefDto }) discipline: NamedRefDto;
  @ApiProperty() score: number;
}

class GradeImportRowResponseDto extends GradeImportRowInputDto {
  @ApiProperty({ type: GradeImportResolvedDto, nullable: true })
  resolved: GradeImportResolvedDto | null;
  @ApiProperty({ type: [String] }) errors: string[];
}

class AlreadyImportedDto {
  @ApiProperty() fileName: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}

export class GradeImportPreviewResponseDto {
  @ApiProperty({ type: [GradeImportRowResponseDto] }) rows: GradeImportRowResponseDto[];
  @ApiProperty() validCount: number;
  @ApiProperty() invalidCount: number;
  @ApiProperty({ type: [String] }) fileErrors: string[];
  @ApiProperty({
    type: AlreadyImportedDto,
    nullable: true,
    description: 'Те же оценки уже загружены — импорт будет отклонён',
  })
  alreadyImported: AlreadyImportedDto | null;
}

export class GradeImportResultResponseDto {
  @ApiProperty() importId: string;
  @ApiProperty({ description: 'Загружено оценок' }) created: number;
  @ApiProperty({ description: 'Повторная отправка: импорт уже выполнен ранее' }) replayed: boolean;
}

export class GradeImportResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() fileName: string;
  @ApiProperty() rowCount: number;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ type: PersonRefDto }) author: PersonRefDto;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) cancelledAt: string | null;
  @ApiProperty({ type: [String] }) periods: string[];
  @ApiProperty({ type: [String] }) groups: string[];
  @ApiProperty() canCancel: boolean;
}
