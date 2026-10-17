import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { emptyToNull, trim } from '../common/dto.js';
import { queryBoolean } from '../groups/groups.dto.js';

export class DisciplineListQueryDto {
  @ApiPropertyOptional({ description: 'Показать и архивные дисциплины', default: false })
  @IsOptional()
  @Transform(queryBoolean)
  @IsBoolean()
  includeArchived = false;
}

export class DisciplineInputDto {
  @ApiProperty({ example: 'Математика' })
  @Transform(trim)
  @IsString({ message: 'Укажите название дисциплины' })
  @IsNotEmpty({ message: 'Укажите название дисциплины' })
  @MaxLength(200, { message: 'Не более 200 символов' })
  name: string;

  @ApiPropertyOptional({ nullable: true, type: String, example: 'ООД 05' })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(50, { message: 'Не более 50 символов' })
  code?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(2000, { message: 'Не более 2000 символов' })
  description?: string | null;
}

export class RefDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
}

export class PersonRefDto {
  @ApiProperty() id: string;
  @ApiProperty() fullName: string;
}

export class DisciplineResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ nullable: true, type: String }) code: string | null;
  @ApiProperty({ nullable: true, type: String }) description: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) archivedAt: string | null;
  @ApiProperty({ type: [RefDto], description: 'Группы из действующих закреплений' })
  groups: RefDto[];
  @ApiProperty({ type: [PersonRefDto], description: 'Преподаватели из действующих закреплений' })
  teachers: PersonRefDto[];
}

export class TeacherAssignmentListQueryDto {
  @ApiPropertyOptional({ description: 'Показать и снятые закрепления', default: false })
  @IsOptional()
  @Transform(queryBoolean)
  @IsBoolean()
  includeEnded = false;
}

export class TeacherAssignmentInputDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('7', { message: 'Выберите преподавателя' })
  teacherId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('7', { message: 'Выберите группу' })
  groupId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('7', { message: 'Выберите дисциплину' })
  disciplineId: string;
}

export class TeacherAssignmentResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ type: PersonRefDto }) teacher: PersonRefDto;
  @ApiProperty({ type: RefDto }) group: RefDto;
  @ApiProperty({ type: RefDto }) discipline: RefDto;
  @ApiProperty({ format: 'date-time' }) startsAt: string;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) endsAt: string | null;
}
