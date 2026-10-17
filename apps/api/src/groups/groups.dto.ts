import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { trim } from '../common/dto.js';

/** Флаг из строки запроса: `true`/`1` — да. */
export const queryBoolean = ({ value }: { value: unknown }) =>
  value === true || value === 'true' || value === '1';

export class GroupListQueryDto {
  @ApiPropertyOptional({ description: 'Показать и архивные группы', default: false })
  @IsOptional()
  @Transform(queryBoolean)
  @IsBoolean()
  includeArchived = false;
}

export class GroupInputDto {
  @ApiProperty({ example: 'ПО-21' })
  @Transform(trim)
  @IsString({ message: 'Укажите название группы' })
  @IsNotEmpty({ message: 'Укажите название группы' })
  @MaxLength(50, { message: 'Не более 50 символов' })
  name: string;

  @ApiProperty({ example: 2, minimum: 1, maximum: 6 })
  @Type(() => Number)
  @IsInt({ message: 'Курс — целое число' })
  @Min(1, { message: 'Курс от 1 до 6' })
  @Max(6, { message: 'Курс от 1 до 6' })
  course: number;

  @ApiProperty({ example: 'Программное обеспечение' })
  @Transform(trim)
  @IsString({ message: 'Укажите специальность' })
  @IsNotEmpty({ message: 'Укажите специальность' })
  @MaxLength(200, { message: 'Не более 200 символов' })
  specialty: string;
}

export class GroupRefDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() course: number;
  @ApiProperty() specialty: string;
}

export class GroupResponseDto extends GroupRefDto {
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) archivedAt: string | null;
  @ApiProperty({ description: 'Студентов в группе (без архивных)' }) studentCount: number;
}
