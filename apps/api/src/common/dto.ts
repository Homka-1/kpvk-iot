import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Обрезка пробелов у строковых полей. */
export const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Пустая строка после обрезки пробелов — null (необязательные поля форм). */
export const emptyToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

export class ReasonDto {
  @ApiProperty({ description: 'Причина действия (сохраняется в журнале аудита)' })
  @Transform(trim)
  @IsString({ message: 'Укажите причину' })
  @IsNotEmpty({ message: 'Укажите причину' })
  @MaxLength(500, { message: 'Не более 500 символов' })
  reason: string;
}
