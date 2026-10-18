import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { SAFE_URL_HINT, SAFE_URL_PATTERN } from '@iot/shared';
import { IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

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

export function RequiredTitle(message: string, max = 300) {
  return function (target: object, property: string) {
    Transform(trim)(target, property);
    IsString({ message })(target, property);
    IsNotEmpty({ message })(target, property);
    MaxLength(max, { message: `Не более ${max} символов` })(target, property);
  };
}

/** Необязательная строка: пустое значение сохраняется как null. */
export function OptionalText(max: number) {
  return function (target: object, property: string) {
    IsOptional()(target, property);
    Transform(emptyToNull)(target, property);
    IsString({ message: 'Ожидается текст' })(target, property);
    MaxLength(max, { message: `Не более ${max} символов` })(target, property);
  };
}

/** Необязательная ссылка: только http и https (защита от javascript: и data:). */
export function OptionalUrl() {
  return function (target: object, property: string) {
    OptionalText(2000)(target, property);
    Matches(SAFE_URL_PATTERN, { message: SAFE_URL_HINT })(target, property);
  };
}

export function OptionalUuid(message: string) {
  return function (target: object, property: string) {
    IsOptional()(target, property);
    Transform(emptyToNull)(target, property);
    IsUUID('7', { message })(target, property);
  };
}
