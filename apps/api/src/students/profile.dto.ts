import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { INTERESTS_MAX, OBSERVATION_TEXT_MAX, Visibility } from '@iot/shared';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { emptyToNull, trim } from '../common/dto.js';
import { PersonRefDto, RefDto } from '../disciplines/disciplines.dto.js';
import { GroupRefDto } from '../groups/groups.dto.js';
import { StudentDetailsResponseDto } from './students.dto.js';

const VISIBILITY_VALUES = Object.values(Visibility);

class ObservationFieldsDto {
  @ApiProperty({ description: 'Дата наблюдения, YYYY-MM-DD; не позже сегодняшней' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Укажите дату наблюдения' })
  observedAt: string;

  @ApiProperty({ maxLength: OBSERVATION_TEXT_MAX })
  @Transform(trim)
  @IsString({ message: 'Опишите наблюдение' })
  @IsNotEmpty({ message: 'Опишите наблюдение' })
  @MaxLength(OBSERVATION_TEXT_MAX, { message: `Не более ${OBSERVATION_TEXT_MAX} символов` })
  text: string;

  @ApiProperty({
    enum: VISIBILITY_VALUES,
    description: 'INTERNAL — только преподавателям (FR-016); STUDENT_VISIBLE — видно студенту',
  })
  @IsIn(VISIBILITY_VALUES, { message: 'Выберите, кому видно наблюдение' })
  visibility: Visibility;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    format: 'uuid',
    description: 'Дисциплина, к которой относится наблюдение',
  })
  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID('7', { message: 'Неизвестная дисциплина' })
  disciplineId?: string | null;
}

export class CreateObservationDto extends ObservationFieldsDto {}

export class UpdateObservationDto extends ObservationFieldsDto {}

export class UpdateInterestsDto {
  @ApiProperty({ maxLength: INTERESTS_MAX, description: 'Пустая строка очищает поле' })
  @Transform(trim)
  @IsString({ message: 'Укажите интересы' })
  @MaxLength(INTERESTS_MAX, { message: `Не более ${INTERESTS_MAX} символов` })
  interests: string;
}

// ── Ответы ──

class ProfileDisciplineResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ type: [PersonRefDto] }) teachers: PersonRefDto[];
}

export class StudentProfileResponseDto extends StudentDetailsResponseDto {
  @ApiProperty({ nullable: true, type: String, description: 'Интересы, указанные студентом' })
  interests: string | null;
  @ApiProperty({
    type: [ProfileDisciplineResponseDto],
    description: 'Дисциплины текущей группы и их преподаватели',
  })
  disciplines: ProfileDisciplineResponseDto[];
}

export class ObservationResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ description: 'YYYY-MM-DD' }) observedAt: string;
  @ApiProperty() text: string;
  @ApiProperty({ enum: VISIBILITY_VALUES }) visibility: Visibility;
  @ApiProperty({ nullable: true, type: RefDto }) discipline: RefDto | null;
  @ApiProperty({ type: PersonRefDto }) author: PersonRefDto;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ format: 'date-time' }) updatedAt: string;
  @ApiProperty({ description: 'Изменять может только автор' }) canEdit: boolean;
}

class StudentVisibleObservationResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ description: 'YYYY-MM-DD' }) observedAt: string;
  @ApiProperty() text: string;
  @ApiProperty({ nullable: true, type: RefDto }) discipline: RefDto | null;
  @ApiProperty({ type: PersonRefDto }) author: PersonRefDto;
}

export class StudentHistoryItemResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ format: 'date-time' }) at: string;
  @ApiProperty({ description: 'Код действия журнала аудита' }) action: string;
  @ApiProperty() label: string;
  @ApiProperty({ nullable: true, type: PersonRefDto }) actor: PersonRefDto | null;
  @ApiProperty({ nullable: true, type: String }) reason: string | null;
}

export class OwnProfileResponseDto {
  @ApiProperty() participantCode: string;
  @ApiProperty() lastName: string;
  @ApiProperty() firstName: string;
  @ApiProperty({ nullable: true, type: String }) middleName: string | null;
  @ApiProperty({ nullable: true, type: GroupRefDto }) group: GroupRefDto | null;
  @ApiProperty({ type: [ProfileDisciplineResponseDto] })
  disciplines: ProfileDisciplineResponseDto[];
  @ApiProperty({ nullable: true, type: String }) interests: string | null;
  @ApiProperty({
    type: [StudentVisibleObservationResponseDto],
    description: 'Только наблюдения, открытые студенту; служебные заметки не передаются (FR-016)',
  })
  observations: StudentVisibleObservationResponseDto[];
}
