import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LOGIN_PATTERN, Permission, RoleCode, STAFF_ROLES } from '@iot/shared';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { emptyToNull, ReasonDto, trim } from '../common/dto.js';

export { ReasonDto };

export class UserListQueryDto {
  @ApiPropertyOptional({ description: 'Поиск по ФИО, логину и e-mail' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: Object.values(RoleCode) })
  @IsOptional()
  @IsIn(Object.values(RoleCode), { message: 'Неизвестная роль' })
  role?: RoleCode;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'BLOCKED', 'ARCHIVED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'BLOCKED', 'ARCHIVED'], { message: 'Неизвестный статус' })
  status?: 'ACTIVE' | 'BLOCKED' | 'ARCHIVED';

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

class UserProfileFieldsDto {
  @ApiProperty({ example: 'Иванова' })
  @Transform(trim)
  @IsString({ message: 'Укажите фамилию' })
  @IsNotEmpty({ message: 'Укажите фамилию' })
  @MaxLength(100, { message: 'Не более 100 символов' })
  lastName: string;

  @ApiProperty({ example: 'Анна' })
  @Transform(trim)
  @IsString({ message: 'Укажите имя' })
  @IsNotEmpty({ message: 'Укажите имя' })
  @MaxLength(100, { message: 'Не более 100 символов' })
  firstName: string;

  @ApiPropertyOptional({ nullable: true, type: String, example: 'Сергеевна' })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(100, { message: 'Не более 100 символов' })
  middleName?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, example: 'a.ivanova@college.kz' })
  @IsOptional()
  @Transform(emptyToNull)
  @IsEmail({}, { message: 'Некорректный адрес электронной почты' })
  @MaxLength(254)
  email?: string | null;
}

export class CreateUserDto extends UserProfileFieldsDto {
  @ApiProperty({
    example: 'a.ivanova',
    description: 'Латинские буквы, цифры, точка, дефис, подчёркивание',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString({ message: 'Укажите логин' })
  @Matches(LOGIN_PATTERN, {
    message: 'Логин: 3–64 символа, латинские буквы, цифры, точка, дефис, подчёркивание',
  })
  login: string;

  @ApiProperty({ enum: STAFF_ROLES, isArray: true })
  @IsArray({ message: 'Выберите хотя бы одну роль' })
  @ArrayMinSize(1, { message: 'Выберите хотя бы одну роль' })
  @IsIn(STAFF_ROLES, {
    each: true,
    message: 'Эту роль нельзя назначить в разделе «Администрирование»',
  })
  roles: RoleCode[];
}

export class UpdateUserDto extends UserProfileFieldsDto {}

export class SetRolesDto {
  @ApiProperty({ enum: STAFF_ROLES, isArray: true })
  @IsArray({ message: 'Выберите хотя бы одну роль' })
  @ArrayMinSize(1, { message: 'Выберите хотя бы одну роль' })
  @IsIn(STAFF_ROLES, {
    each: true,
    message: 'Эту роль нельзя назначить в разделе «Администрирование»',
  })
  roles: RoleCode[];
}

export class GrantPermissionDto extends ReasonDto {
  @ApiProperty({ enum: Object.values(Permission) })
  @IsIn(Object.values(Permission), { message: 'Неизвестное разрешение' })
  permission: Permission;

  @ApiPropertyOptional({
    description: 'Срок действия разрешения (ISO 8601); без срока — бессрочно',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Некорректная дата окончания действия' })
  expiresAt?: string;
}

export class GrantedPermissionDto {
  @ApiProperty({ enum: Object.values(Permission) }) permission: Permission;
  @ApiProperty() description: string;
  @ApiProperty() reason: string;
  @ApiProperty({ nullable: true, type: Date }) expiresAt: Date | null;
  @ApiProperty() grantedAt: Date;
  @ApiProperty({ nullable: true, type: String }) grantedByName: string | null;
}

export class UserSummaryDto {
  @ApiProperty() id: string;
  @ApiProperty() login: string;
  @ApiProperty() lastName: string;
  @ApiProperty() firstName: string;
  @ApiProperty({ nullable: true, type: String }) middleName: string | null;
  @ApiProperty({ nullable: true, type: String }) email: string | null;
  @ApiProperty({ enum: ['ACTIVE', 'BLOCKED', 'ARCHIVED'] }) status: string;
  @ApiProperty({ enum: Object.values(RoleCode), isArray: true }) roles: RoleCode[];
  @ApiProperty({ nullable: true, type: Date, description: 'Вход временно заблокирован до' })
  lockedUntil: Date | null;
  @ApiProperty({ nullable: true, type: Date }) lastLoginAt: Date | null;
  @ApiProperty() mustChangePassword: boolean;
  @ApiProperty() createdAt: Date;
}

export class UserDetailsDto extends UserSummaryDto {
  @ApiProperty({
    type: [GrantedPermissionDto],
    description: 'Индивидуальные разрешения сверх ролей',
  })
  grantedPermissions: GrantedPermissionDto[];
  @ApiProperty({ enum: Object.values(Permission), isArray: true, description: 'Итоговые права' })
  effectivePermissions: Permission[];
}

export class UserPageDto {
  @ApiProperty({ type: [UserSummaryDto] }) items: UserSummaryDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() pageSize: number;
}

export class TemporaryPasswordDto {
  @ApiProperty({ type: UserDetailsDto }) user: UserDetailsDto;
  @ApiProperty({
    description:
      'Временный пароль. Показывается один раз; при входе пользователь обязан его сменить',
  })
  temporaryPassword: string;
}

export class RoleDto {
  @ApiProperty({ enum: Object.values(RoleCode) }) code: RoleCode;
  @ApiProperty() name: string;
  @ApiProperty({ nullable: true, type: String }) description: string | null;
  @ApiProperty({ enum: Object.values(Permission), isArray: true }) permissions: Permission[];
}

export class PermissionDto {
  @ApiProperty({ enum: Object.values(Permission) }) code: Permission;
  @ApiProperty() description: string;
  @ApiProperty({ description: 'Выдаётся только индивидуально с основанием' }) sensitive: boolean;
}
